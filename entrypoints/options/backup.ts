import { isValidDomain, isValidScript, normalizeDomain, normalizeScript } from '@/lib/domain';
import { isListId, type ListId } from '@/lib/lists';
import { addBlocks, addRules, updateSettings } from '@/lib/settings';
import type { NewBlock, NewRule, Settings } from '@/lib/types';
import { t } from '@/lib/i18n';

/**
 * v1 also had `pausedSites` (ignored on import) and no blocks/activeSites; v2 had no lists/listAllow.
 * List data is not exported: an enabled list is downloaded again after import.
 */
interface Backup {
  app: 'aegis';
  version: 3;
  rules: NewRule[];
  blocks: NewBlock[];
  activeSites: string[];
  inlineSites: string[];
  lists: string[];
  listAllow: string[];
}

export interface ImportResult {
  /** Allow rules + global blocks read from the file. */
  count: number;
  /** Public lists the backup has on that are not on yet; the caller downloads and enables them. */
  listsToEnable: ListId[];
}

export function exportSettings(s: Settings) {
  const data: Backup = {
    app: 'aegis',
    version: 3,
    rules: s.rules.map(({ domain, script, scope }) => ({ domain, script, scope })),
    blocks: s.blocks.map(({ domain, script }) => ({ domain, script })),
    activeSites: s.activeSites,
    inlineSites: s.inlineSites,
    lists: s.lists,
    listAllow: s.listAllow,
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

/** Merges a backup into the current settings. Invalid entries are skipped. */
export async function importSettings(file: File): Promise<ImportResult> {
  const data = JSON.parse(await file.text()) as Partial<Backup>;
  if (data.app !== 'aegis' || !Array.isArray(data.rules)) throw new Error(t.notBackup);

  const rules: NewRule[] = [];
  for (const raw of data.rules) {
    const domain = normalizeDomain(String(raw?.domain ?? ''));
    const script = raw?.script ? normalizeScript(String(raw.script)) : undefined;
    const scope = raw?.scope === 'global' ? 'global' : normalizeDomain(String(raw?.scope ?? ''));
    if (!isValidDomain(domain) || (script && !isValidScript(script))) continue;
    if (scope !== 'global' && !isValidDomain(scope)) continue;
    rules.push({ domain, script, scope });
  }

  const blocks: NewBlock[] = [];
  for (const raw of Array.isArray(data.blocks) ? data.blocks : []) {
    const domain = normalizeDomain(String(raw?.domain ?? ''));
    const script = raw?.script ? normalizeScript(String(raw.script)) : undefined;
    if (!isValidDomain(domain) || (script && !isValidScript(script))) continue;
    blocks.push({ domain, script });
  }

  const active = cleanSites(data.activeSites);
  const inline = cleanSites(data.inlineSites);
  const listAllow = cleanSites(data.listAllow);
  const lists = Array.isArray(data.lists) ? [...new Set(data.lists.map(String).filter(isListId))] : [];
  let listsToEnable: ListId[] = [];
  await addRules(rules);
  await addBlocks(blocks);
  await updateSettings((s) => {
    listsToEnable = lists.filter((id) => !s.lists.includes(id));
    return {
      ...s,
      activeSites: Array.from(new Set([...s.activeSites, ...active])),
      inlineSites: Array.from(new Set([...s.inlineSites, ...inline])),
      listAllow: Array.from(new Set([...s.listAllow, ...listAllow])),
    };
  });
  return { count: rules.length + blocks.length, listsToEnable };
}
