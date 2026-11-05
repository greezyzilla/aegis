import { browser } from '#imports';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/Switch';
import { hostFromUrl, hostMatches, normalizeScript, siteOf } from '@/lib/domain';
import {
  addBlocks,
  addRules,
  badgeCount,
  blockMatches,
  isAutoReload,
  removeBlock,
  removeRule,
  ruleMatches,
  setListAllow,
  setSiteFlag,
} from '@/lib/settings';
import { popupPort } from '@/lib/popupPort';
import { POPUP_PORT, type PopupPortMessage } from '@/lib/tabs';
import type { ScriptEntry } from '@/lib/types';
import { useSettings } from '@/lib/useSettings';
import { ActiveRules } from './ActiveRules';
import { BlockedList, type BlockedGroup } from './BlockedList';
import { InlineList, type InlineRow } from './InlineList';
import { GlobalBlocks, type ListHit } from './ListHits';
import { LoadedList, type LoadedGroup } from './LoadedList';
import { Section } from './Section';
import { useActiveTab } from './useActiveTab';
import { t } from '@/lib/i18n';

export default function App() {
  const settings = useSettings();
  const { tab, state, syncError } = useActiveTab();
  const [changed, setChanged] = useState(false);
  // Switched on in this popup: the page on screen loaded before blocking applied.
  const [justActivated, setJustActivated] = useState(false);
  const port = useRef<ReturnType<typeof popupPort> | null>(null);

  useEffect(() => {
    port.current = popupPort(() => browser.runtime.connect({ name: POPUP_PORT }));
    return () => port.current?.close();
  }, []);
  const notify = (msg: PopupPortMessage) => port.current?.post(msg);

  const pageHost = hostFromUrl(tab?.url);
  const site = pageHost ? siteOf(pageHost) : null;
  // Before the memo: the compiler treats any call taking `site` as a possible mutation of it.
  const activateLabel = site ? t.activateOn(site) : '';

  const view = useMemo(() => {
    if (!settings || !pageHost) return null;
    const active = settings.activeSites.some((d) => hostMatches(pageHost, d));
    const isAllowed = (e: ScriptEntry) => settings.rules.some((r) => ruleMatches(r, e));
    const isBlocked = (e: ScriptEntry) => settings.blocks.some((b) => blockMatches(b, e));

    // Scripts stopped by a global block or a public list are listed there, not as allowable:
    // an allow rule cannot beat them.
    // The site's own hosts first: they are the ones a broken page most likely needs.
    const isOwn = (host: string) => hostMatches(host, siteOf(pageHost));
    const ownFirst = <T extends { host: string }>(gs: T[]) =>
      [...gs].sort((a, b) => Number(isOwn(b.host)) - Number(isOwn(a.host)));
    const groups: BlockedGroup[] = ownFirst(
      groupByHost(state.scripts.filter((e) => e.blocked && !e.list && !isBlocked(e))),
    );
    const listHits: ListHit[] = groupByHost(state.scripts.filter((e) => e.blocked && !!e.list));
    const loadedGroups: LoadedGroup[] = ownFirst(groupByHost(state.scripts.filter((e) => !e.blocked)));
    const pageBlocks = settings.blocks.filter((b) => state.scripts.some((e) => blockMatches(b, e)));
    const blockedBy = (b: (typeof settings.blocks)[number]) =>
      state.scripts.filter((e) => e.blocked && blockMatches(b, e)).length;
    const allowedBy = (r: (typeof settings.rules)[number]) =>
      state.scripts.filter((e) => !e.blocked && ruleMatches(r, e)).length;

    const activeRules = settings.rules.filter((r) =>
      r.scope === 'global'
        ? state.scripts.some((e) => ruleMatches(r, e))
        : hostMatches(pageHost, r.scope) || state.scripts.some((e) => ruleMatches(r, e)),
    );
    const loaded = state.scripts.filter((e) => !e.blocked).length;

    // The page itself, plus iframes that had inline blocked or are already allowed.
    const inlineAllowed = (host: string) => settings.inlineSites.some((d) => hostMatches(host, d));
    const inlineBlocked = (host: string) => state.inline.find((i) => i.host === host)?.count ?? 0;
    const frameHosts = [...new Set([...state.inline.map((i) => i.host), ...state.frames])].filter(
      (h) => h !== pageHost && (inlineBlocked(h) > 0 || inlineAllowed(h)),
    );
    const inlineRows: InlineRow[] = [pageHost, ...frameHosts].map((host) => ({
      host,
      site: siteOf(host),
      isPage: host === pageHost,
      blocked: inlineBlocked(host),
      allowed: inlineAllowed(host),
    }));

    // Same number as the toolbar badge.
    const blocked = badgeCount(settings, { ...state, page: pageHost });

    return {
      active,
      isOwn,
      allowedBy,
      isAllowed,
      isBlocked,
      groups,
      loadedGroups,
      pageBlocks,
      blockedBy,
      listHits,
      activeRules,
      loaded,
      blocked,
      inlineRows,
    };
  }, [settings, pageHost, state]);

  const act = (p: Promise<void>) => {
    setChanged(true);
    // Reported once stored, so a reload on popup close never races the write.
    void p.then(() => tab && notify({ type: 'changed', tabId: tab.id }));
  };

  const allow = (entries: ScriptEntry[], host: string, scope: 'site' | 'global', file?: string) => {
    const script = file ? normalizeScript(file) : undefined;
    if (scope === 'global') return act(addRules([{ domain: host, script, scope: 'global' }]));
    // Scope to the document that loaded the script (usually the page, sometimes an iframe).
    const scopes = new Set(entries.map((e) => siteOf(e.initiator || pageHost!)));
    act(addRules([...scopes].map((s) => ({ domain: host, script, scope: s }))));
  };

  const block = (host: string, file?: string) =>
    act(addBlocks([{ domain: host, script: file ? normalizeScript(file) : undefined }]));

  // Same shell as popup.html, plus the host once known, until settings are read.
  if (!settings) {
    return (
      <main className="popup">
        <header className="site">
          <Brand />
          {pageHost && <p className="site-host">{pageHost}</p>}
        </header>
      </main>
    );
  }

  return (
    <main className="popup">
      {!view || !site || !pageHost ? (
        <>
          <header className="site">
            <Brand />
          </header>
          {syncError && (
            <p className="notice notice-error" role="alert">
              {t.syncFailed(syncError)}
            </p>
          )}
          <p className="empty muted">{t.notControllable}</p>
        </>
      ) : (
        <>
          <header className={`site${view.active ? ' site-active' : ''}`} aria-label={t.siteSettings}>
            <div className="site-top">
              <Brand />
              <Switch
                checked={view.active}
                onChange={(v) => {
                  setJustActivated(v);
                  act(setSiteFlag('activeSites', pageHost, site, v));
                }}
                label={activateLabel}
              />
            </div>
            <p className="site-host">{pageHost}</p>
            <div className="flags">
              <span className="flag">
                <span className="dot dot-blocked" />
                {view.active ? t.flagBlocked(view.blocked) : t.flagBlockedGlobal(view.blocked)}
              </span>
              <span className="flag">
                <span className={`dot ${view.active ? 'dot-allowed' : 'dot-neutral'}`} />
                {view.active ? t.flagAllowed(view.loaded) : t.flagRan(view.loaded)}
              </span>
            </div>
          </header>

          {syncError && (
            <p className="notice notice-error" role="alert">
              {t.syncFailed(syncError)}
            </p>
          )}

          {view.active && (
            <>
              <Section id="blocked-title" title={t.sectionBlocked}>
                <BlockedList
                  groups={view.groups}
                  isAllowed={view.isAllowed}
                  isOwn={view.isOwn}
                  onAllow={allow}
                  loadedBeforeActive={justActivated}
                />
              </Section>

              <Section id="inline-title" title={t.sectionInline}>
                <InlineList
                  rows={view.inlineRows}
                  disabled={false}
                  onToggle={(row, allow) => act(setSiteFlag('inlineSites', row.host, row.site, allow))}
                />
              </Section>

              <Section id="rules-title" title={t.sectionAllowed}>
                <ActiveRules
                  rules={view.activeRules}
                  allowedBy={view.allowedBy}
                  isOwn={view.isOwn}
                  onRemove={(id) => act(removeRule(id))}
                />
              </Section>
            </>
          )}

          {(!view.active || view.pageBlocks.length > 0 || view.listHits.length > 0) && (
            <Section id="global-blocks-title" title={t.sectionGlobal}>
              <GlobalBlocks
                blocks={view.pageBlocks}
                blockedBy={view.blockedBy}
                onRemove={(id) => act(removeBlock(id))}
                hits={view.listHits}
                isAllowed={(host) => settings.listAllow.includes(host)}
                onAllow={(host) => act(setListAllow(host, true))}
              />
            </Section>
          )}

          {/* On an active site these are only the allowed scripts, so keep them folded away. */}
          <Section
            id="loaded-title"
            title={t.sectionLoaded}
            count={view.loaded}
            collapsible={view.active}
            defaultOpen={!view.active}
          >
            <LoadedList groups={view.loadedGroups} isBlocked={view.isBlocked} isOwn={view.isOwn} onBlock={block} />
          </Section>
        </>
      )}

      {changed && tab && (
        <div className="notice reload" role="status">
          <span>{isAutoReload(settings) ? t.reloadOnClose : t.reloadToApply}</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void browser.tabs.reload(tab.id);
              setChanged(false);
              notify({ type: 'reloaded' });
            }}
          >
            {isAutoReload(settings) ? t.reloadNow : t.reload}
          </button>
        </div>
      )}

      <footer className="popup-footer">
        <button type="button" className="btn btn-ghost btn-link" onClick={() => browser.runtime.openOptionsPage()}>
          {t.manageRules}
        </button>
      </footer>
    </main>
  );
}

function Brand() {
  return (
    <div className="brand">
      <img src="/icon/32.png" alt="" width={20} height={20} />
      <h1>Aegis</h1>
    </div>
  );
}

function groupByHost(entries: ScriptEntry[]): { host: string; entries: ScriptEntry[] }[] {
  const byHost = new Map<string, ScriptEntry[]>();
  for (const e of entries) byHost.set(e.host, [...(byHost.get(e.host) ?? []), e]);
  return [...byHost.entries()]
    .map(([host, entries]) => ({ host, entries }))
    .sort((a, b) => b.entries.length - a.entries.length);
}
