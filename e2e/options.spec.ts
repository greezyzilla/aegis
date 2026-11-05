import fs from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { block, DEFAULTS, expect, rule, test } from './fixtures';

const LIST_URL = 'https://easylist.to/easylist/easyprivacy.txt';

const rulesSection = (page: Page) => page.getByRole('region', { name: /^Rule izin/ });

/** Opens the page and returns the add form at the top of "Rule izin". */
async function openOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await rulesSection(page).waitFor();
  return rulesSection(page).locator('form').first();
}

test.describe('options page', () => {
  test('auto-reload is on by default and can be turned off', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
  }) => {
    await setSettings(DEFAULTS);
    const page = await context.newPage();
    await openOptions(page, extensionId);

    const toggle = page.getByRole('switch', { name: 'Reload otomatis saat popup ditutup' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await getSettings()).autoReload).toBe(false);
  });

  test('adding a rule installs it and lets the script run', async ({
    setSettings,
    context,
    extensionId,
    visit,
    ran,
    sw,
  }) => {
    await setSettings(DEFAULTS);
    const page = await context.newPage();
    const form = await openOptions(page, extensionId);

    await form.getByLabel('Domain script').fill('https://CDN.test/whatever');
    await form.getByLabel('Nama script').fill('a.js');
    await form.getByRole('button', { name: 'Tambah' }).click();

    await expect(rulesSection(page).locator('.rule-item', { hasText: 'cdn.test / a.js' })).toBeVisible();
    await expect(rulesSection(page).locator('.scope-head .host-name')).toHaveText(['Semua situs']);
    await expect
      .poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length))
      .toBe(4);
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

  test('editing a rule to a site scope changes where it applies', async ({
    setSettings,
    context,
    extensionId,
    visit,
    ran,
  }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('other.test')] });
    const page = await context.newPage();
    await openOptions(page, extensionId);

    await page.getByRole('button', { name: 'Edit rule other.test' }).click();
    const editRow = rulesSection(page).locator('.edit');
    await editRow.getByLabel('Berlaku di').selectOption('site');
    await editRow.getByLabel('Situs', { exact: true }).fill('site-a.test');
    await editRow.getByRole('button', { name: 'Simpan' }).click();
    await expect(editRow).toHaveCount(0);
    await expect(rulesSection(page).locator('.scope-head .host-name')).toHaveText(['site-a.test']);

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

  test('search and scope filter narrow the list', async ({ setSettings, context, extensionId }) => {
    await setSettings({
      ...DEFAULTS,
      rules: [rule('cdn.test'), rule('other.test', 'site-a.test'), rule('x.test', 'site-b.test')],
    });
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const rows = rulesSection(page).locator('.rule-item');

    await expect(rows).toHaveCount(3);
    await page.getByLabel('Cari rule').fill('other');
    await expect(rows).toHaveCount(1);
    await page.getByLabel('Cari rule').fill('');
    await page.getByLabel('Filter berlaku di').selectOption('global');
    await expect(rows).toHaveCount(1);
    await page.getByLabel('Filter berlaku di').selectOption('site-b.test');
    await expect(rows).toContainText('x.test');
  });

  test('global blocks can be added and removed', async ({
    setSettings,
    context,
    extensionId,
    visit,
    ran,
    getSettings,
  }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const card = page.getByRole('region', { name: /^Blok global/ });

    await expect(card.getByLabel('Berlaku di')).toHaveCount(0);
    await card.getByLabel('Domain script').fill('https://Other.test/x');
    await card.getByRole('button', { name: 'Blok', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Hapus blok other.test' })).toBeVisible();
    expect((await getSettings()).blocks.map((b) => [b.domain, b.script])).toEqual([['other.test', undefined]]);
    await expect.poll(async () => (await ran(await visit('site-a.test'))).loaded).not.toContain('other.test/d.js');

    await card.getByRole('button', { name: 'Hapus blok other.test' }).click();
    await expect(card.getByText('Belum ada blok global.')).toBeVisible();
    await expect.poll(async () => (await ran(await visit('site-a.test'))).loaded).toContain('other.test/d.js');
  });

  test('global block form validates input and keeps the script name', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
  }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const card = page.getByRole('region', { name: /^Blok global/ });

    await card.getByLabel('Domain script').fill('not a domain');
    await card.getByLabel('Nama script').fill('bad name.js');
    await card.getByRole('button', { name: 'Blok', exact: true }).click();
    await expect(card.getByText('Domain nggak valid')).toBeVisible();
    await expect(card.getByText('Hanya karakter ASCII tanpa spasi')).toHaveCount(0); // spaces are stripped, not rejected
    expect((await getSettings()).blocks).toEqual([]);

    await card.getByLabel('Domain script').fill('ads.test');
    await card.getByLabel('Nama script').fill('pixel.js');
    await card.getByRole('button', { name: 'Blok', exact: true }).click();
    await expect(card.locator('.block-rule', { hasText: 'ads.test / pixel.js' })).toBeVisible();
    expect((await getSettings()).blocks.map((b) => [b.domain, b.script])).toEqual([['ads.test', 'pixel.js']]);

    // Same block again is ignored.
    await card.getByLabel('Domain script').fill('ads.test');
    await card.getByLabel('Nama script').fill('pixel.js');
    await card.getByRole('button', { name: 'Blok', exact: true }).click();
    await expect(card.locator('.block-rule')).toHaveCount(1);
  });

  test('a v1 backup imports through the page, ignoring paused sites', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
  }, testInfo) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const file = testInfo.outputPath('v1.json');
    await fs.writeFile(
      file,
      JSON.stringify({
        app: 'aegis',
        version: 1,
        rules: [{ domain: 'cdn.test', scope: 'global' }],
        pausedSites: ['a.test'],
        inlineSites: ['b.test'],
      }),
    );

    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByText('1 rule dibaca')).toBeVisible();
    const s = await getSettings();
    expect(s.rules.map((r) => r.domain)).toEqual(['cdn.test']);
    expect(s.activeSites).toEqual([]);
    expect(s.inlineSites).toEqual(['b.test']);
  });

  test('active sites can be added by hand, normalized like the popup', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
    visit,
    ran,
  }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const input = page.getByLabel('Tambah situs aktif');
    const card = input.locator('xpath=ancestor::section[1]');

    await input.fill('not a site');
    await card.getByRole('button', { name: 'Tambah' }).click();
    await expect(card.getByText('Situs nggak valid')).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await getSettings()).activeSites).toEqual([]);

    await input.fill('https://WWW.Site-A.test/path');
    await card.getByRole('button', { name: 'Tambah' }).click();
    await expect(card.getByRole('button', { name: 'Hapus site-a.test' })).toBeVisible();
    await expect(input).toHaveValue('');
    expect((await getSettings()).activeSites).toEqual(['site-a.test']);
    await expect.poll(async () => (await ran(await visit('www.site-a.test'))).loaded).toEqual([]);
  });

  test('sections follow the model: active sites and rules first, settings and backup last', async ({
    setSettings,
    context,
    extensionId,
  }) => {
    await setSettings(DEFAULTS);
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const titles = (await page.locator('.section-title').allTextContents()).map((t) => t.replace(/\d+$/, ''));
    expect(titles).toEqual([
      'Situs aktif',
      'Rule izin',
      'Blok global',
      'Daftar publik',
      'Inline script diizinkan',
      'Pengaturan',
      'Backup',
    ]);
  });

  test('active and inline sites can be removed', async ({ setSettings, context, extensionId, getSettings }) => {
    await setSettings({ ...DEFAULTS, activeSites: ['news.test'], inlineSites: ['github.test'] });
    const page = await context.newPage();
    await openOptions(page, extensionId);

    await page.getByRole('button', { name: 'Hapus news.test' }).click();
    await page.getByRole('button', { name: 'Hapus github.test' }).click();
    await expect
      .poll(async () => {
        const s = await getSettings();
        return [s.activeSites, s.inlineSites];
      })
      .toEqual([[], []]);
  });

  test('export then import restores rules into a clean profile', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
  }, testInfo) => {
    await setSettings(
      {
        ...DEFAULTS,
        rules: [rule('cdn.test', 'global', 'a.js'), rule('other.test', 'site-a.test')],
        blocks: [block('tracker.test')],
        activeSites: ['news.test'],
        lists: ['easyprivacy'],
        listAllow: ['cdn.test'],
      },
      { easyprivacy: { domains: ['tracker.test'], exceptions: [], updatedAt: 0, skipped: 0 } },
    );
    // The list is downloaded again on import, not carried in the file.
    await context.route(LIST_URL, (r) =>
      r.fulfill({ body: Array.from({ length: 1000 }, (_, i) => `||t${i}.example^`).join('\n') }),
    );
    const page = await context.newPage();
    await openOptions(page, extensionId);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({
      app: 'aegis',
      version: 3,
      lists: ['easyprivacy'],
      listAllow: ['cdn.test'],
    });

    await setSettings({ ...DEFAULTS, activeSites: [] });
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(
      page.getByText('3 rule dibaca dan digabung (duplikat dilewati). EasyPrivacy diaktifkan.'),
    ).toBeVisible();
    const s = await getSettings();
    expect(s.rules.map((r) => [r.domain, r.scope, r.script])).toEqual([
      ['cdn.test', 'global', 'a.js'],
      ['other.test', 'site-a.test', undefined],
    ]);
    expect(s.blocks.map((b) => b.domain)).toEqual(['tracker.test']);
    expect(s.activeSites).toEqual(['news.test']);
    expect([s.lists, s.listAllow]).toEqual([['easyprivacy'], ['cdn.test']]);
    await expect(page.getByRole('switch', { name: 'Aktifkan EasyPrivacy' })).toHaveAttribute('aria-checked', 'true');
  });

  test('importing a backup whose list cannot be downloaded says so and leaves it off', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
  }, testInfo) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    await context.route(LIST_URL, (r) => r.fulfill({ status: 503, body: 'down' }));
    const page = await context.newPage();
    await openOptions(page, extensionId);
    const file = testInfo.outputPath('v3.json');
    await fs.writeFile(
      file,
      JSON.stringify({
        app: 'aegis',
        version: 3,
        rules: [],
        blocks: [],
        activeSites: [],
        inlineSites: [],
        lists: ['easyprivacy'],
        listAllow: [],
      }),
    );

    await page.locator('input[type=file]').setInputFiles(file);
    await expect(
      page.getByRole('status').filter({ hasText: 'EasyPrivacy belum aktif: Gagal unduh EasyPrivacy: HTTP 503' }),
    ).toBeVisible();
    expect((await getSettings()).lists).toEqual([]);
  });

  test('the language picked in Settings applies to the options page, the popup and background errors', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
    visit,
    openPopup,
  }) => {
    await setSettings(DEFAULTS);
    await context.route(LIST_URL, (r) => r.fulfill({ status: 503, body: 'down' }));
    const page = await context.newPage();
    await openOptions(page, extensionId);

    await Promise.all([page.waitForEvent('load'), page.getByLabel('Bahasa', { exact: true }).selectOption('en')]);
    await expect(page.getByRole('region', { name: /^Allow rules/ })).toBeVisible();
    await expect(page).toHaveTitle('Aegis — Rules');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect((await getSettings()).lang).toBe('en');

    const popup = await openPopup(await visit('www.shop.test'));
    await expect(popup.locator('.section-title').first()).toHaveText('Blocked on this page');

    // Written by the background, which follows the same choice.
    await page.getByRole('switch', { name: 'Turn on EasyPrivacy' }).click();
    await expect(page.getByRole('alert')).toHaveText("Couldn't download EasyPrivacy: HTTP 503");

    await Promise.all([page.waitForEvent('load'), page.getByLabel('Language', { exact: true }).selectOption('auto')]);
    await expect(page.getByRole('region', { name: /^Rule izin/ })).toBeVisible();
    expect('lang' in (await getSettings())).toBe(false);
  });
});
