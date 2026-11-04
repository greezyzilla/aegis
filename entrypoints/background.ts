import { browser, storage, type Browser } from '#imports';
import { fileFromUrl, hostFromUrl } from '@/lib/domain';
import { buildDnrRules } from '@/lib/rules';
import { badgeCount, isAutoReload, settingsItem } from '@/lib/settings';
import { POPUP_PORT, syncErrorKey, tabStateKey, type PopupPortMessage } from '@/lib/tabs';
import { emptyTabState, normalizeTabState, type InlineBlockedMessage, type ScriptEntry, type TabState } from '@/lib/types';

const MAX_SCRIPTS_PER_TAB = 300;
const MAX_FRAMES_PER_TAB = 50;
const PERSIST_DELAY_MS = 250;

export default defineBackground(() => {
  // ---- DNR rules: always rebuilt from settings, one sync at a time ----
  let syncChain = Promise.resolve();
  const syncRules = () => {
    syncChain = syncChain.then(async () => {
      try {
        const settings = await settingsItem.getValue();
        const existing = await browser.declarativeNetRequest.getDynamicRules();
        await browser.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existing.map((r) => r.id),
          addRules: buildDnrRules(settings) as unknown as Browser.declarativeNetRequest.Rule[],
        });
        await storage.removeItem(syncErrorKey);
        await browser.action.setBadgeBackgroundColor({ color: '#9f1d1d' });
      } catch (err) {
        console.error('[aegis] failed to sync rules', err);
        await storage.setItem(syncErrorKey, String(err));
      }
    });
  };

  browser.runtime.onInstalled.addListener(syncRules);
  browser.runtime.onStartup.addListener(syncRules);
  settingsItem.watch(syncRules);

  // ---- Auto-reload: the popup reports changes over a port; closing it disconnects the port ----
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== POPUP_PORT) return;
    let changedTab: number | null = null;
    port.onMessage.addListener((msg: PopupPortMessage) => {
      changedTab = msg.type === 'changed' ? msg.tabId : null;
    });
    port.onDisconnect.addListener(() => {
      const tabId = changedTab;
      if (tabId === null) return;
      // The storage watch may not have fired yet: sync now so the reload sees the new rules.
      syncRules();
      void syncChain.then(async () => {
        if (isAutoReload(await settingsItem.getValue())) await browser.tabs.reload(tabId).catch(() => {});
      });
    });
  });

  // ---- Per-tab script log (survives service-worker restarts via storage.session) ----
  const tabs = new Map<number, TabState>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const persist = (tabId: number) => {
    clearTimeout(timers.get(tabId));
    timers.set(
      tabId,
      setTimeout(() => {
        timers.delete(tabId);
        const state = tabs.get(tabId);
        if (state) void storage.setItem(tabStateKey(tabId), state);
      }, PERSIST_DELAY_MS),
    );
    void settingsItem
      .getValue()
      .then((settings) => {
        const state = tabs.get(tabId);
        const blocked = state ? badgeCount(settings, state) : 0;
        return browser.action.setBadgeText({ tabId, text: blocked ? String(blocked) : '' });
      })
      .catch(() => {});
  };

  const resetTab = (tabId: number, page?: string) => {
    tabs.set(tabId, { ...emptyTabState(), page });
    persist(tabId);
  };

  const forgetTab = (tabId: number) => {
    clearTimeout(timers.get(tabId));
    timers.delete(tabId);
    tabs.delete(tabId);
    void storage.removeItem(tabStateKey(tabId));
  };

  // Service worker may wake up mid-page: continue from what was persisted.
  const loading = new Map<number, Promise<TabState>>();
  const getState = (tabId: number): Promise<TabState> => {
    const cached = tabs.get(tabId);
    if (cached) return Promise.resolve(cached);
    let pending = loading.get(tabId);
    if (!pending) {
      pending = storage.getItem<TabState>(tabStateKey(tabId)).then((stored) => {
        loading.delete(tabId);
        const state = tabs.get(tabId) ?? normalizeTabState(stored);
        tabs.set(tabId, state);
        return state;
      });
      loading.set(tabId, pending);
    }
    return pending;
  };

  const record = async (
    details: { tabId: number; url: string; initiator?: string },
    blocked: boolean,
  ) => {
    if (details.tabId < 0) return;
    const host = hostFromUrl(details.url);
    if (!host) return;

    const state = await getState(details.tabId);
    const entry: ScriptEntry = {
      url: details.url,
      host,
      file: fileFromUrl(details.url),
      initiator: hostFromUrl(details.initiator) ?? '',
      blocked,
    };
    const i = state.scripts.findIndex((s) => s.url === entry.url && s.initiator === entry.initiator);
    if (i >= 0) state.scripts[i] = entry;
    else if (state.scripts.length < MAX_SCRIPTS_PER_TAB) state.scripts.push(entry);
    persist(details.tabId);
  };

  browser.webRequest.onBeforeRequest.addListener(
    (d) => {
      if (d.frameId === 0 && d.tabId >= 0) resetTab(d.tabId, hostFromUrl(d.url) ?? undefined);
      return undefined;
    },
    { urls: ['<all_urls>'], types: ['main_frame'] },
  );

  // Remember iframe hosts, so the popup can still offer the inline toggle after it is allowed.
  browser.webRequest.onBeforeRequest.addListener(
    (d) => {
      const host = hostFromUrl(d.url);
      if (d.tabId < 0 || !host) return undefined;
      void getState(d.tabId).then((state) => {
        if (state.frames.includes(host) || state.frames.length >= MAX_FRAMES_PER_TAB) return;
        state.frames.push(host);
        persist(d.tabId);
      });
      return undefined;
    },
    { urls: ['<all_urls>'], types: ['sub_frame'] },
  );

  // Inline scripts never hit the network; the content script reports CSP violations instead.
  browser.runtime.onMessage.addListener((msg: InlineBlockedMessage, sender) => {
    const tabId = sender.tab?.id;
    const host = hostFromUrl(sender.url);
    if (msg?.type !== 'aegis:inline-blocked' || tabId === undefined || !host) return;
    void getState(tabId).then((state) => {
      const entry = state.inline.find((i) => i.host === host);
      if (entry) entry.count += msg.count;
      else state.inline.push({ host, count: msg.count });
      persist(tabId);
    });
  });

  browser.webRequest.onErrorOccurred.addListener(
    (d) => {
      if (d.error === 'net::ERR_BLOCKED_BY_CLIENT') void record(d, true);
    },
    { urls: ['<all_urls>'], types: ['script'] },
  );

  browser.webRequest.onCompleted.addListener((d) => void record(d, false), {
    urls: ['<all_urls>'],
    types: ['script'],
  });

  browser.tabs.onRemoved.addListener(forgetTab);
});
