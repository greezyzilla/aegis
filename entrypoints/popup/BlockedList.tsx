import { useState } from 'react';
import type { ScriptEntry } from '@/lib/types';

export interface BlockedGroup {
  host: string;
  entries: ScriptEntry[];
}

interface Props {
  groups: BlockedGroup[];
  isAllowed: (entry: ScriptEntry) => boolean;
  onAllow: (entries: ScriptEntry[], host: string, scope: 'site' | 'global', script?: string) => void;
}

export function BlockedList({ groups, isAllowed, onAllow }: Props) {
  if (groups.length === 0) {
    return <p className="empty muted">Belum ada script yang keblok di halaman ini.</p>;
  }
  return (
    <ul className="list" role="list">
      {groups.map((g) => (
        <BlockedHost key={g.host} group={g} isAllowed={isAllowed} onAllow={onAllow} />
      ))}
    </ul>
  );
}

function AllowButtons({ onSite, onGlobal, label }: { onSite: () => void; onGlobal: () => void; label: string }) {
  return (
    <div className="actions">
      <button type="button" className="btn" onClick={onSite} aria-label={`Izinkan ${label} di situs ini`}>
        Situs ini
      </button>
      <button type="button" className="btn" onClick={onGlobal} aria-label={`Izinkan ${label} di semua situs`}>
        Global
      </button>
    </div>
  );
}

function PendingTag() {
  return <span className="pending">✓ diizinkan</span>;
}

function BlockedHost({ group, isAllowed, onAllow }: { group: BlockedGroup } & Omit<Props, 'groups'>) {
  const [open, setOpen] = useState(false);
  const files = groupByFile(group.entries);
  const allAllowed = group.entries.every(isAllowed);
  const listId = `files-${group.host}`;

  return (
    <li className="host">
      <div className="row">
        <button
          type="button"
          className="disclosure"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          <span className="chevron" aria-hidden="true">
            ›
          </span>
          <span className="truncate mono">{group.host}</span>
          <span className="count">{group.entries.length}</span>
        </button>
        {allAllowed ? (
          <PendingTag />
        ) : (
          <AllowButtons
            label={group.host}
            onSite={() => onAllow(group.entries, group.host, 'site')}
            onGlobal={() => onAllow(group.entries, group.host, 'global')}
          />
        )}
      </div>
      {open && (
        <ul id={listId} className="files" role="list">
          {files.map(([file, entries]) => (
            <li key={file} className="row file">
              <span className="truncate mono" title={entries[0]?.url}>
                {file}
                {entries.length > 1 && <span className="muted"> ×{entries.length}</span>}
              </span>
              {entries.every(isAllowed) ? (
                <PendingTag />
              ) : (
                <AllowButtons
                  label={file}
                  onSite={() => onAllow(entries, group.host, 'site', file)}
                  onGlobal={() => onAllow(entries, group.host, 'global', file)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function groupByFile(entries: ScriptEntry[]): [string, ScriptEntry[]][] {
  const map = new Map<string, ScriptEntry[]>();
  for (const e of entries) map.set(e.file, [...(map.get(e.file) ?? []), e]);
  return [...map.entries()];
}
