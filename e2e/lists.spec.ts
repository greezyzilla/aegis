import type { Page } from '@playwright/test';
import type { ListData } from '../lib/lists';
import { ALL_SCRIPTS, DEFAULTS, expect, test } from './fixtures';

const LIST_URL = 'https://easylist.to/easylist/easyprivacy.txt';

/** cdn.test is listed, sub.cdn.test is one of the list's own exceptions. */
const LIST: ListData = {
  domains: ['cdn.test', 'tracker.test'],
  exceptions: ['sub.cdn.test'],
  updatedAt: 0,
  skipped: 0,
};
const ON = { ...DEFAULTS, activeSites: [], lists: ['easyprivacy'] };

/** A downloadable EasyPrivacy stand-in: enough domains to pass the size check, plus cdn.test. */
const fakeList = (extra = '') =>
  ['[Adblock Plus 1.1]', '||cdn.test^', '@@||sub.cdn.test^', 'example.com##.ad', extra]
    .concat(Array.from({ length: 1000 }, (_, i) => `||t${i}.example^`))
    .join('\n');

async function reloadFromPopup(popup: Page, target: Page) {
  await expect(popup.getByRole('status').filter({ hasText: /reload/i })).toBeVisible();
  await Promise.all([target.waitForEvent('load'), popup.getByRole('button', { name: /^Reload/ }).click()]);
}

