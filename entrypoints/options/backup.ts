import { isValidDomain, isValidScript, normalizeDomain, normalizeScript } from '@/lib/domain';
import { addRules, updateSettings } from '@/lib/settings';
import type { NewRule, Settings } from '@/lib/types';

interface Backup {
  app: 'aegis';
  version: 1;
  rules: NewRule[];
  pausedSites: string[];
  inlineSites: string[];
}

export function exportSettings(s: Settings) {
  const data: Backup = {
    app: 'aegis',
    version: 1,
    rules: s.rules.map(({ domain, script, scope }) => ({ domain, script, scope })),
    pausedSites: s.pausedSites,
    inlineSites: s.inlineSites,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `aegis-rules-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const cleanSites = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => normalizeDomain(String(x))).filter(isValidDomain) : [];

/** Merges a backup into the current settings. Invalid entries are skipped. Returns the rule count read. */
export async function importSettings(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Partial<Backup>;
  if (data.app !== 'aegis' || !Array.isArray(data.rules)) throw new Error('Bukan file backup Aegis');

  const rules: NewRule[] = [];
  for (const raw of data.rules) {
    const domain = normalizeDomain(String(raw?.domain ?? ''));
    const script = raw?.script ? normalizeScript(String(raw.script)) : undefined;
    const scope = raw?.scope === 'global' ? 'global' : normalizeDomain(String(raw?.scope ?? ''));
    if (!isValidDomain(domain) || (script && !isValidScript(script))) continue;
    if (scope !== 'global' && !isValidDomain(scope)) continue;
    rules.push({ domain, script, scope });
  }

  const paused = cleanSites(data.pausedSites);
  const inline = cleanSites(data.inlineSites);
  await addRules(rules);
  await updateSettings((s) => ({
    ...s,
    pausedSites: Array.from(new Set([...s.pausedSites, ...paused])),
    inlineSites: Array.from(new Set([...s.inlineSites, ...inline])),
  }));
  return rules.length;
}
