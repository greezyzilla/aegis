import { useId, useState } from 'react';
import { isValidDomain, normalizeDomain, siteOf } from '@/lib/domain';
import { t } from '@/lib/i18n';
import { Avatar, HostName } from '../popup/parts';
import { Section } from '../popup/Section';

interface Props {
  id: string;
  title: string;
  aside: string;
  sites: string[];
  onRemove: (site: string) => void;
  /** Gets the normalized site ("www." stripped, like the popup). */
  onAdd: (site: string) => void | Promise<void>;
  /** Accessible name of the add input. */
  addLabel: string;
  /** Badges after the name, e.g. how many rules a site has. */
  extra?: (site: string) => React.ReactNode;
}

export function SiteList({ id, title, aside, sites, onRemove, onAdd, addLabel, extra }: Props) {
  const errId = useId();
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
    await onAdd(site);
    setValue('');
  };

  return (
    <Section id={id} title={title} count={sites.length} aside={aside}>
      <ul className="group" role="list">
        <li>
          <form onSubmit={submit} noValidate>
            <div className="row add-row">
              <input
                className="input mono"
                aria-label={addLabel}
                aria-invalid={!!error}
                aria-describedby={error ? errId : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="example.com"
                autoComplete="off"
              />
              <button type="submit" className="btn btn-primary">
                {t.add}
              </button>
            </div>
            {error && (
              <div className="form-errors">
                <span id={errId} className="field-error">
                  {error}
                </span>
              </div>
            )}
          </form>
        </li>
        {sites.length === 0 ? (
          <li className="row">
            <span className="empty-row">{t.sitesEmptyAddable}</span>
          </li>
        ) : (
          sites.map((s) => (
            <li key={s} className="row site-row">
              <span className="row-main">
                <span className="chevron" />
                <Avatar host={s} />
                <HostName name={s} />
                {extra?.(s)}
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => onRemove(s)} aria-label={t.removeLabel(s)}>
                {t.remove}
              </button>
            </li>
          ))
        )}
      </ul>
    </Section>
  );
}
