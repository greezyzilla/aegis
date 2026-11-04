import { storage } from '#imports';
import { hostMatches } from './domain';
import type { AllowRule, NewRule, ScriptEntry, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  rules: [],
  pausedSites: [],
  inlineSites: [],
};

// Stored locally: storage.sync caps a single item at 8 KB, which a long rule list outgrows.
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
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

export function setEnabled(enabled: boolean) {
  return updateSettings((s) => ({ ...s, enabled }));
}

export const isAutoReload = (s: Settings) => s.autoReload !== false;

export function setAutoReload(autoReload: boolean) {
  return updateSettings((s) => ({ ...s, autoReload }));
}

type SiteList = 'pausedSites' | 'inlineSites';

/** Adds `site`, or removes every entry covering `host` when turning off. */
export function setSiteFlag(list: SiteList, host: string, site: string, on: boolean) {
  return updateSettings((s) => ({
    ...s,
    [list]: on
      ? Array.from(new Set([...s[list], site]))
      : s[list].filter((d) => !hostMatches(host, d)),
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
