import type { Page } from '@playwright/test';
import { DEFAULTS, expect, rule, test } from './fixtures';

/** Clicks Reload in the popup and waits for the target tab to finish reloading. */
async function reloadFromPopup(popup: Page, target: Page) {
  await expect(popup.getByText('Perubahan berlaku setelah reload.')).toBeVisible();
  await Promise.all([target.waitForEvent('load'), popup.getByRole('button', { name: 'Reload' }).click()]);
}

test.describe('popup', () => {
  test('lists blocked scripts grouped by domain, with a badge count', async ({ setSettings, visit, openPopup, sw, tabIdOf }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await expect(popup.getByText('www.shop.test').first()).toBeVisible();
    for (const host of ['www.shop.test', 'cdn.test', 'sub.cdn.test', 'other.test']) {
      await expect(popup.getByRole('button', { name: new RegExp(`^${host.replace(/\./g, '\\.')} \\d+$`) })).toBeVisible();
    }
    await expect(popup.getByRole('button', { name: /^cdn\.test 2$/ })).toBeVisible();

    const tabId = await tabIdOf(site);
    await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('5');
  });

  test('"Global" on a domain allows it after reload, on every site', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: 'Izinkan cdn.test di semua situs' }).click();
    await expect.poll(async () => (await getSettings()).rules.map((r) => [r.domain, r.scope, r.script])).toEqual([
      ['cdn.test', 'global', undefined],
    ]);
    await reloadFromPopup(popup, site);

    // A domain rule also covers its subdomains (sub.cdn.test).
    const cdn = ['cdn.test/lib/a.js', 'cdn.test/lib/b.js', 'sub.cdn.test/c.js'];
    expect((await ran(site)).loaded).toEqual(cdn);
    expect((await ran(await visit('elsewhere.test'))).loaded).toEqual(cdn);
    await expect(popup.getByRole('button', { name: /^cdn\.test \d/ })).toHaveCount(0);
    await expect(popup.locator('.rule', { hasText: 'cdn.test' })).toContainText('Global');
  });

  test('"Situs ini" on a single file allows only that file, only on this site', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: /^cdn\.test 2$/ }).click();
    await popup.getByRole('button', { name: 'Izinkan b.js di situs ini' }).click();
    await expect.poll(async () => (await getSettings()).rules.map((r) => [r.domain, r.scope, r.script])).toEqual([
      ['cdn.test', 'shop.test', 'b.js'],
    ]);
    await expect(popup.locator('.file', { hasText: 'b.js' })).toContainText('diizinkan');
    await expect(popup.locator('.file', { hasText: 'a.js' }).getByRole('button', { name: 'Situs ini' })).toBeVisible();
    await reloadFromPopup(popup, site);

    expect((await ran(site)).loaded).toEqual(['cdn.test/lib/b.js']);
    expect((await ran(await visit('elsewhere.test'))).loaded).toEqual([]);
  });

  test('pause and inline toggles apply to the current site', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('switch', { name: 'Izinkan inline script di shop.test' }).click();
    await expect.poll(async () => (await getSettings()).inlineSites).toEqual(['shop.test']);
    await reloadFromPopup(popup, site);
    expect(await ran(site)).toEqual({ inline: true, loaded: [] });

    await popup.getByRole('switch', { name: 'Jeda blokir di shop.test' }).click();
    await expect(popup.getByRole('switch', { name: 'Jeda blokir di shop.test' })).toHaveAttribute('aria-checked', 'true');
    await expect(popup.getByRole('switch', { name: 'Izinkan inline script di shop.test' })).toBeDisabled();
    await reloadFromPopup(popup, site);
    expect((await ran(site)).loaded).toHaveLength(5);

    await popup.getByRole('switch', { name: 'Jeda blokir di shop.test' }).click();
    await reloadFromPopup(popup, site);
    expect(await ran(site)).toEqual({ inline: true, loaded: [] });
  });

  test('removing a rule from "Diizinkan" blocks again after reload', async ({ setSettings, visit, openPopup, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test')] });
    const site = await visit('www.shop.test');
    expect((await ran(site)).loaded).toHaveLength(3);
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: 'Hapus rule cdn.test' }).click();
    await expect(popup.getByText('Belum ada rule yang berlaku di sini.')).toBeVisible();
    await reloadFromPopup(popup, site);
    expect((await ran(site)).loaded).toEqual([]);
  });

  test('master switch turns blocking off and on', async ({ setSettings, visit, openPopup, ran }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('switch', { name: 'Aktifkan blokir script' }).click();
    await expect(popup.getByText(/Blokir script lagi mati/)).toBeVisible();
    await reloadFromPopup(popup, site);
    expect(await ran(site)).toMatchObject({ inline: true });
    expect((await ran(site)).loaded).toHaveLength(5);

    await popup.getByRole('switch', { name: 'Aktifkan blokir script' }).click();
    await reloadFromPopup(popup, site);
    expect(await ran(site)).toEqual({ inline: false, loaded: [] });
  });

  test('non-http pages show a notice instead of site controls', async ({ setSettings, context, openPopup }) => {
    await setSettings(DEFAULTS);
    const blank = await context.newPage();
    await blank.goto('about:blank');
    await blank.goto('data:text/html,<p>hi</p>');
    const popup = await openPopup(blank).catch(() => null);
    test.skip(!popup, 'data: tab not visible to tabs.query');
    await expect(popup!.getByText(/nggak bisa diatur/)).toBeVisible();
  });

  test('closing the popup after a change reloads the tab once', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: 'Izinkan cdn.test di semua situs' }).click();
    await expect.poll(async () => (await getSettings()).rules.length).toBe(1);
    await Promise.all([site.waitForEvent('load'), popup.close()]);

    expect((await ran(site)).loaded).toEqual(['cdn.test/lib/a.js', 'cdn.test/lib/b.js', 'sub.cdn.test/c.js']);
  });

  test('closing the popup without a change, or with auto-reload off, does not reload', async ({ setSettings, visit, openPopup, getSettings }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    let loads = 0;
    site.on('load', () => loads++);

    await (await openPopup(site)).close();

    await setSettings({ ...DEFAULTS, autoReload: false });
    const popup = await openPopup(site);
    await popup.getByRole('button', { name: 'Izinkan cdn.test di semua situs' }).click();
    await expect.poll(async () => (await getSettings()).rules.length).toBe(1);
    await popup.close();

    await site.waitForTimeout(1000);
    expect(loads).toBe(0);
  });
});
