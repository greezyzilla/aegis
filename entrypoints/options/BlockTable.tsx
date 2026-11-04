import { removeBlock } from '@/lib/settings';
import type { BlockRule } from '@/lib/types';

/** Same columns as the allow-rule table, minus "Berlaku di": a global block applies everywhere. */
export function BlockTable({ blocks }: { blocks: BlockRule[] }) {
  if (blocks.length === 0) return <p className="empty muted">Belum ada blok global.</p>;

  return (
    <table className="rules">
      <thead>
        <tr>
          <th scope="col">Domain</th>
          <th scope="col">Script</th>
          <th scope="col">
            <span className="sr-only">Aksi</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {blocks.map((b) => (
          <tr key={b.id} className="block-rule">
            <td className="mono">{b.domain}</td>
            <td className="mono">{b.script ?? <span className="muted">semua</span>}</td>
            <td className="row-actions">
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                onClick={() => void removeBlock(b.id)}
                aria-label={`Hapus blok ${b.domain}${b.script ? ' ' + b.script : ''}`}
              >
                Hapus
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
