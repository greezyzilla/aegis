import { browser } from '#imports';
import { useEffect, useState } from 'react';
import { getTabState, syncErrorKey, watchTabState } from '@/lib/tabs';
import { emptyTabState, normalizeTabState, type TabState } from '@/lib/types';
import { storage } from '#imports';

export interface ActiveTab {
  id: number;
  url: string;
}

/** The tab the popup was opened on, plus its live script log. */
export function useActiveTab() {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [state, setState] = useState<TabState>(emptyTabState);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id !== undefined) setTab({ id: t.id, url: t.url ?? '' });
    });
    void storage.getItem<string>(syncErrorKey).then(setSyncError);
    return storage.watch<string>(syncErrorKey, setSyncError);
  }, []);

  useEffect(() => {
    if (!tab) return;
    void getTabState(tab.id).then((s) => setState(normalizeTabState(s)));
    return watchTabState(tab.id, (s) => setState(normalizeTabState(s)));
  }, [tab]);

  return { tab, state, syncError };
}
