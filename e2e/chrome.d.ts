// Code passed to sw.evaluate()/addInitScript() runs inside the extension, where `chrome` exists.
import type { browser } from 'wxt/browser';

declare global {
  const chrome: typeof browser;
}

export {};