test.describe('public lists', () => {
  test('an enabled list blocks its domains everywhere, except its own exceptions', async ({
    setSettings,
    visit,
    ran,
  }) => {
    await setSettings(ON, { easyprivacy: LIST });
    const expected = ALL_SCRIPTS('site-a.test').filter((s) => !s.startsWith('cdn.test/'));
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: true, loaded: expected });
  });

  test('the list beats allow rules on an active site', async ({ setSettings, visit, ran }) => {
    await setSettings(
      { ...ON, activeSites: ['test'], rules: [{ id: 'r', domain: 'cdn.test', scope: 'global', createdAt: 0 }] },
      { easyprivacy: LIST },
    );
    expect((await ran(await visit('site-a.test'))).loaded).toEqual(['sub.cdn.test/c.js']);
  });

  test('path entries block everywhere; site exceptions unblock on their site only, never on active sites', async ({
    setSettings,
    visit,
    ran,
    tabState,
  }) => {
    const list: ListData = {
      domains: ['other.test'],
      exceptions: [],
      filters: [{ url: '/lib/b.js' }, { url: '||cdn.test^*/lib/b.js', allow: true, sites: ['site-b.test'] }],
      updatedAt: 0,
      skipped: 0,
    };
    await setSettings(ON, { easyprivacy: list });
    const siteA = await visit('site-a.test');
    expect((await ran(siteA)).loaded).toEqual(
      ALL_SCRIPTS('site-a.test').filter((s) => s !== 'cdn.test/lib/b.js' && s !== 'other.test/d.js'),
    );
    await expect
      .poll(async () =>
        (await tabState(siteA)).scripts
          .filter((s) => s.list === 'easyprivacy')
          .map((s) => s.file)
          .sort(),
      )
      .toEqual(['b.js', 'd.js']);
    expect((await ran(await visit('site-b.test'))).loaded).toEqual(
      ALL_SCRIPTS('site-b.test').filter((s) => s !== 'other.test/d.js'),
    );

    await setSettings(
      { ...ON, activeSites: ['site-b.test'], rules: [{ id: 'r', domain: 'cdn.test', scope: 'global', createdAt: 0 }] },
      { easyprivacy: list },
    );
    expect((await ran(await visit('site-b.test'))).loaded).toEqual(['cdn.test/lib/a.js', 'sub.cdn.test/c.js']);
  });

  test('popup names the list, and "Izinkan" unblocks that host from it', async ({
    setSettings,
    visit,
    openPopup,
    ran,
    getSettings,
    sw,
    tabIdOf,
  }) => {
    await setSettings(ON, { easyprivacy: LIST });
    const site = await visit('site-a.test');
    const tabId = await tabIdOf(site);
    await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('2');
    const popup = await openPopup(site);

    // Blocked items come before the (long) list of scripts that ran.
    expect(await popup.locator('.section-title').allTextContents()).toEqual([
      'Diblok global',
      expect.stringMatching(/^›?Script jalan/),
    ]);
    const hit = popup.locator('.list-hit', { hasText: 'cdn.test' });
    await expect(hit).toContainText('EasyPrivacy · 2 keblok');
    await expect(popup.locator('.site-summary')).toHaveText('2 diblok global · 3 jalan');
    await popup.getByRole('button', { name: 'Izinkan cdn.test dari EasyPrivacy' }).click();
    await expect.poll(async () => (await getSettings()).listAllow).toEqual(['cdn.test']);
    await expect(hit).toContainText('diizinkan');
    await reloadFromPopup(popup, site);
    expect((await ran(site)).loaded).toEqual(ALL_SCRIPTS('site-a.test'));
  });

  test('Options downloads the list, shows its size, and turning it off removes it', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
    visit,
    ran,
    sw,
  }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    await context.route(LIST_URL, (r) =>
      r.fulfill({ body: fakeList('/lib/b.js\n@@||cdn.test^*/lib/a.js$domain=site-z.test') }),
    );
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    const toggle = page.getByRole('switch', { name: 'Aktifkan EasyPrivacy' });

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/1\.001 domain · 1 path · 2 pengecualian/)).toBeVisible();
    expect((await getSettings()).lists).toEqual(['easyprivacy']);
    await expect.poll(async () => (await ran(await visit('site-a.test'))).loaded).not.toContain('cdn.test/lib/a.js');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await getSettings()).lists).toEqual([]);
    expect(
      await sw.evaluate(async () => (await chrome.storage.local.get('list:easyprivacy'))['list:easyprivacy']),
    ).toBeUndefined();
    await expect.poll(async () => (await ran(await visit('site-b.test'))).loaded).toContain('cdn.test/lib/a.js');
  });

  test('a failed download shows the error and leaves the list off', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
  }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    await context.route(LIST_URL, (r) => r.fulfill({ status: 503, body: 'down' }));
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.getByRole('switch', { name: 'Aktifkan EasyPrivacy' }).click();
    await expect(page.getByRole('alert')).toHaveText('Gagal unduh EasyPrivacy: HTTP 503');
    await expect(page.getByRole('switch', { name: 'Aktifkan EasyPrivacy' })).toHaveAttribute('aria-checked', 'false');
    expect((await getSettings()).lists).toEqual([]);
  });

  test('"Perbarui sekarang" replaces the data; a broken update keeps the old one', async ({
    setSettings,
    context,
    extensionId,
  }) => {
    await setSettings(ON, { easyprivacy: { ...LIST, domains: Array.from({ length: 1200 }, (_, i) => `d${i}.test`) } });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByText(/1\.200 domain/)).toBeVisible();

    await context.route(LIST_URL, (r) => r.fulfill({ body: '||only.one^' }));
    await page.getByRole('button', { name: 'Perbarui sekarang' }).click();
    await expect(page.getByRole('alert')).toContainText('cuma berisi 1 domain');
    await expect(page.getByText(/1\.200 domain/)).toBeVisible();

    await context.unroute(LIST_URL);
    await context.route(LIST_URL, (r) => r.fulfill({ body: fakeList() }));
    await page.getByRole('button', { name: 'Perbarui sekarang' }).click();
    await expect(page.getByText(/1\.001 domain/)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('user overrides are listed in Options and can be blocked again', async ({
    setSettings,
    context,
    extensionId,
    getSettings,
  }) => {
    await setSettings({ ...ON, listAllow: ['cdn.test'] }, { easyprivacy: LIST });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.getByRole('button', { name: 'Blok lagi cdn.test dari daftar' }).click();
    await expect.poll(async () => (await getSettings()).listAllow).toEqual([]);
  });

  test('a weekly refresh alarm is scheduled', async ({ sw }) => {
    await expect
      .poll(() => sw.evaluate(async () => (await chrome.alarms.get('aegis:lists'))?.periodInMinutes))
      .toBe(7 * 24 * 60);
  });
});
