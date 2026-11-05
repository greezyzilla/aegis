import { describe, expect, it } from 'vitest';
import { buildDnrRules, checkRuleCount, INLINE_CSP } from '@/lib/rules';
import type { ListFilter } from '@/lib/lists';
import type { AllowRule, BlockRule, Settings } from '@/lib/types';

/** The rules alone, for the cases that do not hit the rule cap. */
const build = (...args: Parameters<typeof buildDnrRules>) => buildDnrRules(...args).rules;

const base: Settings = { rules: [], blocks: [], activeSites: [], inlineSites: [], lists: [], listAllow: [] };
const rule = (r: Partial<AllowRule> & Pick<AllowRule, 'domain'>): AllowRule => ({
  id: r.domain,
  scope: 'global',
  createdAt: 0,
  ...r,
});

describe('buildDnrRules', () => {
  it('with no active site, every page is exempt from the default block', () => {
    const rules = build(base);
    expect(rules.at(-1)).toEqual({
      id: 3,
      priority: 3,
      action: { type: 'allowAllRequests' },
      condition: { resourceTypes: ['main_frame'] },
    });
  });

  it('active sites are excluded from the exemption, on the top-level page only', () => {
    const exempt = build({ ...base, activeSites: ['a.com', 'b.com'] }).at(-1);
    expect(exempt?.condition).toEqual({ resourceTypes: ['main_frame'], excludedRequestDomains: ['a.com', 'b.com'] });
  });

  it('blocks every script and inline script by default', () => {
    const rules = build(base).slice(0, 2);
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
    const [, , allow] = build({ ...base, rules: [rule({ domain: 'cdn.test' })] });
    expect(allow).toEqual({
      id: 3,
      priority: 2,
      action: { type: 'allow' },
      condition: { resourceTypes: ['script'], requestDomains: ['cdn.test'] },
    });
  });

  it('script name becomes a domain-anchored urlFilter', () => {
    const [, , allow] = build({ ...base, rules: [rule({ domain: 'cdn.test', script: 'jquery.min.js' })] });
    expect(allow?.condition).toEqual({ resourceTypes: ['script'], urlFilter: '||cdn.test^*jquery.min.js' });
  });

  it('site scope adds initiatorDomains', () => {
    const [, , allow] = build({ ...base, rules: [rule({ domain: 'cdn.test', scope: 'github.com' })] });
    expect(allow?.condition).toEqual({
      resourceTypes: ['script'],
      requestDomains: ['cdn.test'],
      initiatorDomains: ['github.com'],
    });
  });

  it('inline site allows the page/frame request so the CSP rule is skipped', () => {
    const rules = build({ ...base, inlineSites: ['github.com'] });
    expect(rules[2]).toMatchObject({
      priority: 2,
      action: { type: 'allow' },
      condition: { requestDomains: ['github.com'], resourceTypes: ['main_frame', 'sub_frame'] },
    });
  });

  it('global blocks outrank the exemption and the allow rules', () => {
    const block = (b: Partial<BlockRule> & Pick<BlockRule, 'domain'>): BlockRule => ({
      id: b.domain,
      createdAt: 0,
      ...b,
    });
    const rules = build({
      ...base,
      rules: [rule({ domain: 'tracker.com' })],
      blocks: [block({ domain: 'tracker.com' }), block({ domain: 'ads.com', script: 'pixel.js' })],
    });
    const blocks = rules.filter((r) => r.priority === 6);
    expect(blocks.map((r) => [r.action.type, r.condition])).toEqual([
      ['block', { resourceTypes: ['script'], requestDomains: ['tracker.com'] }],
      ['block', { resourceTypes: ['script'], urlFilter: '||ads.com^*pixel.js' }],
    ]);
    expect(Math.max(...rules.filter((r) => r.priority !== 6).map((r) => r.priority))).toBe(3);
  });

  it('allow rules outrank the default block', () => {
    const rules = build({ ...base, rules: [rule({ domain: 'a.com' })] });
    const block = rules.find((r) => r.action.type === 'block')!;
    const allow = rules.find((r) => r.action.type === 'allow')!;
    expect(allow.priority).toBeGreaterThan(block.priority);
  });

  it('an enabled public list becomes one rule, excluding its exceptions and user overrides', () => {
    const lists = { easyprivacy: { domains: ['t1.com', 't2.com'], exceptions: ['ok.t1.com'] } };
    const rules = build({ ...base, lists: ['easyprivacy'], listAllow: ['t2.com', 'ok.t1.com'] }, lists);
    expect(rules.at(-1)).toEqual({
      id: rules.length,
      priority: 4,
      action: { type: 'block' },
      condition: {
        resourceTypes: ['script'],
        requestDomains: ['t1.com', 't2.com'],
        excludedRequestDomains: ['ok.t1.com', 't2.com'],
      },
    });
  });

  it('a list without data, or not enabled, adds no rule', () => {
    const lists = { easyprivacy: { domains: ['t1.com'], exceptions: [] } };
    expect(build({ ...base, lists: [] }, lists)).toHaveLength(3);
    expect(build({ ...base, lists: ['easyprivacy'] }, {})).toHaveLength(3);
    expect(build({ ...base, lists: ['easyprivacy'] }, { easyprivacy: null })).toHaveLength(3);
  });

  describe('list filters', () => {
    const on = { ...base, lists: ['easyprivacy'], listAllow: ['mine.com'] };
    const list = (filters: ListFilter[], domains: string[] = []) => ({
      easyprivacy: { domains, exceptions: ['ok.com'], filters },
    });

    it('path entries block scripts at the list priority, minus list exceptions and user overrides', () => {
      const rules = build(
        on,
        list([
          { url: '/collect.js' },
          { url: '||cdn.com/t.js', sites: ['news.com'], notSites: ['x.news.com'], party: 'third' },
        ]),
      );
      expect(rules.slice(3)).toEqual([
        {
          id: 4,
          priority: 4,
          action: { type: 'block' },
          condition: {
            resourceTypes: ['script'],
            urlFilter: '/collect.js',
            excludedRequestDomains: ['ok.com', 'mine.com'],
          },
        },
        {
          id: 5,
          priority: 4,
          action: { type: 'block' },
          condition: {
            resourceTypes: ['script'],
            urlFilter: '||cdn.com/t.js',
            initiatorDomains: ['news.com'],
            excludedInitiatorDomains: ['x.news.com'],
            domainType: 'thirdParty',
            excludedRequestDomains: ['ok.com', 'mine.com'],
          },
        },
      ]);
    });

    it('list exceptions allow above the list, below user blocks, and never on active sites', () => {
      const rules = build(
        { ...on, activeSites: ['shop.com'], blocks: [{ id: 'b', domain: 'cdn.com', createdAt: 0 }] },
        list([
          { url: '||cdn.com/a.js', allow: true, party: 'first' },
          { url: '||cdn.com/b.js', allow: true, sites: ['news.com', 'm.shop.com'], notSites: ['x.news.com'] },
          { url: '||cdn.com/c.js', allow: true, sites: ['shop.com'] },
        ]),
      );
      const allows = rules.filter((r) => r.priority === 5);
      expect(allows.map((r) => [r.action.type, r.condition])).toEqual([
        [
          'allow',
          {
            resourceTypes: ['script'],
            urlFilter: '||cdn.com/a.js',
            domainType: 'firstParty',
            excludedInitiatorDomains: ['shop.com'],
          },
        ],
        [
          'allow',
          {
            resourceTypes: ['script'],
            urlFilter: '||cdn.com/b.js',
            initiatorDomains: ['news.com'],
            excludedInitiatorDomains: ['x.news.com', 'shop.com'],
          },
        ],
      ]);
      const userBlock = rules.find((r) => r.priority === 6)!;
      expect(userBlock.condition).toEqual({ resourceTypes: ['script'], requestDomains: ['cdn.com'] });
    });

    it('a list with only filters still yields its rules', () => {
      expect(build(on, list([{ url: '/x.js' }])).map((r) => r.priority)).toEqual([1, 1, 3, 4]);
    });

    it('cuts path blocks to the rule cap, script-typed first, then .js, then the rest', () => {
      const filters: ListFilter[] = [
        { url: '/pixel?' },
        { url: '/a.js' },
        { url: '||t.com/tag', script: true },
        { url: '/b.js' },
        { url: '||t.com/ok.js', allow: true },
      ];
      const all = buildDnrRules(on, list(filters, ['d.com']));
      expect(all.dropped).toBe(0);
      expect(all.rules).toHaveLength(9);

      const cut = buildDnrRules(on, list(filters, ['d.com']), 7);
      expect(cut.dropped).toBe(2);
      expect(cut.rules.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(cut.rules.map((r) => r.condition.urlFilter ?? null)).toEqual([
        null,
        null,
        null,
        null,
        '||t.com/ok.js',
        '||t.com/tag',
        '/a.js',
      ]);
    });

    it('never cuts anything but path blocks', () => {
      const cut = buildDnrRules(on, list([{ url: '/a.js' }], ['d.com']), 2);
      expect(cut.dropped).toBe(1);
      expect(cut.rules).toHaveLength(4);
      expect(() => checkRuleCount(cut.rules, 2)).toThrow('Terlalu banyak rule');
    });
  });

  it('checkRuleCount explains an overflow instead of letting the browser reject it', () => {
    const rules = build({
      ...base,
      blocks: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, domain: `d${i}.com`, createdAt: 0 })),
    });
    expect(() => checkRuleCount(rules, rules.length)).not.toThrow();
    expect(() => checkRuleCount(rules, rules.length - 1)).toThrow(
      `Terlalu banyak rule: ${rules.length} dari maksimal ${rules.length - 1}`,
    );
  });

  it('assigns unique sequential ids', () => {
    const rules = build({
      ...base,
      rules: [rule({ domain: 'a.com' }), rule({ domain: 'b.com', script: 'x.js', scope: 's.com' })],
      blocks: [{ id: 'x', domain: 'x.com', createdAt: 0 }],
      activeSites: ['s.com'],
      inlineSites: ['s.com'],
    });
    expect(rules.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
