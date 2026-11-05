import { useId, useState } from 'react';
import { isValidDomain, normalizeDomain, siteOf } from '@/lib/domain';
import { t } from '@/lib/i18n';

interface Props {
  title: string;
  description: string;
  sites: string[];
  onRemove: (site: string) => void;
  /** Shows an input to add a site by hand. Gets the normalized site ("www." stripped, like the popup). */
  onAdd?: (site: string) => void | Promise<void>;
  /** Accessible name of the add input. */
  addLabel?: string;
}

export function SiteList({ title, description, sites, onRemove, onAdd, addLabel }: Props) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const site = siteOf(normalizeDomain(value));
    if (!isValidDomain(site)) {
      setError(t.invalidSite);
      return;
    }
    setError(null);
    await onAdd?.(site);
    setValue('');
  };

  return (
    <section className="card">
      <h2>
        {title} <span className="muted">({sites.length})</span>
      </h2>
      <p className="muted">{description}</p>
      {onAdd && (
        <form className="site-add" onSubmit={submit} noValidate>
          <input
            className="input mono"
            aria-label={addLabel ?? t.addNamed(title)}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="example.com"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary">
            {t.add}
          </button>
          {error && (
            <span id={`${id}-err`} className="field-error">
              {error}
            </span>
          )}
        </form>
      )}
      {sites.length === 0 ? (
        <p className="empty muted">{onAdd ? t.sitesEmptyAddable : t.sitesEmpty}</p>
      ) : (
        <ul className="chips" role="list">
          {sites.map((s) => (
            <li key={s} className="chip">
              <span className="mono">{s}</span>
              <button type="button" className="chip-remove" onClick={() => onRemove(s)} aria-label={t.removeLabel(s)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
