import type { Scope } from '@/lib/types';

export function ScopeBadge({ scope }: { scope: Scope }) {
  return scope === 'global' ? (
    <span className="badge badge-global">Global</span>
  ) : (
    <span className="badge badge-site" title={`Hanya di ${scope}`}>
      {scope}
    </span>
  );
}
