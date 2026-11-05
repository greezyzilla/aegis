import type { Page } from '@playwright/test';
import { messagesFor } from '../lib/i18n';
import { DEFAULTS, expect, rule, test } from './fixtures';

// An English browser gets the English UI, with no Indonesian left in it.
test.use({ uiLang: 'en' });

/** Every text of a dictionary, functions called with sample arguments. */
const texts = (m: ReturnType<typeof messagesFor>): string[] =>
  Object.values(m).flatMap((v) =>
    typeof v === 'function' ? [(v as (...a: unknown[]) => string)(2, 3, 4, 0)] : Array.isArray(v) ? v : [v],
  );
const words = (list: string[]) =>
  new Set(
    list
      .join(' ')
      .toLowerCase()
      .match(/\p{L}{4,}/gu),
  );

/** Words the Indonesian text uses and the English text never does: any of them on screen was not translated. */
const enWords = words(texts(messagesFor('en')));
const INDONESIAN = [...words(texts(messagesFor('id')))].filter((w) => !enWords.has(w));

async function expectNoIndonesian(page: Page) {
  const onScreen = words([await page.locator('body').innerText()]);
  expect(INDONESIAN.filter((w) => onScreen.has(w))).toEqual([]);
}

test.describe('English UI', () => {
  test('popup on an active site', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test', 'shop.test')] });
    const popup = await openPopup(await visit('www.shop.test'));

    await expect(popup.locator('.section-title')).toHaveText([
      'Blocked on this page',
      'Inline scripts',
      'Allowed',
      'Scripts that ran3',
    ]);
    await expect(popup.locator('.flag')).toHaveText([/^\d+ blocked$/, /^\d+ allowed$/]);
    await expect(popup.getByRole('button', { name: 'Allow other.test on this site' })).toBeVisible();
    await expectNoIndonesian(popup);
  });

  test('popup on an inactive site', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...DEFAULTS, activeSites: [] });
    const popup = await openPopup(await visit('www.shop.test'));

    await expect(popup.locator('.flag')).toHaveText(['0 blocked globally', '5 ran']);
    await expect(popup.getByRole('button', { name: 'Block cdn.test on every site' })).toBeVisible();
    await expectNoIndonesian(popup);
  });

  test('options page', async ({ setSettings, context, extensionId }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test'), rule('other.test', 'site-a.test')] });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await expect(page).toHaveTitle('Aegis — Rules');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.section-title')).toHaveText([
      'Active sites1',
      'Allow rules2',
      'Global blocks0',
      'Public lists',
      'Inline scripts allowed0',
      'Settings',
      'Backup',
    ]);
    await expect(page.locator('.flag')).toHaveText([
      '1 active site',
      '2 allow rules',
      '0 global blocks',
      'EasyPrivacy off',
    ]);
    await expectNoIndonesian(page);
  });
});
