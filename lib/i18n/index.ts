import { en, type Messages } from './en';
import { makeFormat } from './format';
import { id } from './id';

export type Lang = 'id' | 'en';
/** The choice stored in settings: a language, or 'auto' to follow the browser. */
export type LangPref = Lang | 'auto';

/** For 'auto': Indonesian for an Indonesian browser, English for every other language. */
export function langOf(language: string | undefined): Lang {
  return /^id\b/i.test(language ?? '') ? 'id' : 'en';
}

export function messagesFor(lang: Lang): Messages {
  return lang === 'id' ? id(makeFormat('id-ID')) : en(makeFormat('en-US'));
}

const browserLang = (): Lang => langOf(globalThis.navigator?.language);

/** English unless Indonesian is picked, or the browser's language when following it. */
export const resolveLang = (pref: LangPref | undefined): Lang => (pref === 'auto' ? browserLang() : (pref ?? 'en'));

/** The UI language of this page or worker: English until the stored choice is applied. */
export let lang: Lang = 'en';
export let t: Messages = messagesFor(lang);

/** Switches to the user's choice (missing means English). Returns whether it changed. */
export function applyLang(pref: LangPref | undefined): boolean {
  const next = resolveLang(pref);
  if (next === lang) return false;
  lang = next;
  t = messagesFor(next);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  return true;
}
