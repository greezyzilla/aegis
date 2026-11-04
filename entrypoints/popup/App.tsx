import { browser, type Browser } from '#imports';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/Switch';
import { hostFromUrl, hostMatches, normalizeScript, siteOf } from '@/lib/domain';
import { BlockRules } from '@/components/BlockRules';
import { addBlocks, addRules, blockMatches, removeBlock, removeRule, ruleMatches, setSiteFlag } from '@/lib/settings';
import { POPUP_PORT, type PopupPortMessage } from '@/lib/tabs';
import type { ScriptEntry } from '@/lib/types';
import { useSettings } from '@/lib/useSettings';
import { ActiveRules } from './ActiveRules';
import { BlockedList, type BlockedGroup } from './BlockedList';
import { InlineList, type InlineRow } from './InlineList';
import { LoadedList, type LoadedGroup } from './LoadedList';
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

    return { active, isAllowed, isBlocked, groups, loadedGroups, pageBlocks, blockedBy, activeRules, loaded, inlineRows };
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
      <header className="popup-header">
        <h1>Aegis</h1>
      </header>

      {syncError && (
        <p className="notice notice-error" role="alert">
          Gagal menerapkan rule: {syncError}
        </p>
      )}

      {changed && tab && (
        <div className="notice reload" role="status">
          <span>Perubahan berlaku setelah reload.</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void browser.tabs.reload(tab.id);
              setChanged(false);
              notify({ type: 'reloaded' });
            }}
          >
            Reload
          </button>
        </div>
      )}

      {!view || !site || !pageHost ? (
        <p className="empty muted">Halaman ini nggak bisa diatur (bukan http/https).</p>
      ) : (
        <>
          <section className="site" aria-label="Pengaturan situs ini">
            <div className="site-host mono truncate" title={pageHost}>
              {pageHost}
            </div>
            <Switch
              checked={view.active}
              onChange={(v) => act(setSiteFlag('activeSites', pageHost, site, v))}
              label={`Aktifkan blokir di ${site}`}
            >
              <span>Aktif di situs ini</span>
            </Switch>
            <p className="site-hint muted">
              {view.active
                ? 'Semua script keblok, kecuali yang diizinkan.'
                : 'Script jalan normal, cuma yang diblok global yang keblok.'}
            </p>
          </section>

          {view.active && (
            <>
              <section aria-labelledby="blocked-title">
                <h2 id="blocked-title" className="section-title">
                  Keblok di halaman ini
                  <span className="muted"> · {view.loaded} lolos</span>
                </h2>
                <BlockedList groups={view.groups} isAllowed={view.isAllowed} onAllow={allow} />
              </section>

              <section aria-labelledby="inline-title">
                <h2 id="inline-title" className="section-title">
                  Inline script
                </h2>
                <InlineList
                  rows={view.inlineRows}
                  disabled={false}
                  onToggle={(row, on) => act(setSiteFlag('inlineSites', row.host, row.site, on))}
                />
              </section>

              <section aria-labelledby="rules-title">
                <h2 id="rules-title" className="section-title">
                  Diizinkan
                </h2>
                <ActiveRules rules={view.activeRules} onRemove={(id) => act(removeRule(id))} />
              </section>
            </>
          )}

          <section aria-labelledby="loaded-title">
            <h2 id="loaded-title" className="section-title">
              Script jalan
            </h2>
            <LoadedList groups={view.loadedGroups} isBlocked={view.isBlocked} onBlock={block} />
          </section>

          <section aria-labelledby="global-blocks-title">
            <h2 id="global-blocks-title" className="section-title">
              Diblok global
            </h2>
            <BlockRules
              blocks={view.pageBlocks}
              emptyText="Belum ada blok global yang kena di halaman ini."
              onRemove={(id) => act(removeBlock(id))}
              note={(b) => {
                const n = view.blockedBy(b);
                return n ? `${n} keblok` : 'berlaku setelah reload';
              }}
            />
          </section>
        </>
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
