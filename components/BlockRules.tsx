import type { BlockRule } from '@/lib/types';
import { t } from '@/lib/i18n';

interface Props {
  blocks: BlockRule[];
  emptyText: string;
  onRemove: (id: string) => void;
  /** Optional per-rule note, e.g. how many scripts it blocked on this page. */
  note?: (block: BlockRule) => string | undefined;
}

export function BlockRules({ blocks, emptyText, onRemove, note }: Props) {
  if (blocks.length === 0) return <p className="empty muted">{emptyText}</p>;
  return (
    <ul className="list" role="list">
      {blocks.map((b) => {
        const label = `${b.domain}${b.script ? ' ' + b.script : ''}`;
        const extra = note?.(b);
        return (
          <li key={b.id} className="row block-rule">
            <span className="truncate">
              <span className="mono">{b.domain}</span>
              {b.script && <span className="mono muted"> / {b.script}</span>}
              {extra && <span className="muted"> · {extra}</span>}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => onRemove(b.id)}
              aria-label={t.removeBlockLabel(label)}
            >
              {t.remove}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
