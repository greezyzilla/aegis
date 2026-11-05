import { useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/Switch';
import { addBlocks, addRules, isAutoReload, removeSite, setAutoReload, setSiteFlag } from '@/lib/settings';
import { useSettings } from '@/lib/useSettings';
import { exportSettings, importSettings } from './backup';
import { BlockTable } from './BlockTable';
import { LISTS } from '@/lib/lists';
import { PublicLists, requestRefresh } from './PublicLists';
import { RuleForm } from './RuleForm';
import { RuleTable } from './RuleTable';
import { SiteList } from './SiteList';
import { t } from '@/lib/i18n';

export default function App() {
  const settings = useSettings();
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sites = useMemo(
    () => [...new Set((settings?.rules ?? []).map((r) => r.scope).filter((s) => s !== 'global'))].sort(),
    [settings],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (settings?.rules ?? [])
      .filter((r) => scopeFilter === 'all' || r.scope === scopeFilter)
      .filter((r) => !q || [r.domain, r.script ?? '', r.scope].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.domain.localeCompare(b.domain));
  }, [settings, query, scopeFilter]);

  if (!settings) return null;

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { count, listsToEnable } = await importSettings(file);
      let text = t.importRead(count);
      let error = false;
      // Lists come back on only once their data is downloaded again.
      for (const id of listsToEnable) {
        const res = await requestRefresh(id).catch((err: Error) => ({ ok: false as const, error: err.message }));
        text += ' ' + (res.ok ? t.listEnabled(LISTS[id].name) : t.listNotEnabled(LISTS[id].name, res.error));
        error ||= !res.ok;
      }
      setStatus({ text, error });
    } catch (err) {
      setStatus({ text: t.importFailed((err as Error).message), error: true });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="options">
      <header className="options-header">
        <div>
          <h1>Aegis</h1>
          <p className="muted">{t.intro}</p>
        </div>
      </header>

      <SiteList
        title={t.activeSitesTitle}
        description={t.activeSitesDesc}
        sites={settings.activeSites}
        onAdd={(site) => setSiteFlag('activeSites', site, site, true)}
        addLabel={t.addActiveSite}
        onRemove={(s) => void removeSite('activeSites', s)}
      />

      <section className="card">
        <h2>
          {t.globalBlocksTitle} <span className="muted">({settings.blocks.length})</span>
        </h2>
        <p className="muted">{t.globalBlocksDesc}</p>
        <RuleForm
          submitLabel={t.block}
          withScope={false}
          onSubmit={({ domain, script }) => addBlocks([{ domain, script }])}
        />
        <BlockTable blocks={[...settings.blocks].sort((a, b) => a.domain.localeCompare(b.domain))} />
      </section>

      <PublicLists settings={settings} />

      <section className="card">
        <h2>{t.addAllowTitle}</h2>
        <RuleForm submitLabel={t.add} onSubmit={(r) => addRules([r])} />
        <p className="muted hint">
          {t.ruleHint[0]}
          <span className="mono">example.com</span>
          {t.ruleHint[1]}
          <span className="mono">cdn.example.com</span>
          {t.ruleHint[2]}
          <span className="mono">*</span>
          {t.ruleHint[3]}
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            {t.allowRulesTitle} <span className="muted">({settings.rules.length})</span>
          </h2>
          <div className="filters">
            <input
              type="search"
              className="input"
              aria-label={t.searchRules}
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="input"
              aria-label={t.filterScope}
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
            >
              <option value="all">{t.all}</option>
              <option value="global">{t.global}</option>
              {sites.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <RuleTable rules={filtered} emptyText={settings.rules.length ? t.noMatch : t.noRules} />
      </section>

      <SiteList
        title={t.inlineTitle}
        description={t.inlineDesc}
        sites={settings.inlineSites}
        onAdd={(site) => setSiteFlag('inlineSites', site, site, true)}
        addLabel={t.addInlineSite}
        onRemove={(s) => void removeSite('inlineSites', s)}
      />

      <div className="grid-2">
        <section className="card">
          <h2>{t.settingsTitle}</h2>
          <Switch checked={isAutoReload(settings)} onChange={(v) => void setAutoReload(v)} label={t.autoReload}>
            <span>
              {t.autoReload}
              <span className="muted block">{t.autoReloadDesc}</span>
            </span>
          </Switch>
        </section>

        <section className="card">
          <h2>{t.backupTitle}</h2>
          <p className="muted">{t.backupDesc}</p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => exportSettings(settings)}>
              {t.exportJson}
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              {t.importJson}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
          </div>
          {status && (
            <p className={`notice ${status.error ? 'notice-error' : ''}`} role="status">
              {status.text}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
