import { storage } from '#imports';
import { hostMatches } from './domain';
import { listDataItem, listErrorItem, type ListId } from './lists';
import type { AllowRule, BlockRule, NewBlock, NewRule, ScriptEntry, Settings, TabState } from './types';

export const DEFAULT_SETTINGS: Settings = {
  rules: [],
  blocks: [],
  activeSites: [],
  inlineSites: [],
  lists: [],
  listAllow: [],
};

/** v1 had a master switch plus paused sites; v2 blocks only on active sites. */
export function migrateV1(old: Record<string, unknown>): Settings {
  const { enabled: _enabled, pausedSites: _paused, ...rest } = old;
  return { ...DEFAULT_SETTINGS, ...(rest as Partial<Settings>) };
}

/** v3 adds public blocklists. */
export function migrateV2(old: Record<string, unknown>): Settings {
  return { ...DEFAULT_SETTINGS, ...(old as Partial<Settings>) };
}

// Stored locally: storage.sync caps a single item at 8 KB, which a long rule list outgrows.
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 3,
  migrations: { 2: migrateV1, 3: migrateV2 },
});

export async function updateSettings(fn: (s: Settings) => Settings): Promise<void> {
  const current = await settingsItem.getValue();
  await settingsItem.setValue(fn(current));
}

const ruleKey = (r: NewRule) => `${r.domain}|${r.script ?? ''}|${r.scope}`;

export function addRules(rules: NewRule[]) {
  return updateSettings((s) => {
    const existing = new Set(s.rules.map(ruleKey));
    const added: AllowRule[] = [];
    for (const r of rules) {
      const key = ruleKey(r);
      if (existing.has(key)) continue;
      existing.add(key);
      added.push({ ...r, script: r.script || undefined, id: crypto.randomUUID(), createdAt: Date.now() });
    }
    return { ...s, rules: [...s.rules, ...added] };
  });
}

export function removeRule(id: string) {
  return updateSettings((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }));
}

export function editRule(id: string, patch: NewRule) {
  return updateSettings((s) => ({
    ...s,
    rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch, script: patch.script || undefined } : r)),
  }));
}

const blockKey = (b: NewBlock) => `${b.domain}|${b.script ?? ''}`;

export function addBlocks(blocks: NewBlock[]) {
  return updateSettings((s) => {
    const existing = new Set(s.blocks.map(blockKey));
    const added: BlockRule[] = [];
    for (const b of blocks) {
      const key = blockKey(b);
      if (existing.has(key)) continue;
      existing.add(key);
      added.push({ domain: b.domain, script: b.script || undefined, id: crypto.randomUUID(), createdAt: Date.now() });
    }
    return { ...s, blocks: [...s.blocks, ...added] };
  });
}

/** Turns a public list off and drops its downloaded data; its DNR rule goes with the next sync. */
export async function disableList(id: ListId) {
  await updateSettings((s) => ({ ...s, lists: s.lists.filter((l) => l !== id) }));
  await listDataItem(id).removeValue();
  await listErrorItem(id).removeValue();
}

/** Unblocks a host from every public list (the user's override of the list). */
export function setListAllow(host: string, on: boolean) {
  return updateSettings((s) => ({
    ...s,
    listAllow: on ? Array.from(new Set([...s.listAllow, host])) : s.listAllow.filter((h) => h !== host),
  }));
}

export function removeBlock(id: string) {
  return updateSettings((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) }));
}

export const isAutoReload = (s: Settings) => s.autoReload !== false;

export function setAutoReload(autoReload: boolean) {
  return updateSettings((s) => ({ ...s, autoReload }));
}

/** `undefined` goes back to the browser's language. */
export function setLangPref(lang: Settings['lang']) {
  return updateSettings(({ lang: _old, ...s }) => (lang ? { ...s, lang } : s));
}

type SiteList = 'activeSites' | 'inlineSites';

/** Adds `site`, or removes every entry covering `host` when turning off. */
export function setSiteFlag(list: SiteList, host: string, site: string, on: boolean) {
  return updateSettings((s) => ({
    ...s,
    [list]: on ? Array.from(new Set([...s[list], site])) : s[list].filter((d) => !hostMatches(host, d)),
  }));
}

export function removeSite(list: SiteList, site: string) {
  return updateSettings((s) => ({ ...s, [list]: s[list].filter((d) => d !== site) }));
}

function scriptPatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i');
}

/** Mirrors the DNR allow rule so the UI can tell which rule lets a script through. */
export function ruleMatches(rule: AllowRule, entry: Pick<ScriptEntry, 'url' | 'host' | 'initiator'>): boolean {
  if (!hostMatches(entry.host, rule.domain)) return false;
  if (rule.scope !== 'global' && !hostMatches(entry.initiator, rule.scope)) return false;
  if (!rule.script) return true;
  const afterHost = entry.url.slice(entry.url.indexOf(entry.host) + entry.host.length);
  return scriptPatternToRegex(rule.script).test(afterHost);
}

/**
 * Blocked scripts the popup can show for this tab: every one on an active site, only global-block
 * hits elsewhere (scripts another blocker stopped are not listed there). Unknown page counts all.
 */
export function badgeCount(s: Settings, state: TabState): number {
  const page = state.page;
  const active = !page || s.activeSites.some((d) => hostMatches(page, d));
  return state.scripts.filter((e) => e.blocked && (active || !!e.list || s.blocks.some((b) => blockMatches(b, e))))
    .length;
}

export function blockMatches(block: BlockRule, entry: Pick<ScriptEntry, 'url' | 'host' | 'initiator'>): boolean {
  return ruleMatches({ ...block, scope: 'global' }, entry);
}
