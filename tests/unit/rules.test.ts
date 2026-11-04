import { describe, expect, it } from 'vitest';
import { buildDnrRules, checkRuleCount, INLINE_CSP } from '@/lib/rules';
import type { AllowRule, BlockRule, Settings } from '@/lib/types';

const base: Settings = { rules: [], blocks: [], activeSites: [], inlineSites: [], lists: [], listAllow: [] };
const rule = (r: Partial<AllowRule> & Pick<AllowRule, 'domain'>): AllowRule => ({
  id: r.domain,
  scope: 'global',
  createdAt: 0,
  ...r,
});

describe('buildDnrRules', () => {
  it('with no active site, every page is exempt from the default block', () => {
    const rules = buildDnrRules(base);
    expect(rules.at(-1)).toEqual({
      id: 3,
      priority: 3,
      action: { type: 'allowAllRequests' },
      condition: { resourceTypes: ['main_frame'] },
    });
  });

  it('active sites are excluded from the exemption, on the top-level page only', () => {
    const exempt = buildDnrRules({ ...base, activeSites: ['a.com', 'b.com'] }).at(-1);
    expect(exempt?.condition).toEqual({ resourceTypes: ['main_frame'], excludedRequestDomains: ['a.com', 'b.com'] });
  });

  it('blocks every script and inline script by default', () => {
    const rules = buildDnrRules(base).slice(0, 2);
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

  it('global blocks outrank the exemption and the allow rules', () => {
    const block = (b: Partial<BlockRule> & Pick<BlockRule, 'domain'>): BlockRule => ({ id: b.domain, createdAt: 0, ...b });
    const rules = buildDnrRules({
      ...base,
      rules: [rule({ domain: 'tracker.com' })],
      blocks: [block({ domain: 'tracker.com' }), block({ domain: 'ads.com', script: 'pixel.js' })],
    });
    const blocks = rules.filter((r) => r.priority === 4);
    expect(blocks.map((r) => [r.action.type, r.condition])).toEqual([
      ['block', { resourceTypes: ['script'], requestDomains: ['tracker.com'] }],
      ['block', { resourceTypes: ['script'], urlFilter: '||ads.com^*pixel.js' }],
    ]);
    expect(Math.max(...rules.filter((r) => r.priority !== 4).map((r) => r.priority))).toBe(3);
  });

  it('allow rules outrank the default block', () => {
    const rules = buildDnrRules({ ...base, rules: [rule({ domain: 'a.com' })] });
    const block = rules.find((r) => r.action.type === 'block')!;
    const allow = rules.find((r) => r.action.type === 'allow')!;
    expect(allow.priority).toBeGreaterThan(block.priority);
  });

  it('an enabled public list becomes one rule, excluding its exceptions and user overrides', () => {
    const lists = { easyprivacy: { domains: ['t1.com', 't2.com'], exceptions: ['ok.t1.com'] } };
    const rules = buildDnrRules({ ...base, lists: ['easyprivacy'], listAllow: ['t2.com', 'ok.t1.com'] }, lists);
    expect(rules.at(-1)).toEqual({
      id: rules.length,
      priority: 4,
      action: { type: 'block' },
      condition: { resourceTypes: ['script'], requestDomains: ['t1.com', 't2.com'], excludedRequestDomains: ['ok.t1.com', 't2.com'] },
    });
  });

  it('a list without data, or not enabled, adds no rule', () => {
    const lists = { easyprivacy: { domains: ['t1.com'], exceptions: [] } };
    expect(buildDnrRules({ ...base, lists: [] }, lists)).toHaveLength(3);
    expect(buildDnrRules({ ...base, lists: ['easyprivacy'] }, {})).toHaveLength(3);
    expect(buildDnrRules({ ...base, lists: ['easyprivacy'] }, { easyprivacy: null })).toHaveLength(3);
  });

  it('checkRuleCount explains an overflow instead of letting the browser reject it', () => {
    const rules = buildDnrRules({ ...base, blocks: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, domain: `d${i}.com`, createdAt: 0 })) });
    expect(() => checkRuleCount(rules, rules.length)).not.toThrow();
    expect(() => checkRuleCount(rules, rules.length - 1)).toThrow(`Terlalu banyak rule: ${rules.length} dari maksimal ${rules.length - 1}`);
  });

  it('assigns unique sequential ids', () => {
    const rules = buildDnrRules({
      ...base,
      rules: [rule({ domain: 'a.com' }), rule({ domain: 'b.com', script: 'x.js', scope: 's.com' })],
      blocks: [{ id: 'x', domain: 'x.com', createdAt: 0 }],
      activeSites: ['s.com'],
      inlineSites: ['s.com'],
    });
    expect(rules.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
