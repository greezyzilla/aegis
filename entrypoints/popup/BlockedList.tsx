import { useState } from 'react';
import type { ScriptEntry } from '@/lib/types';
import { Avatar, Count, HostName, Icon, SplitAllow } from './parts';
import { t } from '@/lib/i18n';

export interface BlockedGroup {
  host: string;
  entries: ScriptEntry[];
}

interface Props {
  groups: BlockedGroup[];
  isAllowed: (entry: ScriptEntry) => boolean;
  isOwn: (host: string) => boolean;
  onAllow: (entries: ScriptEntry[], host: string, scope: 'site' | 'global', script?: string) => void;
  /** The site was switched on after this page loaded, so nothing on it was blocked yet. */
  loadedBeforeActive: boolean;
}

export function BlockedList({ groups, isAllowed, isOwn, onAllow, loadedBeforeActive }: Props) {
  if (groups.length === 0) {
    return <p className="empty">{loadedBeforeActive ? t.loadedBeforeActive : t.noBlocked}</p>;
  }
  return (
    <ul className="group" role="list">
      {groups.map((g) => (
        <BlockedHost key={g.host} group={g} own={isOwn(g.host)} isAllowed={isAllowed} onAllow={onAllow} />
      ))}
    </ul>
  );
}

function PendingTag() {
  return <span className="pending">{t.allowedTag}</span>;
}

function BlockedHost({
  group,
  own,
  isAllowed,
  onAllow,
}: { group: BlockedGroup; own: boolean } & Pick<Props, 'isAllowed' | 'onAllow'>) {
  const [open, setOpen] = useState(false);
  const files = groupByFile(group.entries);
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
          <span className="chevron">{Icon.chevron}</span>
          <Avatar host={group.host} own={own} />
          <HostName name={group.host} />
          <Count n={group.entries.length} tone="blocked" />
        </button>
        {group.entries.every(isAllowed) ? (
          <PendingTag />
        ) : (
          <SplitAllow
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
              <span className="file-name" title={entries[0]?.url}>
                <HostName name={file} className="mono" />
                <Count n={entries.length} tone="blocked" />
              </span>
              {entries.every(isAllowed) ? (
                <PendingTag />
              ) : (
                <SplitAllow
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
