import { isListId, LISTS } from '@/lib/lists';
import type { ScriptEntry } from '@/lib/types';

export interface ListHit {
  host: string;
  entries: ScriptEntry[];
}

interface Props {
  hits: ListHit[];
  isAllowed: (host: string) => boolean;
  onAllow: (host: string) => void;
}

const listName = (id: string | undefined) => (id && isListId(id) ? LISTS[id].name : 'daftar publik');

/** Scripts a public list blocked on this page; "Izinkan" unblocks that host from the lists. */
export function ListHits({ hits, isAllowed, onAllow }: Props) {
  return (
    <ul className="list" role="list">
      {hits.map(({ host, entries }) => {
        const name = listName(entries[0]?.list);
        return (
          <li key={host} className="row list-hit">
            <span className="truncate">
              <span className="mono">{host}</span>
              <span className="muted">
                {' '}
                · {name} · {entries.length} keblok
              </span>
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
