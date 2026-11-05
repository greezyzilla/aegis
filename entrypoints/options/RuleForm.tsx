import { useId, useState } from 'react';
import { isValidDomain, isValidScript, normalizeDomain, normalizeScript } from '@/lib/domain';
import type { NewRule } from '@/lib/types';
import { t } from '@/lib/i18n';

interface Props {
  initial?: NewRule;
  submitLabel: string;
  onSubmit: (rule: NewRule) => void | Promise<void>;
  onCancel?: () => void;
  /** Hide "Berlaku di" (global blocks have no scope; submitted as global). */
  withScope?: boolean;
}

type Errors = Partial<Record<'domain' | 'script' | 'site', string>>;

export function RuleForm({ initial, submitLabel, onSubmit, onCancel, withScope = true }: Props) {
  const id = useId();
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [script, setScript] = useState(initial?.script ?? '');
  const [isGlobal, setIsGlobal] = useState(!initial || initial.scope === 'global');
  const [site, setSite] = useState(initial && initial.scope !== 'global' ? initial.scope : '');
  const [errors, setErrors] = useState<Errors>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = normalizeDomain(domain);
    const s = normalizeScript(script);
    const st = normalizeDomain(site);
    const next: Errors = {};
    if (!isValidDomain(d)) next.domain = t.invalidDomain;
    if (s && !isValidScript(s)) next.script = t.invalidScript;
    if (!isGlobal && !isValidDomain(st)) next.site = t.invalidSite;
    setErrors(next);
    if (Object.keys(next).length) return;

    await onSubmit({ domain: d, script: s || undefined, scope: isGlobal ? 'global' : st });
    if (!initial) {
      setDomain('');
      setScript('');
    }
  };

  const field = (name: keyof Errors) => ({
    id: `${id}-${name}`,
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `${id}-${name}-err` : undefined,
  });
  const error = (name: keyof Errors) =>
    errors[name] && (
      <span id={`${id}-${name}-err`} className="field-error">
        {errors[name]}
      </span>
    );

  return (
    <form className={withScope ? 'rule-form' : 'rule-form rule-form-noscope'} onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-domain`}>{t.scriptDomain}</label>
        <input
          {...field('domain')}
          className="input mono"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="cdn.jsdelivr.net"
          autoComplete="off"
        />
        {error('domain')}
      </div>
      <div className="field">
        <label htmlFor={`${id}-script`}>
          {t.scriptName} <span className="muted">{t.optional}</span>
        </label>
        <input
          {...field('script')}
          className="input mono"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="jquery.min.js"
          autoComplete="off"
        />
        {error('script')}
      </div>
      {withScope && (
        <div className="field">
          <label htmlFor={`${id}-scope`}>{t.colScope}</label>
          <div className="scope-input">
            <select
              id={`${id}-scope`}
              className="input"
              value={isGlobal ? 'global' : 'site'}
              onChange={(e) => setIsGlobal(e.target.value === 'global')}
            >
              <option value="global">{t.everySite}</option>
              <option value="site">{t.specificSite}</option>
            </select>
            {!isGlobal && (
              <input
                {...field('site')}
                aria-label={t.site}
                className="input mono"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="github.com"
                autoComplete="off"
              />
            )}
          </div>
          {error('site')}
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            {t.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
