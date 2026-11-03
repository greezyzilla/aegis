import { browser } from '#imports';
import { useMemo, useState } from 'react';
import { Switch } from '@/components/Switch';
import { hostFromUrl, hostMatches, normalizeScript, siteOf } from '@/lib/domain';
import { addRules, removeRule, ruleMatches, setEnabled, setSiteFlag } from '@/lib/settings';
import type { ScriptEntry } from '@/lib/types';
import { useSettings } from '@/lib/useSettings';
import { ActiveRules } from './ActiveRules';
import { BlockedList, type BlockedGroup } from './BlockedList';
import { InlineList, type InlineRow } from './InlineList';
import { useActiveTab } from './useActiveTab';

export default function App() {
  const settings = useSettings();
  const { tab, state, syncError } = useActiveTab();
  const [changed, setChanged] = useState(false);

  const pageHost = hostFromUrl(tab?.url);
  const site = pageHost ? siteOf(pageHost) : null;

  const view = useMemo(() => {
    if (!settings || !pageHost) return null;
    const paused = settings.pausedSites.some((d) => hostMatches(pageHost, d));
    const isAllowed = (e: ScriptEntry) => paused || settings.rules.some((r) => ruleMatches(r, e));

    const byHost = new Map<string, ScriptEntry[]>();
    for (const e of state.scripts) {
      if (e.blocked) byHost.set(e.host, [...(byHost.get(e.host) ?? []), e]);
    }
    const groups: BlockedGroup[] = [...byHost.entries()]
      .map(([host, entries]) => ({ host, entries }))
      .sort((a, b) => b.entries.length - a.entries.length);

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

    return { paused, isAllowed, groups, activeRules, loaded, inlineRows };
  }, [settings, pageHost, state]);

  const act = (p: Promise<void>) => {
    setChanged(true);
    void p;
  };

  const allow = (entries: ScriptEntry[], host: string, scope: 'site' | 'global', file?: string) => {
    const script = file ? normalizeScript(file) : undefined;
    if (scope === 'global') return act(addRules([{ domain: host, script, scope: 'global' }]));
    // Scope to the document that loaded the script (usually the page, sometimes an iframe).
    const scopes = new Set(entries.map((e) => siteOf(e.initiator || pageHost!)));
    act(addRules([...scopes].map((s) => ({ domain: host, script, scope: s }))));
  };

  if (!settings) return null;

  return (
    <main className="popup">
      <header className="popup-header">
        <h1>Aegis</h1>
        <Switch checked={settings.enabled} onChange={(v) => act(setEnabled(v))} label="Aktifkan blokir script">
          <span className="muted">{settings.enabled ? 'Aktif' : 'Mati'}</span>
        </Switch>
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
            }}
          >
            Reload
          </button>
        </div>
      )}

      {!settings.enabled ? (
        <p className="empty muted">Blokir script lagi mati. Nyalakan untuk memblok semua script secara default.</p>
      ) : !view || !site || !pageHost ? (
        <p className="empty muted">Halaman ini nggak bisa diatur (bukan http/https).</p>
      ) : (
        <>
          <section className="site" aria-label="Pengaturan situs ini">
            <div className="site-host mono truncate" title={pageHost}>
              {pageHost}
            </div>
            <Switch
              checked={view.paused}
              onChange={(v) => act(setSiteFlag('pausedSites', pageHost, site, v))}
              label={`Jeda blokir di ${site}`}
            >
              <span>Jeda di situs ini</span>
            </Switch>
          </section>

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
              disabled={view.paused}
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

      <footer className="popup-footer">
        <button type="button" className="btn btn-ghost" onClick={() => browser.runtime.openOptionsPage()}>
          Kelola semua rule →
        </button>
      </footer>
    </main>
  );
}
