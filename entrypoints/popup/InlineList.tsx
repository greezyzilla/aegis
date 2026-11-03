import { Switch } from '@/components/Switch';

export interface InlineRow {
  host: string;
  /** Domain stored in inlineSites when toggled on. */
  site: string;
  isPage: boolean;
  /** Inline scripts blocked in this frame since the page loaded. */
  blocked: number;
  allowed: boolean;
}

interface Props {
  rows: InlineRow[];
  disabled: boolean;
  onToggle: (row: InlineRow, on: boolean) => void;
}

export function InlineList({ rows, disabled, onToggle }: Props) {
  return (
    <ul className="list" role="list">
      {rows.map((r) => (
        <li key={r.host} className="row inline-row">
          <span className="truncate">
            <span className="mono">{r.host}</span>
            <span className="muted"> · {r.isPage ? 'halaman ini' : 'iframe'}</span>
          </span>
          {r.blocked > 0 && !r.allowed && (
            <span className="count" title={`${r.blocked} inline script keblok`}>
              {r.blocked}
            </span>
          )}
          <Switch
            checked={r.allowed}
            disabled={disabled}
            onChange={(on) => onToggle(r, on)}
            label={`Izinkan inline script di ${r.site}`}
          />
        </li>
      ))}
    </ul>
  );
}
