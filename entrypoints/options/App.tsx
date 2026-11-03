import { useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/Switch';
import { addRules, removeSite, setEnabled } from '@/lib/settings';
import { useSettings } from '@/lib/useSettings';
import { exportSettings, importSettings } from './backup';
import { RuleForm } from './RuleForm';
import { RuleTable } from './RuleTable';
import { SiteList } from './SiteList';

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
      const n = await importSettings(file);
      setStatus({ text: `${n} rule dibaca dan digabung (duplikat dilewati).` });
    } catch (err) {
      setStatus({ text: `Import gagal: ${(err as Error).message}`, error: true });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="options">
      <header className="options-header">
        <div>
          <h1>Aegis</h1>
          <p className="muted">
            Kalau aktif, semua script keblok. Rule di bawah nentuin script mana yang boleh lolos.
          </p>
        </div>
        <Switch checked={settings.enabled} onChange={(v) => void setEnabled(v)} label="Aktifkan blokir script">
          <span>{settings.enabled ? 'Aktif' : 'Mati'}</span>
        </Switch>
      </header>

      <section className="card">
        <h2>Tambah rule</h2>
        <RuleForm submitLabel="Tambah" onSubmit={(r) => addRules([r])} />
        <p className="muted hint">
          Domain ikut nge-cover subdomain-nya (<span className="mono">example.com</span> →{' '}
          <span className="mono">cdn.example.com</span>). Nama script dicocokkan ke path URL, <span className="mono">*</span>{' '}
          jadi wildcard.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            Rule <span className="muted">({settings.rules.length})</span>
          </h2>
          <div className="filters">
            <input
              type="search"
              className="input"
              aria-label="Cari rule"
              placeholder="Cari domain, script, situs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="input"
              aria-label="Filter berlaku di"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
            >
              <option value="all">Semua</option>
              <option value="global">Global</option>
              {sites.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <RuleTable
          rules={filtered}
          emptyText={settings.rules.length ? 'Nggak ada rule yang cocok.' : 'Belum ada rule. Tambah di atas atau dari popup.'}
        />
      </section>

      <div className="grid-2">
        <SiteList
          title="Situs dijeda"
          description="Blokir mati total di situs ini."
          sites={settings.pausedSites}
          onRemove={(s) => void removeSite('pausedSites', s)}
        />
        <SiteList
          title="Inline script diizinkan"
          description="Script inline di HTML boleh jalan di situs ini."
          sites={settings.inlineSites}
          onRemove={(s) => void removeSite('inlineSites', s)}
        />
      </div>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted">Import digabung ke rule yang ada, bukan menimpa.</p>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => exportSettings(settings)}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
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
    </main>
  );
}
