import type { ListData } from './lists';
import type { Settings } from './types';

/**
 * Plain-literal mirror of chrome.declarativeNetRequest.Rule (the generated typings use enums).
 *
 * Priorities:
 *   4  global block      blocked everywhere, active site or not; also one rule per public list
 *   3  inactive sites    allowAllRequests on every top-level page except active sites ->
 *                        everything in that tab loads (iframes included), except priority 4
 *   2  allow rules       script origin (+ optional name, + optional site) / inline-allowed sites
 *   1  default           block every script request + CSP header that blocks inline scripts
 */
export interface DnrRule {
  id: number;
  priority: number;
  action:
    | { type: 'block' | 'allow' | 'allowAllRequests' }
    | {
        type: 'modifyHeaders';
        responseHeaders: { header: string; operation: 'append'; value: string }[];
      };
  condition: {
    resourceTypes: ('script' | 'main_frame' | 'sub_frame')[];
    requestDomains?: string[];
    excludedRequestDomains?: string[];
    initiatorDomains?: string[];
    urlFilter?: string;
  };
}

/**
 * Leaves external scripts to the DNR rules (`*`) and only drops inline scripts,
 * because 'unsafe-inline' is absent. Appended, so it combines with the site's own CSP.
 */
export const INLINE_CSP = "script-src * blob: data: 'unsafe-eval' 'wasm-unsafe-eval'";

/** Downloaded data of each enabled public list, by id. */
export type ListRules = Record<string, Pick<ListData, 'domains' | 'exceptions'> | null | undefined>;

/** Readable error before the browser rejects the whole update with a generic one. */
export function checkRuleCount(rules: DnrRule[], max: number): void {
  if (rules.length > max) {
    throw new Error(`Terlalu banyak rule: ${rules.length} dari maksimal ${max}. Hapus sebagian rule atau blok global.`);
  }
}

export function buildDnrRules(s: Settings, lists: ListRules = {}): DnrRule[] {
  const out: DnrRule[] = [];
  const add = (r: Omit<DnrRule, 'id'>) => out.push({ id: out.length + 1, ...r });

  add({ priority: 1, action: { type: 'block' }, condition: { resourceTypes: ['script'] } });
  add({
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{ header: 'content-security-policy', operation: 'append', value: INLINE_CSP }],
    },
    condition: { resourceTypes: ['main_frame', 'sub_frame'] },
  });

  for (const rule of s.rules) {
    const condition: DnrRule['condition'] = { resourceTypes: ['script'] };
    if (rule.script) condition.urlFilter = `||${rule.domain}^*${rule.script}`;
    else condition.requestDomains = [rule.domain];
    if (rule.scope !== 'global') condition.initiatorDomains = [rule.scope];
    add({ priority: 2, action: { type: 'allow' }, condition });
  }

  for (const site of s.inlineSites) {
    add({
      priority: 2,
      action: { type: 'allow' },
      condition: { requestDomains: [site], resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }

  // Only the top-level page decides: an iframe inside an active site stays blocked.
  const inactive: DnrRule['condition'] = { resourceTypes: ['main_frame'] };
  if (s.activeSites.length) inactive.excludedRequestDomains = s.activeSites;
  add({ priority: 3, action: { type: 'allowAllRequests' }, condition: inactive });

  for (const block of s.blocks) {
    const condition: DnrRule['condition'] = { resourceTypes: ['script'] };
    if (block.script) condition.urlFilter = `||${block.domain}^*${block.script}`;
    else condition.requestDomains = [block.domain];
    add({ priority: 4, action: { type: 'block' }, condition });
  }

  // One rule holds a whole list: the dynamic-rule cap counts rules, not domains.
  for (const id of s.lists) {
    const data = lists[id];
    if (!data?.domains.length) continue;
    const condition: DnrRule['condition'] = { resourceTypes: ['script'], requestDomains: data.domains };
    const excluded = [...new Set([...data.exceptions, ...s.listAllow])];
    if (excluded.length) condition.excludedRequestDomains = excluded;
    add({ priority: 4, action: { type: 'block' }, condition });
  }

  return out;
}
