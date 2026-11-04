import { browser, type Browser } from '#imports';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/Switch';
import { hostFromUrl, hostMatches, normalizeScript, siteOf } from '@/lib/domain';
import { BlockRules } from '@/components/BlockRules';
import {
  addBlocks,
  addRules,
  badgeCount,
  blockMatches,
  isAutoReload,
  removeBlock,
  removeRule,
  ruleMatches,
  setSiteFlag,
} from '@/lib/settings';
import { POPUP_PORT, type PopupPortMessage } from '@/lib/tabs';
import type { ScriptEntry } from '@/lib/types';
import { useSettings } from '@/lib/useSettings';
import { ActiveRules } from './ActiveRules';
import { BlockedList, type BlockedGroup } from './BlockedList';
import { InlineList, type InlineRow } from './InlineList';
import { LoadedList, type LoadedGroup } from './LoadedList';
import { Section } from './Section';
import { useActiveTab } from './useActiveTab';

export default function App() {
  const settings = useSettings();
  const { tab, state, syncError } = useActiveTab();
  const [changed, setChanged] = useState(false);
  const port = useRef<Browser.runtime.Port | null>(null);

  useEffect(() => {
    port.current = browser.runtime.connect({ name: POPUP_PORT });
    return () => port.current?.disconnect();
  }, []);
  const notify = (msg: PopupPortMessage) => port.current?.postMessage(msg);

  const pageHost = hostFromUrl(tab?.url);
  const site = pageHost ? siteOf(pageHost) : null;

  const view = useMemo(() => {
    if (!settings || !pageHost) return null;
    const active = settings.activeSites.some((d) => hostMatches(pageHost, d));
    const isAllowed = (e: ScriptEntry) => settings.rules.some((r) => ruleMatches(r, e));
    const isBlocked = (e: ScriptEntry) => settings.blocks.some((b) => blockMatches(b, e));

    // Scripts stopped by a global block are listed under that block, not as allowable.
    const groups: BlockedGroup[] = groupByHost(state.scripts.filter((e) => e.blocked && !isBlocked(e)));
    const loadedGroups: LoadedGroup[] = groupByHost(state.scripts.filter((e) => !e.blocked));
    const pageBlocks = settings.blocks.filter((b) => state.scripts.some((e) => blockMatches(b, e)));
    const blockedBy = (b: (typeof settings.blocks)[number]) =>
      state.scripts.filter((e) => e.blocked && blockMatches(b, e)).length;

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

    return { active, isAllowed, isBlocked, groups, loadedGroups, pageBlocks, blockedBy, activeRules, loaded, blocked, inlineRows };
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

  if (!settings) return null;

  return (
    <main className="popup">
      {!view || !site || !pageHost ? (
        <>
          <header className="site">
            <h1 className="brand">Aegis</h1>
          </header>
          {syncError && (
            <p className="notice notice-error" role="alert">
              Gagal menerapkan rule: {syncError}
            </p>
          )}
          <p className="empty muted">Halaman ini nggak bisa diatur (bukan http/https).</p>
        </>
      ) : (
        <>
          <header className="site" aria-label="Pengaturan situs ini">
            <div className="site-top">
              <h1 className="brand">Aegis</h1>
              <span className="site-summary">
                {view.active
                  ? `${view.blocked} keblok · ${view.loaded} lolos`
                  : `${view.blocked} diblok global · ${view.loaded} jalan`}
              </span>
            </div>
            <div className="site-row">
              <span className="site-host mono truncate" title={pageHost}>
                {pageHost}
              </span>
              <Switch
                checked={view.active}
                onChange={(v) => act(setSiteFlag('activeSites', pageHost, site, v))}
                label={`Aktifkan blokir di ${site}`}
              >
                <span className="muted">Aktif di situs ini</span>
              </Switch>
            </div>
            <p className="site-hint muted">
              {view.active
                ? 'Semua script keblok, kecuali yang diizinkan.'
                : 'Script jalan normal, cuma yang diblok global yang keblok.'}
            </p>
          </header>

          {syncError && (
            <p className="notice notice-error" role="alert">
              Gagal menerapkan rule: {syncError}
            </p>
          )}

          {view.active && (
            <>
              <Section id="blocked-title" title="Keblok di halaman ini" aside={view.groups.length ? 'Izinkan di' : undefined}>
                <BlockedList groups={view.groups} isAllowed={view.isAllowed} onAllow={allow} />
              </Section>

              <Section id="inline-title" title="Inline script">
                <InlineList
                  rows={view.inlineRows}
                  disabled={false}
                  onToggle={(row, on) => act(setSiteFlag('inlineSites', row.host, row.site, on))}
                />
              </Section>

              <Section id="rules-title" title="Diizinkan">
                <ActiveRules rules={view.activeRules} onRemove={(id) => act(removeRule(id))} />
              </Section>
            </>
          )}

          {/* On an active site these are only the allowed scripts, so keep them folded away. */}
          <Section
            id="loaded-title"
            title="Script jalan"
            count={view.loaded}
            collapsible={view.active}
            defaultOpen={!view.active}
          >
            <LoadedList groups={view.loadedGroups} isBlocked={view.isBlocked} onBlock={block} />
          </Section>

          {(!view.active || view.pageBlocks.length > 0) && (
            <Section id="global-blocks-title" title="Diblok global">
              <BlockRules
                blocks={view.pageBlocks}
                emptyText="Belum ada blok global yang kena di halaman ini."
                onRemove={(id) => act(removeBlock(id))}
                note={(b) => {
                  const n = view.blockedBy(b);
                  return n ? `${n} keblok` : 'berlaku setelah reload';
                }}
              />
            </Section>
          )}
        </>
      )}

      {changed && tab && (
        <div className="notice reload" role="status">
          <span>{isAutoReload(settings) ? 'Tab di-reload saat ditutup.' : 'Perubahan berlaku setelah reload.'}</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void browser.tabs.reload(tab.id);
              setChanged(false);
              notify({ type: 'reloaded' });
            }}
          >
            {isAutoReload(settings) ? 'Reload sekarang' : 'Reload'}
          </button>
        </div>
      )}

      <footer className="popup-footer">
        <button type="button" className="btn btn-ghost" onClick={() => browser.runtime.openOptionsPage()}>
          Kelola semua rule →
        </button>
      </footer>
    </main>
  );
}

function groupByHost(entries: ScriptEntry[]): { host: string; entries: ScriptEntry[] }[] {
  const byHost = new Map<string, ScriptEntry[]>();
  for (const e of entries) byHost.set(e.host, [...(byHost.get(e.host) ?? []), e]);
  return [...byHost.entries()]
    .map(([host, entries]) => ({ host, entries }))
    .sort((a, b) => b.entries.length - a.entries.length);
}
