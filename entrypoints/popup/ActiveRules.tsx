import { ScopeBadge } from '@/components/ScopeBadge';
import type { AllowRule } from '@/lib/types';

interface Props {
  rules: AllowRule[];
  onRemove: (id: string) => void;
}

export function ActiveRules({ rules, onRemove }: Props) {
  if (rules.length === 0) {
    return <p className="empty muted">Belum ada rule yang berlaku di sini.</p>;
  }
  return (
    <ul className="list" role="list">
      {rules.map((r) => (
        <li key={r.id} className="row rule">
          <span className="truncate">
            <span className="mono">{r.domain}</span>
            {r.script && <span className="mono muted"> / {r.script}</span>}
          </span>
          <ScopeBadge scope={r.scope} />
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={() => onRemove(r.id)}
            aria-label={`Hapus rule ${r.domain}${r.script ? ' ' + r.script : ''}`}
          >
            Hapus
          </button>
        </li>
      ))}
    </ul>
  );
}
