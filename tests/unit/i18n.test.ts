import { describe, expect, it } from 'vitest';
import * as i18n from '@/lib/i18n';
import { langOf, messagesFor } from '@/lib/i18n';

describe('i18n', () => {
  it('uses Indonesian only for an Indonesian browser', () => {
    expect(langOf('id')).toBe('id');
    expect(langOf('id-ID')).toBe('id');
    expect(langOf('en-US')).toBe('en');
    expect(langOf('nl')).toBe('en');
    expect(langOf('idx')).toBe('en');
    expect(langOf(undefined)).toBe('en');
  });

  it('has the same keys and value kinds in both languages', () => {
    const id = messagesFor('id');
    const en = messagesFor('en');
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
    for (const key of Object.keys(id) as (keyof typeof id)[]) {
      expect(typeof en[key], key).toBe(typeof id[key]);
      if (typeof id[key] === 'function') expect((en[key] as () => string).length, key).toBe(id[key].length);
    }
  });

  it('keeps the Indonesian text and reads naturally in English', () => {
    const id = messagesFor('id');
    const en = messagesFor('en');
    expect(id.flagBlocked(8)).toBe('8 keblok');
    expect(id.tooManyRules(6, 5)).toBe('Terlalu banyak rule: 6 dari maksimal 5. Hapus sebagian rule atau blok global.');
    expect(en.importRead(1)).toBe('1 rule read and merged (duplicates skipped).');
    expect(en.importRead(2)).toBe('2 rules read and merged (duplicates skipped).');
    expect(en.listTooSmall('EasyPrivacy', 1)).toBe('EasyPrivacy has only 1 domain, the file is probably broken');
    expect(en.pathsDropped(1200)).toMatch(/^1,200 paths left out/);
    expect(id.pathsDropped(1200)).toMatch(/^1\.200 path tidak dipakai/);
  });

  it('applyLang switches the live dictionary, and back to the browser language', () => {
    const browserLang = i18n.lang;
    const other = browserLang === 'id' ? 'en' : 'id';
    expect(i18n.applyLang(other)).toBe(true);
    expect([i18n.lang, i18n.t.remove]).toEqual([other, messagesFor(other).remove]);
    expect(i18n.applyLang(other)).toBe(false);
    expect(i18n.applyLang(undefined)).toBe(true);
    expect([i18n.lang, i18n.t.remove]).toEqual([browserLang, messagesFor(browserLang).remove]);
  });
});
