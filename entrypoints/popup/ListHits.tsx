import { isListId, LISTS } from '@/lib/lists';
import type { BlockRule, ScriptEntry } from '@/lib/types';
import { Avatar, Count, HostName, Icon } from './parts';

export interface ListHit {
  host: string;
  entries: ScriptEntry[];
}

const listName = (id: string | undefined) => (id && isListId(id) ? LISTS[id].name : 'daftar publik');

interface Props {
  /** The user's own global blocks that hit this page. */
  blocks: BlockRule[];
  blockedBy: (block: BlockRule) => number;
  onRemove: (id: string) => void;
  /** Scripts a public list blocked on this page. */
  hits: ListHit[];
  isAllowed: (host: string) => boolean;
  onAllow: (host: string) => void;
}

/** "Diblok global": the user's blocks (removable) and public list hits (allowable per host). */
export function GlobalBlocks({ blocks, blockedBy, onRemove, hits, isAllowed, onAllow }: Props) {
  if (blocks.length === 0 && hits.length === 0) {
    return <p className="empty">Belum ada blok global yang kena di halaman ini.</p>;
  }
  return (
    <ul className="group" role="list">
      {blocks.map((b) => {
        const label = `${b.domain}${b.script ? ' ' + b.script : ''}`;
        const n = blockedBy(b);
        return (
          <li key={b.id} className="row block-rule">
            <span className="row-main">
              <span className="chevron" />
              <Avatar host={b.domain} />
              <HostName name={b.script ? `${b.domain} / ${b.script}` : b.domain} />
              {n > 0 ? <Count n={n} tone="blocked" /> : <span className="meta">berlaku setelah reload</span>}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onRemove(b.id)}
              aria-label={`Hapus blok ${label}`}
            >
              Hapus
            </button>
          </li>
        );
      })}
      {hits.map(({ host, entries }) => {
        const name = listName(entries[0]?.list);
        return (
          <li key={host} className="row list-hit">
            <span className="row-main">
              <span className="chevron lead" title={name}>
                {Icon.shield}
              </span>
              <Avatar host={host} />
              <HostName name={host} />
              <Count n={entries.length} tone="blocked" />
              <span className="sr-only">{name}</span>
            </span>
            {isAllowed(host) ? (
              <span className="pending">✓ diizinkan</span>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => onAllow(host)}
                aria-label={`Izinkan ${host} dari ${name}`}
              >
                Izinkan
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
