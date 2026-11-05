import type { Scope } from '@/lib/types';
import { t } from '@/lib/i18n';

export function ScopeBadge({ scope }: { scope: Scope }) {
  return scope === 'global' ? (
    <span className="badge badge-global">{t.global}</span>
  ) : (
    <span className="badge badge-site" title={t.onlyOn(scope)}>
      {scope}
    </span>
  );
}
