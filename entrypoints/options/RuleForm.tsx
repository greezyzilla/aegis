import { useId, useState } from 'react';
import { isValidDomain, isValidScript, normalizeDomain, normalizeScript } from '@/lib/domain';
import type { NewRule } from '@/lib/types';

interface Props {
  initial?: NewRule;
  submitLabel: string;
  onSubmit: (rule: NewRule) => void | Promise<void>;
  onCancel?: () => void;
}

type Errors = Partial<Record<'domain' | 'script' | 'site', string>>;

export function RuleForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
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
    if (!isValidDomain(d)) next.domain = 'Domain nggak valid, contoh: cdn.jsdelivr.net';
    if (s && !isValidScript(s)) next.script = 'Hanya karakter ASCII tanpa spasi';
    if (!isGlobal && !isValidDomain(st)) next.site = 'Situs nggak valid, contoh: github.com';
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
    <form className="rule-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-domain`}>Domain script</label>
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
          Nama script <span className="muted">(opsional)</span>
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
      <div className="field">
        <label htmlFor={`${id}-scope`}>Berlaku di</label>
        <div className="scope-input">
          <select
            id={`${id}-scope`}
            className="input"
            value={isGlobal ? 'global' : 'site'}
            onChange={(e) => setIsGlobal(e.target.value === 'global')}
          >
            <option value="global">Semua situs</option>
            <option value="site">Situs tertentu</option>
          </select>
          {!isGlobal && (
            <input
              {...field('site')}
              aria-label="Situs"
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
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
