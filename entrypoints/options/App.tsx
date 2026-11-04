import { useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/Switch';
import { BlockRules } from '@/components/BlockRules';
import { addBlocks, addRules, isAutoReload, removeBlock, removeSite, setAutoReload } from '@/lib/settings';
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
            Di situs aktif semua script keblok, rule izin nentuin mana yang boleh lolos. Blok global berlaku di semua
            situs.
          </p>
        </div>
      </header>

      <section className="card">
        <Switch
          checked={isAutoReload(settings)}
          onChange={(v) => void setAutoReload(v)}
          label="Reload otomatis saat popup ditutup"
        >
          <span>
            Reload otomatis saat popup ditutup
            <span className="muted block">Kalau ada perubahan di popup, tab-nya di-reload sekali.</span>
          </span>
        </Switch>
      </section>

      <section className="card">
        <h2>Tambah rule izin</h2>
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
            Rule izin <span className="muted">({settings.rules.length})</span>
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

      <section className="card">
        <h2>
          Blok global <span className="muted">({settings.blocks.length})</span>
        </h2>
        <p className="muted">Diblok di semua situs, aktif atau nggak, dan menang lawan rule izin.</p>
        <RuleForm
          submitLabel="Blok"
          withScope={false}
          onSubmit={({ domain, script }) => addBlocks([{ domain, script }])}
        />
        <BlockRules
          blocks={[...settings.blocks].sort((a, b) => a.domain.localeCompare(b.domain))}
          emptyText="Belum ada blok global."
          onRemove={(id) => void removeBlock(id)}
        />
      </section>

      <div className="grid-2">
        <SiteList
          title="Situs aktif"
          description="Semua script keblok di sini, kecuali yang diizinkan."
          sites={settings.activeSites}
          onRemove={(s) => void removeSite('activeSites', s)}
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
