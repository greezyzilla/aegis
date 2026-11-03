import { useState } from 'react';
import { ScopeBadge } from '@/components/ScopeBadge';
import { editRule, removeRule } from '@/lib/settings';
import type { AllowRule } from '@/lib/types';
import { RuleForm } from './RuleForm';

export function RuleTable({ rules, emptyText }: { rules: AllowRule[]; emptyText: string }) {
  const [editing, setEditing] = useState<string | null>(null);

  if (rules.length === 0) return <p className="empty muted">{emptyText}</p>;

  return (
    <table className="rules">
      <thead>
        <tr>
          <th scope="col">Domain</th>
          <th scope="col">Script</th>
          <th scope="col">Berlaku di</th>
          <th scope="col">
            <span className="sr-only">Aksi</span>
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
                  submitLabel="Simpan"
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
              <td className="mono">{r.script ?? <span className="muted">semua</span>}</td>
              <td>
                <ScopeBadge scope={r.scope} />
              </td>
              <td className="row-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(r.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => void removeRule(r.id)}
                  aria-label={`Hapus rule ${r.domain}${r.script ? ' ' + r.script : ''}`}
                >
                  Hapus
                </button>
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
