import { useState } from 'react';
import { ScopeBadge } from '@/components/ScopeBadge';
import { editRule, removeRule } from '@/lib/settings';
import type { AllowRule } from '@/lib/types';
import { RuleForm } from './RuleForm';
import { t } from '@/lib/i18n';

export function RuleTable({ rules, emptyText }: { rules: AllowRule[]; emptyText: string }) {
  const [editing, setEditing] = useState<string | null>(null);

  if (rules.length === 0) return <p className="empty muted">{emptyText}</p>;

  return (
    <table className="rules">
      <thead>
        <tr>
          <th scope="col">{t.colDomain}</th>
          <th scope="col">{t.colScript}</th>
          <th scope="col">{t.colScope}</th>
          <th scope="col">
            <span className="sr-only">{t.colActions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r) =>
          editing === r.id ? (
            <tr key={r.id}>
              <td colSpan={4}>
                <RuleForm
                  initial={r}
                  submitLabel={t.save}
                  onSubmit={async (patch) => {
                    await editRule(r.id, patch);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </td>
            </tr>
          ) : (
            <tr key={r.id}>
              <td className="mono">{r.domain}</td>
              <td className="mono">{r.script ?? <span className="muted">{t.anyScript}</span>}</td>
              <td>
                <ScopeBadge scope={r.scope} />
              </td>
              <td className="row-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(r.id)}>
                  {t.edit}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => void removeRule(r.id)}
                  aria-label={t.removeRuleLabel(`${r.domain}${r.script ? ' ' + r.script : ''}`)}
                >
                  {t.remove}
                </button>
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
