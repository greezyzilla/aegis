import type { Page } from '@playwright/test';
import { messagesFor } from '../lib/i18n';
import { DEFAULTS, expect, rule, test } from './fixtures';

// The suite reads the English UI, the default. Here Indonesian is picked, and no English may be left in it.

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

// The language picker names "English" in its own language on purpose.
const OWN_NAMES = new Set(['english']);
/** Words the English text uses and the Indonesian text never does: any of them on screen was not translated. */
const idWords = words(texts(messagesFor('id')));
const ENGLISH = [...words(texts(messagesFor('en')))].filter((w) => !idWords.has(w) && !OWN_NAMES.has(w));

async function expectNoEnglish(page: Page) {
  // Host names like site-a.test are data, not UI text.
  const onScreen = words([(await page.locator('body').innerText()).replace(/\S+\.\S+/g, ' ')]);
  expect(ENGLISH.filter((w) => onScreen.has(w))).toEqual([]);
}

const ID = { ...DEFAULTS, lang: 'id' as const };

test.describe('Indonesian UI', () => {
  test('popup on an active site', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...ID, rules: [rule('cdn.test', 'shop.test')] });
    const popup = await openPopup(await visit('www.shop.test'));

    await expect(popup.locator('.section-title')).toHaveText([
      'Keblok di halaman ini',
      'Inline script',
      'Diizinkan',
      'Script jalan3',
    ]);
    await expect(popup.locator('.flag')).toHaveText([/^\d+ keblok$/, /^\d+ lolos$/]);
    await expect(popup.getByRole('button', { name: 'Izinkan other.test di situs ini' })).toBeVisible();
    await expectNoEnglish(popup);
  });

  test('popup on an inactive site', async ({ setSettings, visit, openPopup }) => {
    await setSettings({ ...ID, activeSites: [] });
    const popup = await openPopup(await visit('www.shop.test'));

    await expect(popup.locator('.flag')).toHaveText(['0 diblok global', '5 jalan']);
    await expect(popup.getByRole('button', { name: 'Blok cdn.test di semua situs' })).toBeVisible();
    await expectNoEnglish(popup);
  });

  test('options page', async ({ setSettings, context, extensionId }) => {
    await setSettings({ ...ID, rules: [rule('cdn.test'), rule('other.test', 'site-a.test')] });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await expect(page).toHaveTitle('Aegis — Rule');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.locator('.section-title')).toHaveText([
      'Situs aktif1',
      'Rule izin2',
      'Blok global0',
      'Daftar publik',
      'Inline script diizinkan0',
      'Pengaturan',
      'Backup',
    ]);
    await expect(page.locator('.flag')).toHaveText([
      '1 situs aktif',
      '2 rule izin',
      '0 blok global',
      'EasyPrivacy mati',
    ]);
    await expectNoEnglish(page);
  });
});
