import type { Settings } from './types';

/**
 * Plain-literal mirror of chrome.declarativeNetRequest.Rule (the generated typings use enums).
 *
 * Priorities:
 *   3  pause site        allowAllRequests on the page -> everything in it loads
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
    initiatorDomains?: string[];
    urlFilter?: string;
  };
}

/**
 * Leaves external scripts to the DNR rules (`*`) and only drops inline scripts,
 * because 'unsafe-inline' is absent. Appended, so it combines with the site's own CSP.
 */
export const INLINE_CSP = "script-src * blob: data: 'unsafe-eval' 'wasm-unsafe-eval'";

export function buildDnrRules(s: Settings): DnrRule[] {
  if (!s.enabled) return [];

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

  for (const site of s.pausedSites) {
    add({
      priority: 3,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [site], resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }

  return out;
}
