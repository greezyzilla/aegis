import fs from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { DEFAULTS, expect, rule, test } from './fixtures';

async function openOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('heading', { name: 'Tambah rule' }).waitFor();
  return page.getByRole('heading', { name: 'Tambah rule' }).locator('..');
}

test.describe('options page', () => {
  test('adding a rule installs it and lets the script run', async ({ setSettings, context, extensionId, visit, ran, sw }) => {
    await setSettings(DEFAULTS);
    const page = await context.newPage();
    const form = await openOptions(page, extensionId);

    await form.getByLabel('Domain script').fill('https://CDN.test/whatever');
    await form.getByLabel('Nama script').fill('a.js');
    await form.getByRole('button', { name: 'Tambah' }).click();

    await expect(page.getByRole('row', { name: /cdn\.test a\.js Global/ })).toBeVisible();
    await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length)).toBe(3);
    expect((await ran(await visit('site-a.test'))).loaded).toEqual(['cdn.test/lib/a.js']);
  });

  test('invalid input shows errors and saves nothing', async ({ setSettings, context, extensionId, getSettings }) => {
    await setSettings(DEFAULTS);
    const page = await context.newPage();
    const form = await openOptions(page, extensionId);

    await form.getByLabel('Domain script').fill('not a domain');
    await form.getByLabel('Berlaku di').selectOption('site');
    await form.getByRole('button', { name: 'Tambah' }).click();

    await expect(page.getByText('Domain nggak valid')).toBeVisible();
    await expect(page.getByText('Situs nggak valid')).toBeVisible();
    await expect(form.getByLabel('Domain script')).toHaveAttribute('aria-invalid', 'true');
    expect((await getSettings()).rules).toEqual([]);
  });

  test('editing a rule to a site scope changes where it applies', async ({ setSettings, context, extensionId, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('other.test')] });
    const page = await context.newPage();
    await openOptions(page, extensionId);

    await page.getByRole('row', { name: /other\.test/ }).getByRole('button', { name: 'Edit' }).click();
    const editRow = page.locator('tbody tr').first();
    await editRow.getByLabel('Berlaku di').selectOption('site');
    await editRow.getByLabel('Situs', { exact: true }).fill('site-a.test');
    await editRow.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByRole('row', { name: /other\.test semua site-a\.test/ })).toBeVisible();

    await expect.poll(async () => (await ran(await visit('site-a.test'))).loaded).toEqual(['other.test/d.js']);
    expect((await ran(await visit('site-b.test'))).loaded).toEqual([]);
  });

  test('deleting a rule blocks the script again', async ({ setSettings, context, extensionId, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test')] });
    const page = await context.newPage();
    await openOptions(page, extensionId);

    await page.getByRole('button', { name: 'Hapus rule cdn.test' }).click();
    await expect(page.getByText('Belum ada rule.')).toBeVisible();
    await expect.poll(async () => (await ran(await visit('site-a.test'))).loaded).toEqual([]);
  });

  test('search and scope filter narrow the table', async ({ setSettings, context, extensionId }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test'), rule('other.test', 'site-a.test'), rule('x.test', 'site-b.test')] });
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const rows = page.locator('tbody tr');

    await expect(rows).toHaveCount(3);
    await page.getByLabel('Cari rule').fill('other');
    await expect(rows).toHaveCount(1);
    await page.getByLabel('Cari rule').fill('');
    await page.getByLabel('Filter berlaku di').selectOption('global');
    await expect(rows).toHaveCount(1);
    await page.getByLabel('Filter berlaku di').selectOption('site-b.test');
    await expect(rows).toContainText('x.test');
  });

  test('paused and inline sites can be removed', async ({ setSettings, context, extensionId, getSettings }) => {
    await setSettings({ ...DEFAULTS, pausedSites: ['news.test'], inlineSites: ['github.test'] });
    const page = await context.newPage();
    await openOptions(page, extensionId);

    await page.getByRole('button', { name: 'Hapus news.test' }).click();
    await page.getByRole('button', { name: 'Hapus github.test' }).click();
    await expect.poll(async () => {
      const s = await getSettings();
      return [s.pausedSites, s.inlineSites];
    }).toEqual([[], []]);
  });

  test('export then import restores rules into a clean profile', async ({ setSettings, context, extensionId, getSettings }, testInfo) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test', 'global', 'a.js'), rule('other.test', 'site-a.test')], pausedSites: ['news.test'] });
    const page = await context.newPage();
    await openOptions(page, extensionId);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({ app: 'aegis', version: 1 });

    await setSettings(DEFAULTS);
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByText('2 rule dibaca')).toBeVisible();
    const s = await getSettings();
    expect(s.rules.map((r) => [r.domain, r.scope, r.script])).toEqual([
      ['cdn.test', 'global', 'a.js'],
      ['other.test', 'site-a.test', undefined],
    ]);
    expect(s.pausedSites).toEqual(['news.test']);
  });
});
