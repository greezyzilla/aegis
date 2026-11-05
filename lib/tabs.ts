import { storage } from '#imports';
import type { TabState } from './types';

export const tabStateKey = (tabId: number) => `session:tab:${tabId}` as const;
export const syncErrorKey = 'session:syncError' as const;
/** How many public-list entries the last rule sync left out to fit the browser's rule cap. */
export const listDroppedKey = 'session:listDropped' as const;

export function getTabState(tabId: number) {
  return storage.getItem<TabState>(tabStateKey(tabId));
}

export function watchTabState(tabId: number, cb: (s: TabState | null) => void) {
  return storage.watch<TabState>(tabStateKey(tabId), cb);
}

/** Port the popup keeps open; the background reloads its tab on disconnect if something changed. */
export const POPUP_PORT = 'aegis:popup';

export type PopupPortMessage = { type: 'changed'; tabId: number } | { type: 'reloaded' };

/** Options asks the background to download a public list (and enable it on success). */
export const LIST_REFRESH = 'aegis:list-refresh';

export interface ListRefreshMessage {
  type: typeof LIST_REFRESH;
  id: string;
}

export type ListRefreshResult = { ok: true } | { ok: false; error: string };
