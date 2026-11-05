import { useState } from 'react';
import { hostMatches } from '@/lib/domain';
import { t } from '@/lib/i18n';
import { editRule, removeRule } from '@/lib/settings';
import type { AllowRule } from '@/lib/types';
import { Avatar, Count, HostName, Icon } from '../popup/parts';
import { RuleForm } from './RuleForm';

const labelOf = (r: AllowRule) => `${r.domain}${r.script ? ' ' + r.script : ''}`;

/** Allow rules grouped by where they apply: every site first, then each site. */
export function RuleList({ rules, emptyText }: { rules: AllowRule[]; emptyText: string }) {
  if (rules.length === 0) {
    return (
      <li className="row">
        <span className="empty-row">{emptyText}</span>
      </li>
    );
  }
  const scopes = [...new Set(rules.map((r) => r.scope))].sort((a, b) =>
    a === 'global' ? -1 : b === 'global' ? 1 : a.localeCompare(b),
  );
  return (
    <>
      {scopes.map((scope) => {
        const inScope = rules.filter((r) => r.scope === scope);
        return [
          <li key={`scope:${scope}`} className="row scope-head">
            <span className="row-main">
              {scope === 'global' ? <span className="lead-ico">{Icon.globe}</span> : <Avatar host={scope} />}
              <HostName name={scope === 'global' ? t.everySite : scope} />
              <Count n={inScope.length} tone="neutral" />
            </span>
          </li>,
          ...inScope.map((r) => <RuleRow key={r.id} rule={r} />),
        ];
      })}
    </>
  );
}

function RuleRow({ rule: r }: { rule: AllowRule }) {
  const [editing, setEditing] = useState(false);
  const own = r.scope !== 'global' && hostMatches(r.domain, r.scope);
  const formId = `edit-${r.id}`;
  return (
    <li className="host rule-item">
      <div className="row rule-row">
        <button
          type="button"
          className="disclosure"
          aria-expanded={editing}
          aria-controls={formId}
          aria-label={t.editRuleLabel(labelOf(r))}
          onClick={() => setEditing(!editing)}
        >
          <span className="chevron">{Icon.chevron}</span>
          <Avatar host={r.domain} own={own} />
          <HostName name={r.script ? `${r.domain} / ${r.script}` : r.domain} />
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void removeRule(r.id)}
          aria-label={t.removeRuleLabel(labelOf(r))}
        >
          {t.remove}
        </button>
      </div>
      {editing && (
        <div id={formId} className="edit">
          <RuleForm
            initial={r}
            submitLabel={t.save}
            onSubmit={async (patch) => {
              await editRule(r.id, patch);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  );
}
