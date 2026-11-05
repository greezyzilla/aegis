import { hostMatches } from './domain';
import type { ListData, ListFilter } from './lists';
import type { Settings } from './types';

/**
 * Plain-literal mirror of chrome.declarativeNetRequest.Rule (the generated typings use enums).
 *
 * Priorities:
 *   6  global block      the user's blocks: everywhere, active site or not, beating everything below
 *   5  list exceptions   a public list's `@@` entries, never on active sites (nothing loads there
 *                        unless the user allows it)
 *   4  public lists      one rule for a list's domains, one per path / site-restricted entry
 *   3  inactive sites    allowAllRequests on every top-level page except active sites ->
 *                        everything in that tab loads (iframes included), except priority 4+
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
    excludedInitiatorDomains?: string[];
    domainType?: 'firstParty' | 'thirdParty';
    urlFilter?: string;
  };
}

/**
 * Leaves external scripts to the DNR rules (`*`) and only drops inline scripts,
 * because 'unsafe-inline' is absent. Appended, so it combines with the site's own CSP.
 */
export const INLINE_CSP = "script-src * blob: data: 'unsafe-eval' 'wasm-unsafe-eval'";

/** Downloaded data of each enabled public list, by id. */
export type ListRules = Record<string, Pick<ListData, 'domains' | 'exceptions' | 'filters'> | null | undefined>;

export interface RuleSet {
  rules: DnrRule[];
  /** List entries left out to stay within the browser's rule cap (Firefox allows 5,000 rules). */
  dropped: number;
}

/** Readable error before the browser rejects the whole update with a generic one. */
export function checkRuleCount(rules: DnrRule[], max: number): void {
  if (rules.length > max) {
    throw new Error(`Terlalu banyak rule: ${rules.length} dari maksimal ${max}. Hapus sebagian rule atau blok global.`);
  }
}

/** Entries naming the script type come first, then `.js` URLs, then the rest, each in list order. */
const filterRank = (f: ListFilter) => (f.script ? 0 : f.url.includes('.js') ? 1 : 2);

/** DNR condition fields shared by a list entry's block and allow rules. */
function filterCondition(f: ListFilter): DnrRule['condition'] {
  const condition: DnrRule['condition'] = { resourceTypes: ['script'], urlFilter: f.url };
  if (f.sites) condition.initiatorDomains = f.sites;
  if (f.notSites) condition.excludedInitiatorDomains = f.notSites;
  if (f.party) condition.domainType = f.party === 'first' ? 'firstParty' : 'thirdParty';
  return condition;
}

/**
 * Rules for the settings and the enabled lists. Every rule but the lists' path blocks is always
 * kept; those come last and are cut to fit `maxRules`, the least script-like first.
 */
export function buildDnrRules(s: Settings, lists: ListRules = {}, maxRules = Infinity): RuleSet {
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
    add({ priority: 6, action: { type: 'block' }, condition });
  }

  const pathBlocks: { condition: DnrRule['condition']; rank: number }[] = [];
  for (const id of s.lists) {
    const data = lists[id];
    if (!data) continue;
    const excluded = [...new Set([...data.exceptions, ...s.listAllow])];

    // One rule holds all of a list's domains: the dynamic-rule cap counts rules, not domains.
    if (data.domains.length) {
      const condition: DnrRule['condition'] = { resourceTypes: ['script'], requestDomains: data.domains };
      if (excluded.length) condition.excludedRequestDomains = excluded;
      add({ priority: 4, action: { type: 'block' }, condition });
    }

    for (const f of data.filters ?? []) {
      const condition = filterCondition(f);
      if (!f.allow) {
        if (excluded.length) condition.excludedRequestDomains = excluded;
        pathBlocks.push({ condition, rank: filterRank(f) });
        continue;
      }
      // An unblock on an active site would let a script through that the user never allowed.
      const sites = f.sites?.filter((site) => !s.activeSites.some((a) => hostMatches(site, a)));
      if (sites && !sites.length) continue;
      if (sites) condition.initiatorDomains = sites;
      const notSites = [...(f.notSites ?? []), ...s.activeSites];
      if (notSites.length) condition.excludedInitiatorDomains = notSites;
      add({ priority: 5, action: { type: 'allow' }, condition });
    }
  }

  const room = Math.max(0, maxRules - out.length);
  const kept = pathBlocks.map((b, i) => ({ ...b, i })).sort((a, b) => a.rank - b.rank || a.i - b.i);
  for (const { condition } of kept.slice(0, room)) add({ priority: 4, action: { type: 'block' }, condition });

  return { rules: out, dropped: Math.max(0, pathBlocks.length - room) };
}
