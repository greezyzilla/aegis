import { storage } from '#imports';
import type { TabState } from './types';

export const tabStateKey = (tabId: number) => `session:tab:${tabId}` as const;
export const syncErrorKey = 'session:syncError' as const;

export function getTabState(tabId: number) {
  return storage.getItem<TabState>(tabStateKey(tabId));
}

export function watchTabState(tabId: number, cb: (s: TabState | null) => void) {
  return storage.watch<TabState>(tabStateKey(tabId), cb);
}
