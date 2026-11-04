import { useState } from 'react';
import type { ScriptEntry } from '@/lib/types';

export interface LoadedGroup {
  host: string;
  entries: ScriptEntry[];
}

interface Props {
  groups: LoadedGroup[];
  isBlocked: (entry: ScriptEntry) => boolean;
  onBlock: (host: string, script?: string) => void;
}

/** Scripts that ran on this page, each one blockable on every site. */
export function LoadedList({ groups, isBlocked, onBlock }: Props) {
  if (groups.length === 0) {
    return <p className="empty muted">Belum ada script yang jalan di halaman ini.</p>;
  }
  return (
    <ul className="list" role="list">
      {groups.map((g) => (
        <LoadedHost key={g.host} group={g} isBlocked={isBlocked} onBlock={onBlock} />
      ))}
    </ul>
  );
}

function BlockButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-block" onClick={onClick} aria-label={`Blok ${label} di semua situs`}>
      Blok global
    </button>
  );
}

function BlockedTag() {
  return <span className="pending pending-block">✓ diblok</span>;
}

function LoadedHost({ group, isBlocked, onBlock }: { group: LoadedGroup } & Omit<Props, 'groups'>) {
  const [open, setOpen] = useState(false);
  const files = groupByFile(group.entries);
  const listId = `loaded-${group.host}`;

  return (
    <li className="host loaded-host">
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
          <span className="count count-neutral">{group.entries.length}</span>
        </button>
        {group.entries.every(isBlocked) ? <BlockedTag /> : <BlockButton label={group.host} onClick={() => onBlock(group.host)} />}
      </div>
      {open && (
        <ul id={listId} className="files" role="list">
          {files.map(([file, entries]) => (
            <li key={file} className="row file">
              <span className="truncate mono" title={entries[0]?.url}>
                {file}
                {entries.length > 1 && <span className="muted"> ×{entries.length}</span>}
              </span>
              {entries.every(isBlocked) ? <BlockedTag /> : <BlockButton label={file} onClick={() => onBlock(group.host, file)} />}
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
