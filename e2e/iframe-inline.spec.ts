import type { Frame, Page } from '@playwright/test';
import { block, DEFAULTS, expect, rule, test } from './fixtures';

const playerFrame = (page: Page): Frame => {
  const f = page.frames().find((fr) => fr.url().includes('player.test'));
  if (!f) throw new Error('player iframe not found');
  return f;
};

const ranIn = (frame: Frame) =>
  frame.evaluate(() => {
    const w = window as unknown as { inline?: number; inline2?: number; loaded?: string[] };
    return { inline: !!w.inline && !!w.inline2, loaded: w.loaded ?? [] };
  });

async function reloadFromPopup(popup: Page, target: Page) {
  await expect(popup.getByRole('status').filter({ hasText: /reload/i })).toBeVisible();
  await Promise.all([target.waitForEvent('load'), popup.getByRole('button', { name: /^Reload/ }).click()]);
}

test.describe('inline scripts inside a third-party iframe (player case)', () => {
  test('content script reports inline blocks per frame, only for our CSP', async ({ setSettings, visit, tabState }) => {
    await setSettings(DEFAULTS);
    const page = await visit('stream.test', '/embed');
    await expect
      .poll(async () => (await tabState(page)).inline.sort((a, b) => a.host.localeCompare(b.host)))
      .toEqual([
        { host: 'player.test', count: 2 },
        { host: 'stream.test', count: 1 },
      ]);
    expect((await tabState(page)).frames).toEqual(['player.test']);
  });

  test("a site's own CSP violations are not counted", async ({ setSettings, visit, tabState, ran }) => {
    await setSettings({ ...DEFAULTS, inlineSites: ['strict.test'] });
    const page = await visit('strict.test', '/strict');
    expect((await ran(page)).inline).toBe(false); // blocked by the site itself
    await page.waitForTimeout(500);
    expect((await tabState(page)).inline).toEqual([]);
  });

  test('popup lists the page and the iframe with blocked counts', async ({ setSettings, visit, openPopup }) => {
    await setSettings(DEFAULTS);
    const page = await visit('stream.test', '/embed');
    const popup = await openPopup(page);

    const pageRow = popup.locator('.inline-row', { hasText: 'stream.test' });
    const frameRow = popup.locator('.inline-row', { hasText: 'player.test' });
    await expect(pageRow).toContainText('halaman ini');
    await expect(pageRow.locator('.count')).toHaveText('1');
    await expect(frameRow).toContainText('iframe');
    await expect(frameRow.locator('.count')).toHaveText('2');
  });

  test('allowing the iframe inline makes the player run, page inline stays blocked', async ({ setSettings, visit, openPopup, ran, getSettings }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test', 'player.test')] });
    const page = await visit('stream.test', '/embed');
    expect(await ranIn(playerFrame(page))).toEqual({ inline: false, loaded: ['cdn.test/lib/a.js'] });
    const popup = await openPopup(page);

    await popup.getByRole('switch', { name: 'Izinkan inline script di player.test' }).click();
    await expect.poll(async () => (await getSettings()).inlineSites).toEqual(['player.test']);
    await reloadFromPopup(popup, page);

    await expect.poll(async () => ranIn(playerFrame(page))).toEqual({ inline: true, loaded: ['cdn.test/lib/a.js'] });
    expect((await ran(page)).inline).toBe(false);
  });

  test('allowed iframe stays in the list after reload and can be turned off', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, inlineSites: ['player.test'] });
    const page = await visit('stream.test', '/embed');
    expect((await ranIn(playerFrame(page))).inline).toBe(true);
    const popup = await openPopup(page);

    const toggle = popup.getByRole('switch', { name: 'Izinkan inline script di player.test' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await reloadFromPopup(popup, page);
    await expect.poll(async () => (await ranIn(playerFrame(page))).inline).toBe(false);
    await expect(popup.locator('.inline-row', { hasText: 'player.test' }).locator('.count')).toHaveText('2');
  });

  test('an iframe on an active site stays blocked even though its own host is not active', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, activeSites: ['stream.test'] });
    const page = await visit('stream.test', '/embed');
    await expect.poll(() => page.frames().some((f) => f.url().includes('player.test'))).toBe(true);
    await playerFrame(page).waitForLoadState('load');
    expect((await ran(page)).inline).toBe(false);
    expect(await ranIn(playerFrame(page))).toEqual({ inline: false, loaded: [] });
  });

  test('an active host embedded in an inactive page runs everything', async ({ setSettings, visit }) => {
    await setSettings({ ...DEFAULTS, activeSites: ['player.test'] });
    const page = await visit('stream.test', '/embed');
    await expect.poll(() => ranIn(playerFrame(page))).toEqual({ inline: true, loaded: ['cdn.test/lib/a.js'] });
  });

  test('a global block applies inside an iframe on an inactive page', async ({ setSettings, visit }) => {
    await setSettings({ ...DEFAULTS, activeSites: [], blocks: [block('cdn.test')] });
    const page = await visit('stream.test', '/embed');
    await expect.poll(() => page.frames().some((f) => f.url().includes('player.test'))).toBe(true);
    await playerFrame(page).waitForLoadState('load');
    expect(await ranIn(playerFrame(page))).toEqual({ inline: true, loaded: [] });
  });

  test('an inactive page shows no inline controls, even with iframes', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const popup = await openPopup(await visit('stream.test', '/embed'));
    await expect(popup.getByRole('heading', { name: 'Script jalan' })).toBeVisible();
    await expect(popup.locator('.inline-row')).toHaveCount(0);
  });

  test('iframes without inline scripts are not listed', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS });
    const page = await visit('site-a.test');
    const popup = await openPopup(page);
    await expect(popup.locator('.inline-row')).toHaveCount(1);
  });
});
