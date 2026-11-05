import { t } from '@/lib/i18n';
import { removeBlock } from '@/lib/settings';
import type { BlockRule } from '@/lib/types';
import { Avatar, HostName } from '../popup/parts';

/** Global blocks, one row each, under the add row. */
export function BlockList({ blocks }: { blocks: BlockRule[] }) {
  if (blocks.length === 0) {
    return (
      <li className="row">
        <span className="empty-row">{t.noGlobalBlocks}</span>
      </li>
    );
  }
  return (
    <>
      {blocks.map((b) => (
        <li key={b.id} className="row block-rule">
          <span className="row-main">
            <span className="chevron" />
            <Avatar host={b.domain} />
            <HostName name={b.script ? `${b.domain} / ${b.script}` : b.domain} />
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void removeBlock(b.id)}
            aria-label={t.removeBlockLabel(`${b.domain}${b.script ? ' ' + b.script : ''}`)}
          >
            {t.remove}
          </button>
        </li>
      ))}
    </>
  );
}
