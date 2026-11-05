import { browser, storage, type Browser } from '#imports';
import { fileFromUrl, hostFromUrl } from '@/lib/domain';
import { downloadList, isListId, LIST_IDS, listDataItem, listErrorItem, listMatcher, type ListId } from '@/lib/lists';
import { buildDnrRules, checkRuleCount, type ListRules } from '@/lib/rules';
import { badgeCount, DEFAULT_SETTINGS, isAutoReload, settingsItem, updateSettings } from '@/lib/settings';
import { LIST_REFRESH, listDroppedKey, POPUP_PORT, syncErrorKey, tabStateKey, type ListRefreshMessage, type PopupPortMessage } from '@/lib/tabs';
import { emptyTabState, normalizeTabState, type InlineBlockedMessage, type ScriptEntry, type TabState } from '@/lib/types';

const MAX_SCRIPTS_PER_TAB = 300;
const MAX_FRAMES_PER_TAB = 50;
const PERSIST_DELAY_MS = 250;
const LIST_ALARM = 'aegis:lists';
/** How a request cancelled by an extension (DNR block) is reported: Chrome, then Firefox. */
const BLOCKED_ERRORS = new Set(['net::ERR_BLOCKED_BY_CLIENT', 'NS_ERROR_ABORT']);
const LIST_REFRESH_MINUTES = 7 * 24 * 60;

export default defineBackground(() => {
  // ---- DNR rules: always rebuilt from settings, one sync at a time ----
  let syncChain = Promise.resolve();
  const readLists = async (ids: string[]): Promise<ListRules> =>
    Object.fromEntries(
      await Promise.all(ids.filter(isListId).map(async (id) => [id, await listDataItem(id).getValue()] as const)),
    );
  const syncRules = () => {
    syncChain = syncChain.then(async () => {
      try {
        const settings = await settingsItem.getValue();
        const max = browser.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES;
        const { rules, dropped } = buildDnrRules(settings, await readLists(settings.lists), max);
        checkRuleCount(rules, max);
        const existing = await browser.declarativeNetRequest.getDynamicRules();
        await browser.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existing.map((r) => r.id),
          addRules: rules as unknown as Browser.declarativeNetRequest.Rule[],
        });
        await storage.removeItem(syncErrorKey);
        await (dropped ? storage.setItem(listDroppedKey, dropped) : storage.removeItem(listDroppedKey));
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
  for (const id of LIST_IDS) listDataItem(id).watch(syncRules);

  // ---- Public lists: matchers tag what a list blocked; downloads on request and weekly ----
  type Matcher = { id: ListId; covers: (url: string, initiator?: string) => boolean };
  const buildMatchers = async (): Promise<Matcher[]> => {
    const settings = await settingsItem.getValue();
    const out: Matcher[] = [];
    for (const id of settings.lists.filter(isListId)) {
      const data = await listDataItem(id).getValue();
      if (data) out.push({ id, covers: listMatcher(data, settings.listAllow, settings.activeSites) });
    }
    return out;
  };
  let matchers = buildMatchers();
  const rebuildMatchers = () => {
    matchers = buildMatchers();
  };
  settingsItem.watch(rebuildMatchers);
  for (const id of LIST_IDS) listDataItem(id).watch(rebuildMatchers);

  const refreshList = async (id: ListId): Promise<void> => {
    try {
      await listDataItem(id).setValue(await downloadList(id));
      await listErrorItem(id).setValue(null);
    } catch (err) {
      await listErrorItem(id).setValue((err as Error).message);
      throw err;
    }
  };

  browser.runtime.onMessage.addListener((msg: ListRefreshMessage, _sender, sendResponse) => {
    if (msg?.type !== LIST_REFRESH || !isListId(msg.id)) return;
    const id = msg.id;
    refreshList(id)
      .then(() => updateSettings((s) => (s.lists.includes(id) ? s : { ...s, lists: [...s.lists, id] })))
      .then(
        () => sendResponse({ ok: true }),
        (err: Error) => sendResponse({ ok: false, error: err.message }),
      );
    return true; // async response
  });

  const ensureAlarm = async () => {
    if (!(await browser.alarms.get(LIST_ALARM))) {
      await browser.alarms.create(LIST_ALARM, { periodInMinutes: LIST_REFRESH_MINUTES });
    }
  };
  browser.runtime.onInstalled.addListener(() => void ensureAlarm());
  // Data saved before Aegis read path entries has no filters: fetch it again instead of waiting a week.
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== 'update') return;
    const { lists } = await settingsItem.getValue();
    for (const id of lists.filter(isListId)) {
      const data = await listDataItem(id).getValue();
      if (data && !data.filters) await refreshList(id).catch(() => {});
    }
  });
  browser.runtime.onStartup.addListener(() => void ensureAlarm());
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== LIST_ALARM) return;
    const { lists } = await settingsItem.getValue();
    for (const id of lists.filter(isListId)) await refreshList(id).catch(() => {});
  });

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

  // In memory for the badge, which is recomputed on every recorded script (80+ on news sites).
  let settingsNow = settingsItem.getValue();
  settingsItem.watch((next) => {
    settingsNow = Promise.resolve(next ?? DEFAULT_SETTINGS);
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
    void settingsNow
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
    details: { tabId: number; url: string; initiator?: string; originUrl?: string },
    blocked: boolean,
  ) => {
    if (details.tabId < 0) return;
    const host = hostFromUrl(details.url);
    if (!host) return;

    const state = await getState(details.tabId);
    // Chrome reports the initiator, Firefox only originUrl. The list check needs it on both.
    const from = hostFromUrl(details.initiator ?? details.originUrl) ?? '';
    const list = blocked ? (await matchers).find((m) => m.covers(details.url, from))?.id : undefined;
    const entry: ScriptEntry = {
      url: details.url,
      host,
      file: fileFromUrl(details.url),
      initiator: hostFromUrl(details.initiator) ?? '',
      blocked,
      ...(list && { list }),
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
      if (BLOCKED_ERRORS.has(d.error)) void record(d, true);
    },
    { urls: ['<all_urls>'], types: ['script'] },
  );

  browser.webRequest.onCompleted.addListener((d) => void record(d, false), {
    urls: ['<all_urls>'],
    types: ['script'],
  });

  browser.tabs.onRemoved.addListener(forgetTab);
});
