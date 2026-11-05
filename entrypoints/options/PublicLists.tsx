import { browser, storage } from '#imports';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/Switch';
import { t } from '@/lib/i18n';
import { LIST_IDS, LISTS, listDataItem, listErrorItem, type ListData, type ListId } from '@/lib/lists';
import { readAndWatch } from '@/lib/readAndWatch';
import { disableList, setListAllow } from '@/lib/settings';
import { LIST_REFRESH, listDroppedKey, type ListRefreshMessage, type ListRefreshResult } from '@/lib/tabs';
import type { Settings } from '@/lib/types';
import { Avatar, Count, HostName, Icon } from '../popup/parts';
import { Section } from '../popup/Section';

/** Asks the background to download a list; it enables the list once the download succeeds. */
export function requestRefresh(id: ListId): Promise<ListRefreshResult> {
  const msg: ListRefreshMessage = { type: LIST_REFRESH, id };
  return browser.runtime.sendMessage(msg) as Promise<ListRefreshResult>;
}

export function PublicLists({ settings }: { settings: Settings }) {
  return (
    <Section id="lists-title" title={t.publicListsTitle} aside={t.publicListsAside}>
      <ul className="group" role="list">
        {LIST_IDS.map((id) => (
          <PublicList key={id} id={id} enabled={settings.lists.includes(id)} />
        ))}
        <li className="row scope-head">
          <span className="row-main">
            <HostName name={t.allowedFromList} />
            <Count n={settings.listAllow.length} tone="neutral" />
          </span>
        </li>
        {settings.listAllow.length === 0 ? (
          <li className="row">
            <span className="empty-row">{t.noListAllow}</span>
          </li>
        ) : (
          settings.listAllow.map((h) => (
            <li key={h} className="row rule-row">
              <span className="row-main">
                <span className="chevron" />
                <Avatar host={h} />
                <HostName name={h} />
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void setListAllow(h, false)}
                aria-label={t.reblockFromList(h)}
              >
                {t.reblock}
              </button>
            </li>
          ))
        )}
      </ul>
    </Section>
  );
}

function PublicList({ id, enabled }: { id: ListId; enabled: boolean }) {
  const list = LISTS[id];
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropped, setDropped] = useState<number | null>(null);

  useEffect(
    () =>
      readAndWatch(
        () => listDataItem(id).getValue(),
        (cb) => listDataItem(id).watch(cb),
        setData,
      ),
    [id],
  );
  useEffect(
    () =>
      readAndWatch(
        () => storage.getItem<number>(listDroppedKey),
        (cb) => storage.watch<number>(listDroppedKey, cb),
        setDropped,
      ),
    [],
  );
  useEffect(
    () =>
      readAndWatch(
        () => listErrorItem(id).getValue(),
        (cb) => listErrorItem(id).watch(cb),
        setError,
      ),
    [id],
  );

  const unblocks = data?.filters?.filter((f) => f.allow).length ?? 0;
  const paths = (data?.filters?.length ?? 0) - unblocks;
  const ready = enabled && data && !busy;

  const refresh = async () => {
    setBusy(true);
    const res = await requestRefresh(id).catch((err: Error) => ({ ok: false as const, error: err.message }));
    if (!res.ok) setError(res.error);
    setBusy(false);
  };

  return (
    <li className="public-list">
      <div className="row">
        <span className="row-main">
          <span className="lead-ico">{Icon.shield}</span>
          <span className="row-text">
            <b>{list.name}</b>
            <span>
              {new URL(list.url).host} · {t.license(list.license)}
            </span>
          </span>
        </span>
        {ready && (
          <button type="button" className="btn" onClick={() => void refresh()}>
            {t.refreshNow}
          </button>
        )}
        <Switch
          checked={enabled}
          disabled={busy}
          onChange={(on) => void (on ? refresh() : disableList(id))}
          label={t.enableList(list.name)}
        />
      </div>
      {busy && (
        <p className="list-note" role="status">
          {t.downloading(list.name)}
        </p>
      )}
      {ready && (
        <p className="list-note">
          {t.listStats(data.domains.length, paths, data.exceptions.length + unblocks, data.updatedAt)}
        </p>
      )}
      {ready && !!dropped && (
        <p className="list-note" role="note">
          {t.pathsDropped(dropped)}
        </p>
      )}
      {error && !busy && (
        <p className="list-note field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
