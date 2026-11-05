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

const browserLang = (): Lang => langOf(globalThis.navigator?.language);

/** The UI language of this page or worker: the browser's until the stored choice is applied. */
export let lang: Lang = browserLang();
export let t: Messages = messagesFor(lang);

/** Switches to the user's choice (missing means the browser's language). Returns whether it changed. */
export function applyLang(pref: Lang | undefined): boolean {
  const next = pref ?? browserLang();
  if (next === lang) return false;
  lang = next;
  t = messagesFor(next);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  return true;
}
