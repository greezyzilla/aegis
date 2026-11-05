import { browser, storage } from '#imports';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/Switch';
import { LIST_IDS, LISTS, listDataItem, listErrorItem, type ListData, type ListId } from '@/lib/lists';
import { readAndWatch } from '@/lib/readAndWatch';
import { disableList, setListAllow } from '@/lib/settings';
import { LIST_REFRESH, listDroppedKey, type ListRefreshMessage, type ListRefreshResult } from '@/lib/tabs';
import type { Settings } from '@/lib/types';

const fmt = new Intl.NumberFormat('id-ID');
const fmtDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Asks the background to download a list; it enables the list once the download succeeds. */
export function requestRefresh(id: ListId): Promise<ListRefreshResult> {
  const msg: ListRefreshMessage = { type: LIST_REFRESH, id };
  return browser.runtime.sendMessage(msg) as Promise<ListRefreshResult>;
}

export function PublicLists({ settings }: { settings: Settings }) {
  return (
    <section className="card">
      <h2>Daftar publik</h2>
      <p className="muted">
        Daftar tracker yang dikelola komunitas, diblok di semua situs seperti blok global. Diunduh dari sumbernya dan
        diperbarui otomatis tiap minggu.
      </p>
      <ul className="public-lists" role="list">
        {LIST_IDS.map((id) => (
          <PublicList key={id} id={id} enabled={settings.lists.includes(id)} />
        ))}
      </ul>
      <h3 className="subhead">
        Diizinkan dari daftar <span className="muted">({settings.listAllow.length})</span>
      </h3>
      {settings.listAllow.length === 0 ? (
        <p className="empty muted">Belum ada. Izinkan dari popup kalau daftar bikin situs rusak.</p>
      ) : (
        <ul className="chips" role="list">
          {settings.listAllow.map((h) => (
            <li key={h} className="chip">
              <span className="mono">{h}</span>
              <button
                type="button"
                className="chip-remove"
                onClick={() => void setListAllow(h, false)}
                aria-label={`Blok lagi ${h} dari daftar`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PublicList({ id, enabled }: { id: ListId; enabled: boolean }) {
  const list = LISTS[id];
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropped, setDropped] = useState<number | null>(null);

  useEffect(() => readAndWatch(() => listDataItem(id).getValue(), (cb) => listDataItem(id).watch(cb), setData), [id]);
  useEffect(
    () => readAndWatch(() => storage.getItem<number>(listDroppedKey), (cb) => storage.watch<number>(listDroppedKey, cb), setDropped),
    [],
  );
  useEffect(() => readAndWatch(() => listErrorItem(id).getValue(), (cb) => listErrorItem(id).watch(cb), setError), [id]);

  const unblocks = data?.filters?.filter((f) => f.allow).length ?? 0;
  const paths = (data?.filters?.length ?? 0) - unblocks;

  const refresh = async () => {
    setBusy(true);
    const res = await requestRefresh(id).catch((err: Error) => ({ ok: false as const, error: err.message }));
    if (!res.ok) setError(res.error);
    setBusy(false);
  };

  return (
    <li className="public-list">
      <div className="public-list-head">
        <div>
          <span className="public-list-name">{list.name}</span>
          <span className="muted block">
            {new URL(list.url).host} · lisensi {list.license}
          </span>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          onChange={(on) => void (on ? refresh() : disableList(id))}
          label={`Aktifkan ${list.name}`}
        />
      </div>
      {busy && (
        <p className="muted block" role="status">
          Mengunduh {list.name}…
        </p>
      )}
      {enabled && data && !busy && (
        <div className="public-list-meta">
          <span className="muted">
            {fmt.format(data.domains.length)} domain · {fmt.format(paths)} path ·{' '}
            {fmt.format(data.exceptions.length + unblocks)} pengecualian · diperbarui {fmtDate.format(data.updatedAt)}
          </span>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Perbarui sekarang
          </button>
        </div>
      )}
      {enabled && data && !busy && !!dropped && (
        <p className="muted block" role="note">
          {fmt.format(dropped)} path tidak dipakai: browser ini membatasi jumlah rule. Yang paling mirip script tetap dipakai.
        </p>
      )}
      {error && !busy && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
