import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/Switch';
import { applyLang, t } from '@/lib/i18n';
import { LIST_IDS, LISTS } from '@/lib/lists';
import { addBlocks, addRules, isAutoReload, removeSite, setAutoReload, setLangPref, setSiteFlag } from '@/lib/settings';
import { useSettings } from '@/lib/useSettings';
import { Section } from '../popup/Section';
import { exportSettings, importSettings } from './backup';
import { BlockList } from './BlockList';
import { PublicLists, requestRefresh } from './PublicLists';
import { RuleForm } from './RuleForm';
import { RuleList } from './RuleList';
import { SiteList } from './SiteList';

export default function App() {
  const settings = useSettings();
  // Before any text renders: the page shows nothing until settings are read.
  if (settings) applyLang(settings.lang);
  const langPref = settings?.lang;
  useEffect(() => {
    document.title = t.optionsTitle;
  }, [langPref]);
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

  const rulesOn = (site: string) => settings.rules.filter((r) => r.scope === site).length;

  return (
    <main className="opt">
      <header className="site site-active">
        <div className="site-top">
          <div className="brand">
            <img src="/icon/32.png" alt="" width={20} height={20} />
            <h1>Aegis</h1>
          </div>
        </div>
        <p className="site-host">{t.optionsHeading}</p>
        <p className="site-sub">{t.intro}</p>
        <div className="flags">
          <span className="flag">
            <span className="dot dot-allowed" />
            {t.summarySites(settings.activeSites.length)}
          </span>
          <span className="flag">
            <span className="dot dot-allowed" />
            {t.summaryRules(settings.rules.length)}
          </span>
          <span className="flag">
            <span className="dot dot-blocked" />
            {t.summaryBlocks(settings.blocks.length)}
          </span>
          {LIST_IDS.map((id) => {
            const on = settings.lists.includes(id);
            return (
              <span key={id} className="flag">
                <span className={`dot ${on ? 'dot-blocked' : 'dot-neutral'}`} />
                {t.summaryList(LISTS[id].name, on)}
              </span>
            );
          })}
        </div>
      </header>

      <SiteList
        id="active-title"
        title={t.activeSitesTitle}
        aside={t.activeSitesAside}
        sites={settings.activeSites}
        onAdd={(site) => setSiteFlag('activeSites', site, site, true)}
        addLabel={t.addActiveSite}
        onRemove={(s) => void removeSite('activeSites', s)}
        extra={(s) => (
          <>
            {rulesOn(s) > 0 && <span className="count count-allowed">{t.ruleCount(rulesOn(s))}</span>}
            {settings.inlineSites.includes(s) && <span className="count count-allowed">{t.inlineTag}</span>}
          </>
        )}
      />

      <Section id="rules-title" title={t.allowRulesTitle} count={settings.rules.length} aside={t.rulesAside}>
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
            className="input input-select"
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
        <ul className="group" role="list">
          <li>
            <RuleForm submitLabel={t.add} onSubmit={(r) => addRules([r])} />
          </li>
          <RuleList rules={filtered} emptyText={settings.rules.length ? t.noMatch : t.noRules} />
        </ul>
      </Section>

      <Section id="blocks-title" title={t.globalBlocksTitle} count={settings.blocks.length} aside={t.globalBlocksAside}>
        <ul className="group" role="list">
          <li>
            <RuleForm
              submitLabel={t.block}
              withScope={false}
              onSubmit={({ domain, script }) => addBlocks([{ domain, script }])}
            />
          </li>
          <BlockList blocks={[...settings.blocks].sort((a, b) => a.domain.localeCompare(b.domain))} />
        </ul>
      </Section>

      <PublicLists settings={settings} />

      <SiteList
        id="inline-title"
        title={t.inlineTitle}
        aside={t.inlineAside}
        sites={settings.inlineSites}
        onAdd={(site) => setSiteFlag('inlineSites', site, site, true)}
        addLabel={t.addInlineSite}
        onRemove={(s) => void removeSite('inlineSites', s)}
      />

      <div className="two">
        <Section id="settings-title" title={t.settingsTitle}>
          <ul className="group" role="list">
            <li className="row">
              <span className="row-text">
                <b>{t.autoReload}</b>
                <span>{t.autoReloadDesc}</span>
              </span>
              <Switch checked={isAutoReload(settings)} onChange={(v) => void setAutoReload(v)} label={t.autoReload} />
            </li>
            <li className="row">
              <span className="row-text">
                <b>{t.languageTitle}</b>
                <span>{t.languageDesc}</span>
              </span>
              <select
                className="input input-lang"
                aria-label={t.languageTitle}
                value={settings.lang ?? 'auto'}
                onChange={async (e) => {
                  const v = e.target.value;
                  await setLangPref(v === 'id' || v === 'en' ? v : undefined);
                  // Every piece of text was rendered in the old language: start over.
                  location.reload();
                }}
              >
                <option value="auto">{t.langAuto}</option>
                {/* Each language in its own name, so it can be found from the other one. */}
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </li>
          </ul>
        </Section>

        <Section id="backup-title" title={t.backupTitle}>
          <ul className="group" role="list">
            <li className="row">
              <span className="row-text">
                <b>{t.backupRow}</b>
                <span>{t.backupDesc}</span>
              </span>
              <button type="button" className="btn" onClick={() => exportSettings(settings)}>
                {t.exportBtn}
              </button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                {t.importBtn}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => void onImport(e.target.files?.[0])}
              />
            </li>
          </ul>
          {status && (
            <p className={`notice status ${status.error ? 'notice-error' : ''}`} role="status">
              {status.text}
            </p>
          )}
        </Section>
      </div>
    </main>
  );
}
