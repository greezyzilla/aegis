import { describe, expect, it } from 'vitest';
import { buildDnrRules, INLINE_CSP } from '@/lib/rules';
import type { AllowRule, Settings } from '@/lib/types';

const base: Settings = { enabled: true, rules: [], pausedSites: [], inlineSites: [] };
const rule = (r: Partial<AllowRule> & Pick<AllowRule, 'domain'>): AllowRule => ({
  id: r.domain,
  scope: 'global',
  createdAt: 0,
  ...r,
});

describe('buildDnrRules', () => {
  it('installs nothing when disabled, even with rules', () => {
    expect(buildDnrRules({ ...base, enabled: false, rules: [rule({ domain: 'a.com' })], pausedSites: ['b.com'] })).toEqual([]);
  });

  it('blocks every script and inline script by default', () => {
    const rules = buildDnrRules(base);
    expect(rules).toEqual([
      { id: 1, priority: 1, action: { type: 'block' }, condition: { resourceTypes: ['script'] } },
      {
        id: 2,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [{ header: 'content-security-policy', operation: 'append', value: INLINE_CSP }],
        },
        condition: { resourceTypes: ['main_frame', 'sub_frame'] },
      },
    ]);
  });

  it('CSP leaves external scripts to DNR and omits unsafe-inline', () => {
    expect(INLINE_CSP).toMatch(/^script-src \* /);
    expect(INLINE_CSP).not.toContain('unsafe-inline');
  });

  it('domain-only global rule uses requestDomains', () => {
    const [, , allow] = buildDnrRules({ ...base, rules: [rule({ domain: 'cdn.test' })] });
    expect(allow).toEqual({
      id: 3,
      priority: 2,
      action: { type: 'allow' },
      condition: { resourceTypes: ['script'], requestDomains: ['cdn.test'] },
    });
  });

  it('script name becomes a domain-anchored urlFilter', () => {
    const [, , allow] = buildDnrRules({ ...base, rules: [rule({ domain: 'cdn.test', script: 'jquery.min.js' })] });
    expect(allow?.condition).toEqual({ resourceTypes: ['script'], urlFilter: '||cdn.test^*jquery.min.js' });
  });

  it('site scope adds initiatorDomains', () => {
    const [, , allow] = buildDnrRules({ ...base, rules: [rule({ domain: 'cdn.test', scope: 'github.com' })] });
    expect(allow?.condition).toEqual({
      resourceTypes: ['script'],
      requestDomains: ['cdn.test'],
      initiatorDomains: ['github.com'],
    });
  });

  it('inline site allows the page/frame request so the CSP rule is skipped', () => {
    const rules = buildDnrRules({ ...base, inlineSites: ['github.com'] });
    expect(rules[2]).toMatchObject({
      priority: 2,
      action: { type: 'allow' },
      condition: { requestDomains: ['github.com'], resourceTypes: ['main_frame', 'sub_frame'] },
    });
  });

  it('paused site uses allowAllRequests above everything else', () => {
    const rules = buildDnrRules({ ...base, pausedSites: ['news.com'] });
    const pause = rules.at(-1)!;
    expect(pause).toMatchObject({ action: { type: 'allowAllRequests' }, condition: { requestDomains: ['news.com'] } });
    expect(pause.priority).toBeGreaterThan(Math.max(...rules.slice(0, -1).map((r) => r.priority)));
  });

  it('allow rules outrank the default block', () => {
    const rules = buildDnrRules({ ...base, rules: [rule({ domain: 'a.com' })] });
    const block = rules.find((r) => r.action.type === 'block')!;
    const allow = rules.find((r) => r.action.type === 'allow')!;
    expect(allow.priority).toBeGreaterThan(block.priority);
  });

  it('assigns unique sequential ids', () => {
    const rules = buildDnrRules({
      ...base,
      rules: [rule({ domain: 'a.com' }), rule({ domain: 'b.com', script: 'x.js', scope: 's.com' })],
      inlineSites: ['s.com'],
      pausedSites: ['p.com'],
    });
    expect(rules.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
