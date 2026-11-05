import type { AllowRule } from '@/lib/types';
import { Avatar, Count, HostName, Icon } from './parts';
import { t } from '@/lib/i18n';

interface Props {
  rules: AllowRule[];
  /** Scripts this rule let through on this page. */
  allowedBy: (rule: AllowRule) => number;
  isOwn: (host: string) => boolean;
  onRemove: (id: string) => void;
}

export function ActiveRules({ rules, allowedBy, isOwn, onRemove }: Props) {
  if (rules.length === 0) {
    return <p className="empty">{t.noActiveRules}</p>;
  }
  return (
    <ul className="group" role="list">
      {rules.map((r) => {
        const label = `${r.domain}${r.script ? ' ' + r.script : ''}`;
        const global = r.scope === 'global';
        return (
          <li key={r.id} className="row rule">
            <span className="row-main">
              <span className="chevron lead" title={global ? t.everySite : t.onlyOn(r.scope)}>
                {global ? Icon.globe : Icon.home}
              </span>
              <Avatar host={r.domain} own={isOwn(r.domain)} />
              <HostName name={r.script ? `${r.domain} / ${r.script}` : r.domain} />
              <Count n={allowedBy(r)} tone="allowed" />
              <span className="sr-only">{global ? t.everySiteLower : t.onlyOnLower(r.scope)}</span>
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onRemove(r.id)}
              aria-label={t.removeRuleLabel(label)}
            >
              {t.remove}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
