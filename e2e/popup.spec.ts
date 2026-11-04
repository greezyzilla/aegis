import type { Page } from '@playwright/test';
import { ALL_SCRIPTS, block, DEFAULTS, expect, rule, test } from './fixtures';

/** Clicks Reload in the popup and waits for the target tab to finish reloading. */
async function reloadFromPopup(popup: Page, target: Page) {
  await expect(popup.getByRole('status').filter({ hasText: /reload/i })).toBeVisible();
  await Promise.all([target.waitForEvent('load'), popup.getByRole('button', { name: /^Reload/ }).click()]);
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
    // Still listed under "Script jalan", but no longer as blocked.
    await expect(popup.getByRole('region', { name: /Keblok di halaman ini/ }).getByRole('button', { name: /^cdn\.test \d/ })).toHaveCount(0);
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

  test('active and inline toggles apply to the current site', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings({ ...DEFAULTS, activeSites: ['shop.test'] });
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('switch', { name: 'Izinkan inline script di shop.test' }).click();
    await expect.poll(async () => (await getSettings()).inlineSites).toEqual(['shop.test']);
    await reloadFromPopup(popup, site);
    expect(await ran(site)).toEqual({ inline: true, loaded: [] });

    const active = popup.getByRole('switch', { name: 'Aktifkan blokir di shop.test' });
    await active.click();
    await expect(active).toHaveAttribute('aria-checked', 'false');
    await expect(popup.getByRole('switch', { name: 'Izinkan inline script di shop.test' })).toHaveCount(0);
    await expect.poll(async () => (await getSettings()).activeSites).toEqual([]);
    await reloadFromPopup(popup, site);
    expect((await ran(site)).loaded).toHaveLength(5);

    await active.click();
    await expect.poll(async () => (await getSettings()).activeSites).toEqual(['shop.test']);
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

  test('inactive site: only "Script jalan", and a script can be blocked on every site', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await expect(popup.getByRole('switch', { name: 'Aktifkan blokir di shop.test' })).toHaveAttribute('aria-checked', 'false');
    await expect(popup.getByRole('heading', { name: /Keblok di halaman ini/ })).toHaveCount(0);
    await expect(popup.getByText('Belum ada blok global yang kena di halaman ini.')).toBeVisible();

    await popup.getByRole('button', { name: 'Blok other.test di semua situs' }).click();
    await expect.poll(async () => (await getSettings()).blocks.map((b) => [b.domain, b.script])).toEqual([['other.test', undefined]]);
    await expect(popup.locator('.loaded-host', { hasText: 'other.test' })).toContainText('diblok');
    await reloadFromPopup(popup, site);

    const withoutOther = ALL_SCRIPTS('shop.test').map((s) => s.replace('shop.test', 'www.shop.test')).filter((s) => s !== 'other.test/d.js');
    expect((await ran(site)).loaded).toEqual(withoutOther.sort());
    await expect(popup.locator('.block-rule', { hasText: 'other.test' })).toContainText('1 keblok');

    await popup.getByRole('button', { name: 'Hapus blok other.test' }).click();
    await reloadFromPopup(popup, site);
    expect((await ran(site)).loaded).toHaveLength(5);
  });

  test('globally blocked scripts on an active site are not offered for allowing', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, blocks: [block('other.test')] });
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await expect(popup.getByRole('button', { name: /^cdn\.test 2$/ })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^other\.test \d/ })).toHaveCount(0);
    await expect(popup.locator('.block-rule', { hasText: 'other.test' })).toContainText('1 keblok');
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

  test('a single file can be blocked globally from "Script jalan"', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const site = await visit('site-a.test');
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: /^cdn\.test 2$/ }).click();
    await popup.getByRole('button', { name: 'Blok b.js di semua situs' }).click();
    await expect.poll(async () => (await getSettings()).blocks.map((b) => [b.domain, b.script])).toEqual([['cdn.test', 'b.js']]);
    await expect(popup.locator('.loaded-host .file', { hasText: 'b.js' })).toContainText('diblok');
    await expect(popup.locator('.loaded-host .file', { hasText: 'a.js' }).getByRole('button', { name: 'Blok a.js di semua situs' })).toBeVisible();
    await expect(popup.locator('.block-rule', { hasText: 'cdn.test' })).toContainText('berlaku setelah reload');
    await reloadFromPopup(popup, site);

    expect((await ran(site)).loaded).toEqual(ALL_SCRIPTS('site-a.test').filter((s) => s !== 'cdn.test/lib/b.js'));
    expect((await ran(await visit('site-b.test'))).loaded).not.toContain('cdn.test/lib/b.js');
  });

  test('an allowed script on an active site can still be blocked globally', async ({ setSettings, visit, openPopup, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test')] });
    const site = await visit('www.shop.test');
    expect((await ran(site)).loaded).toHaveLength(3);
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: /^Script jalan/ }).click();
    await popup.getByRole('button', { name: 'Blok cdn.test di semua situs' }).click();
    await reloadFromPopup(popup, site);
    // The block covers subdomains too, like every domain rule.
    expect((await ran(site)).loaded).toEqual([]);
    await expect(popup.locator('.block-rule', { hasText: 'cdn.test' })).toContainText('3 keblok');
    // Still listed as allowed: the allow rule exists, the block simply wins.
    await expect(popup.locator('.rule', { hasText: 'cdn.test' })).toBeVisible();
  });

  test('activating a subdomain stores that subdomain; www is stripped', async ({ setSettings, visit, openPopup, getSettings }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const blog = await openPopup(await visit('blog.shop.test'));
    await blog.getByRole('switch', { name: 'Aktifkan blokir di blog.shop.test' }).click();
    await expect.poll(async () => (await getSettings()).activeSites).toEqual(['blog.shop.test']);

    const www = await openPopup(await visit('www.news.test'));
    await www.getByRole('switch', { name: 'Aktifkan blokir di news.test' }).click();
    await expect.poll(async () => (await getSettings()).activeSites).toEqual(['blog.shop.test', 'news.test']);
  });

  test('turning a site off from a subdomain removes the parent entry covering it', async ({ setSettings, visit, openPopup, getSettings }) => {
    await setSettings({ ...DEFAULTS, activeSites: ['shop.test', 'other-site.test'] });
    const popup = await openPopup(await visit('blog.shop.test'));
    const toggle = popup.getByRole('switch', { name: 'Aktifkan blokir di blog.shop.test' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect.poll(async () => (await getSettings()).activeSites).toEqual(['other-site.test']);
  });

  test('badge counts global blocks on an inactive site', async ({ setSettings, visit, sw, tabIdOf }) => {
    await setSettings({ ...DEFAULTS, activeSites: [], blocks: [block('cdn.test')] });
    const site = await visit('site-a.test');
    const tabId = await tabIdOf(site);
    await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('3');
  });

  test('on an inactive site the badge ignores scripts blocked by another blocker', async ({ setSettings, context, visit, openPopup, sw, tabIdOf }) => {
    await setSettings({ ...DEFAULTS, activeSites: [], blocks: [block('cdn.test')] });
    // Stands in for Brave Shields: fails the request with the same net::ERR_BLOCKED_BY_CLIENT.
    await context.route(/other\.test/, (route) => route.abort('blockedbyclient'));
    const site = await visit('site-a.test');
    const tabId = await tabIdOf(site);
    const popup = await openPopup(site);

    await expect(popup.locator('.block-rule', { hasText: 'cdn.test' })).toContainText('3 keblok');
    await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('3');
  });

  test('on an active site the badge counts every blocked script, and the popup lists them', async ({ setSettings, context, visit, openPopup, sw, tabIdOf }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('other.test')] });
    await context.route(/other\.test/, (route) => route.abort('blockedbyclient'));
    const site = await visit('site-a.test');
    const tabId = await tabIdOf(site);
    const popup = await openPopup(site);

    await expect(popup.getByRole('button', { name: /^other\.test 1$/ })).toBeVisible();
    await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('5');
  });

  test('activating a site and closing the popup reloads the tab with blocking on', async ({ setSettings, visit, openPopup, ran }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const site = await visit('www.shop.test');
    expect((await ran(site)).loaded).toHaveLength(5);
    const popup = await openPopup(site);

    await popup.getByRole('switch', { name: 'Aktifkan blokir di shop.test' }).click();
    await expect(popup.getByRole('heading', { name: /Keblok di halaman ini/ })).toBeVisible();
    await Promise.all([site.waitForEvent('load'), popup.close()]);
    expect(await ran(site)).toEqual({ inline: false, loaded: [] });
  });

  test('clicking Reload in the popup means closing it does not reload again', async ({ setSettings, visit, openPopup }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);
    let loads = 0;
    site.on('load', () => loads++);

    await popup.getByRole('button', { name: 'Izinkan cdn.test di semua situs' }).click();
    await reloadFromPopup(popup, site);
    expect(loads).toBe(1);
    await popup.close();
    await site.waitForTimeout(1000);
    expect(loads).toBe(1);
  });

  test('a change after Reload is reloaded again on close', async ({ setSettings, visit, openPopup }) => {
    await setSettings(DEFAULTS);
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: 'Izinkan cdn.test di semua situs' }).click();
    await reloadFromPopup(popup, site);
    await popup.getByRole('button', { name: 'Izinkan other.test di semua situs' }).click();
    await expect(popup.getByText('Tab di-reload saat ditutup.')).toBeVisible();
    await Promise.all([site.waitForEvent('load'), popup.close()]);
  });

  test('header sums up the page like the badge, per mode', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test')] });
    const active = await openPopup(await visit('www.shop.test'));
    await expect(active.locator('.site-summary')).toHaveText('2 keblok · 3 lolos');

    await setSettings({ ...DEFAULTS, activeSites: [], blocks: [block('other.test')] });
    const inactive = await openPopup(await visit('site-a.test'));
    await expect(inactive.locator('.site-summary')).toHaveText('1 diblok global · 4 jalan');
  });

  test('on an active site "Script jalan" starts folded and "Diblok global" hides when empty', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test')] });
    const popup = await openPopup(await visit('www.shop.test'));

    const toggle = popup.getByRole('button', { name: /^Script jalan 3$/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(popup.getByRole('button', { name: 'Blok cdn.test di semua situs' })).toHaveCount(0);
    await toggle.click();
    await expect(popup.getByRole('button', { name: 'Blok cdn.test di semua situs' })).toBeVisible();
    await expect(popup.getByRole('heading', { name: 'Diblok global' })).toHaveCount(0);
    await expect(popup.getByText('Izinkan di')).toBeVisible();
  });

  test('with auto-reload off the notice asks for a manual reload', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, autoReload: false });
    const site = await visit('www.shop.test');
    const popup = await openPopup(site);

    await popup.getByRole('button', { name: 'Izinkan cdn.test di semua situs' }).click();
    await expect(popup.getByText('Perubahan berlaku setelah reload.')).toBeVisible();
    await Promise.all([site.waitForEvent('load'), popup.getByRole('button', { name: 'Reload', exact: true }).click()]);
  });

  test('the reload notice stays in view while the list is scrolled', async ({ setSettings, visit, openPopup }) => {
    await setSettings(DEFAULTS);
    const popup = await openPopup(await visit('stream.test', '/embed'));
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.getByRole('button', { name: 'Izinkan cdn.test di semua situs' }).click();
    const notice = popup.locator('.reload');
    await popup.locator('.popup').evaluate((el) => el.scrollTo(0, 0));
    const box = await notice.boundingBox();
    const main = await popup.locator('.popup').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(main!.y + main!.height);
  });
});
