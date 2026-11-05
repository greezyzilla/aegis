import { useState } from 'react';
import type { ScriptEntry } from '@/lib/types';
import { Avatar, Count, HostName, Icon } from './parts';

export interface LoadedGroup {
  host: string;
  entries: ScriptEntry[];
}

interface Props {
  groups: LoadedGroup[];
  isBlocked: (entry: ScriptEntry) => boolean;
  isOwn: (host: string) => boolean;
  onBlock: (host: string, script?: string) => void;
}

/** Scripts that ran on this page, each one blockable on every site (except the site's own). */
export function LoadedList({ groups, isBlocked, isOwn, onBlock }: Props) {
  if (groups.length === 0) {
    return <p className="empty">Belum ada script yang jalan di halaman ini.</p>;
  }
  return (
    <ul className="group" role="list">
      {groups.map((g) => (
        <LoadedHost key={g.host} group={g} own={isOwn(g.host)} isBlocked={isBlocked} onBlock={onBlock} />
      ))}
    </ul>
  );
}

function BlockButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn" onClick={onClick} aria-label={`Blok ${label} di semua situs`}>
      {Icon.ban}
      Blok
    </button>
  );
}

function BlockedTag() {
  return <span className="pending pending-block">✓ diblok</span>;
}

function LoadedHost({
  group,
  own,
  isBlocked,
  onBlock,
}: { group: LoadedGroup; own: boolean } & Pick<Props, 'isBlocked' | 'onBlock'>) {
  const [open, setOpen] = useState(false);
  const files = groupByFile(group.entries);
  const listId = `loaded-${group.host}`;
  // Blocking the site's own scripts everywhere would break it: not offered.
  const action = (entries: ScriptEntry[], label: string, file?: string) =>
    own ? null : entries.every(isBlocked) ? (
      <BlockedTag />
    ) : (
      <BlockButton label={label} onClick={() => onBlock(group.host, file)} />
    );

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
          <span className="chevron">{Icon.chevron}</span>
          <Avatar host={group.host} own={own} />
          <HostName name={group.host} />
          <Count n={group.entries.length} tone="neutral" />
        </button>
        {action(group.entries, group.host)}
      </div>
      {open && (
        <ul id={listId} className="files" role="list">
          {files.map(([file, entries]) => (
            <li key={file} className="row file">
              <span className="file-name" title={entries[0]?.url}>
                <HostName name={file} className="mono" />
                <Count n={entries.length} tone="neutral" />
              </span>
              {action(entries, file, file)}
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
