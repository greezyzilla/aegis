import { Switch } from '@/components/Switch';
import { Avatar, Count, HostName } from './parts';
import { t } from '@/lib/i18n';

export interface InlineRow {
  host: string;
  /** Domain stored in inlineSites when allowed. */
  site: string;
  isPage: boolean;
  /** Inline scripts blocked in this frame since the page loaded. */
  blocked: number;
  allowed: boolean;
}

interface Props {
  rows: InlineRow[];
  disabled: boolean;
  onToggle: (row: InlineRow, allow: boolean) => void;
}

/** One switch per frame. ON means inline scripts are blocked, like every other switch in the popup. */
export function InlineList({ rows, disabled, onToggle }: Props) {
  return (
    <ul className="group" role="list">
      {rows.map((r) => (
        <li key={r.host} className="row inline-row">
          <span className="row-main">
            <span className="chevron" />
            <Avatar host={r.host} own={r.isPage} />
            <HostName name={r.host} />
            {r.isPage ? <span className="sr-only">{t.thisPage}</span> : <span className="meta">{t.iframe}</span>}
            {!r.allowed && <Count n={r.blocked} tone="blocked" />}
          </span>
          <Switch
            checked={!r.allowed}
            disabled={disabled}
            onChange={(block) => onToggle(r, !block)}
            label={t.blockInlineOn(r.site)}
          />
        </li>
      ))}
    </ul>
  );
}
