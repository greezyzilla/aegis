import { en } from './en';
import { makeFormat } from './format';
import { id, type Messages } from './id';

export type Lang = 'id' | 'en';

/** Indonesian for an Indonesian browser, English for every other language. */
export function langOf(language: string | undefined): Lang {
  return /^id\b/i.test(language ?? '') ? 'id' : 'en';
}

export function messagesFor(lang: Lang): Messages {
  return lang === 'id' ? id(makeFormat('id-ID')) : en(makeFormat('en-US'));
}

/** The UI language of this page or worker, read once from the browser. */
export const lang: Lang = langOf(globalThis.navigator?.language);
export const t: Messages = messagesFor(lang);
