import { removeBlock } from '@/lib/settings';
import type { BlockRule } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Same columns as the allow-rule table, minus "Berlaku di": a global block applies everywhere. */
export function BlockTable({ blocks }: { blocks: BlockRule[] }) {
  if (blocks.length === 0) return <p className="empty muted">{t.noGlobalBlocks}</p>;

  return (
    <table className="rules">
      <thead>
        <tr>
          <th scope="col">{t.colDomain}</th>
          <th scope="col">{t.colScript}</th>
          <th scope="col">
            <span className="sr-only">{t.colActions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {blocks.map((b) => (
          <tr key={b.id} className="block-rule">
            <td className="mono">{b.domain}</td>
            <td className="mono">{b.script ?? <span className="muted">{t.anyScript}</span>}</td>
            <td className="row-actions">
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                onClick={() => void removeBlock(b.id)}
                aria-label={t.removeBlockLabel(`${b.domain}${b.script ? ' ' + b.script : ''}`)}
              >
                {t.remove}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
