import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addBlocks,
  addRules,
  badgeCount,
  blockMatches,
  DEFAULT_SETTINGS,
  editRule,
  migrateV1,
  removeBlock,
  removeRule,
  removeSite,
  ruleMatches,
  setSiteFlag,
  settingsItem,
} from '@/lib/settings';
import type { AllowRule } from '@/lib/types';

const get = () => settingsItem.getValue();

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings storage', () => {
  it('starts with no active site and nothing configured', async () => {
    expect(await get()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.activeSites).toEqual([]);
  });

  it('migrates v1 settings: drops the master switch and paused sites, keeps the rest', () => {
    const rules = [{ id: '1', domain: 'cdn.test', scope: 'global', createdAt: 0 }];
    expect(migrateV1({ enabled: true, rules, pausedSites: ['a.test'], inlineSites: ['b.test'] })).toEqual({
      rules,
      blocks: [],
      activeSites: [],
      inlineSites: ['b.test'],
    });
  });
});

describe('global blocks', () => {
  it('adds without duplicates, drops empty script, removes by id', async () => {
    await addBlocks([{ domain: 'tracker.test', script: '' }, { domain: 'tracker.test' }, { domain: 'ads.test', script: 'px.js' }]);
    const [a, b] = (await get()).blocks;
    expect(a).toMatchObject({ domain: 'tracker.test' });
    expect(a?.script).toBeUndefined();
    expect(b).toMatchObject({ domain: 'ads.test', script: 'px.js' });

    await removeBlock(a!.id);
    expect((await get()).blocks.map((x) => x.domain)).toEqual(['ads.test']);
  });

  it('blockMatches applies on any page', () => {
    const b = { id: '1', domain: 'tracker.test', createdAt: 0 };
    expect(blockMatches(b, { url: 'https://x.tracker.test/t.js', host: 'x.tracker.test', initiator: 'anything.test' })).toBe(true);
    expect(blockMatches(b, { url: 'https://cdn.test/t.js', host: 'cdn.test', initiator: 'anything.test' })).toBe(false);
  });
});

describe('addRules', () => {
  it('adds rules with id and drops empty script', async () => {
    await addRules([{ domain: 'cdn.test', script: '', scope: 'global' }]);
    const [r] = (await get()).rules;
    expect(r).toMatchObject({ domain: 'cdn.test', scope: 'global' });
    expect(r?.script).toBeUndefined();
    expect(r?.id).toBeTruthy();
  });

  it('skips duplicates, including within the same batch', async () => {
    await addRules([
      { domain: 'cdn.test', scope: 'global' },
      { domain: 'cdn.test', scope: 'global' },
    ]);
    await addRules([{ domain: 'cdn.test', scope: 'global' }]);
    expect((await get()).rules).toHaveLength(1);
  });

  it('treats different script or scope as different rules', async () => {
    await addRules([
      { domain: 'cdn.test', scope: 'global' },
      { domain: 'cdn.test', script: 'a.js', scope: 'global' },
      { domain: 'cdn.test', scope: 'github.com' },
    ]);
    expect((await get()).rules).toHaveLength(3);
  });
});

describe('editRule / removeRule', () => {
  it('edits in place and removes by id', async () => {
    await addRules([{ domain: 'a.test', scope: 'global' }, { domain: 'b.test', scope: 'global' }]);
    const [a, b] = (await get()).rules;
    await editRule(a!.id, { domain: 'a2.test', script: 'x.js', scope: 'site.test' });
    expect((await get()).rules[0]).toMatchObject({ id: a!.id, domain: 'a2.test', script: 'x.js', scope: 'site.test' });

    await editRule(a!.id, { domain: 'a2.test', script: '', scope: 'global' });
    expect((await get()).rules[0]?.script).toBeUndefined();

    await removeRule(b!.id);
    expect((await get()).rules.map((r) => r.id)).toEqual([a!.id]);
  });
});

describe('site flags', () => {
  it('adds a site once and removes every entry covering the host', async () => {
    await setSiteFlag('activeSites', 'www.github.com', 'github.com', true);
    await setSiteFlag('activeSites', 'www.github.com', 'github.com', true);
    expect((await get()).activeSites).toEqual(['github.com']);

    // Turning off from a subdomain removes the parent entry that covers it.
    await setSiteFlag('activeSites', 'gist.github.com', 'gist.github.com', false);
    expect((await get()).activeSites).toEqual([]);
  });

  it('keeps unrelated sites when turning off', async () => {
    await setSiteFlag('inlineSites', 'a.test', 'a.test', true);
    await setSiteFlag('inlineSites', 'b.test', 'b.test', true);
    await setSiteFlag('inlineSites', 'a.test', 'a.test', false);
    expect((await get()).inlineSites).toEqual(['b.test']);
  });

  it('removeSite removes an exact entry', async () => {
    await setSiteFlag('inlineSites', 'a.test', 'a.test', true);
    await removeSite('inlineSites', 'a.test');
    expect((await get()).inlineSites).toEqual([]);
  });
});

describe('badgeCount', () => {
  const entry = (host: string, blocked: boolean) => ({ url: `https://${host}/x.js`, host, file: 'x.js', initiator: 'page.test', blocked });
  const scripts = [entry('tracker.test', true), entry('shields.test', true), entry('cdn.test', false)];
  const settings = { ...DEFAULT_SETTINGS, blocks: [{ id: '1', domain: 'tracker.test', createdAt: 0 }] };
  const state = (page?: string) => ({ scripts, frames: [], inline: [], page });

  it('counts only global-block hits on an inactive page', () => {
    expect(badgeCount(settings, state('page.test'))).toBe(1);
  });

  it('counts every blocked script on an active page, subdomains included', () => {
    expect(badgeCount({ ...settings, activeSites: ['page.test'] }, state('www.page.test'))).toBe(2);
  });

  it('counts every blocked script when the page is unknown', () => {
    expect(badgeCount(settings, state(undefined))).toBe(2);
  });
});

describe('ruleMatches (mirrors the DNR rule for the popup)', () => {
  const r = (p: Partial<AllowRule>): AllowRule => ({ id: '1', domain: 'cdn.test', scope: 'global', createdAt: 0, ...p });
  const entry = (url: string, initiator = 'site.test') => ({ url, host: new URL(url).hostname, initiator });

  it('domain rule matches the domain and subdomains only', () => {
    expect(ruleMatches(r({}), entry('https://cdn.test/a.js'))).toBe(true);
    expect(ruleMatches(r({}), entry('https://sub.cdn.test/a.js'))).toBe(true);
    expect(ruleMatches(r({}), entry('https://evilcdn.test/a.js'))).toBe(false);
  });

  it('site scope requires the initiator to be on that site', () => {
    expect(ruleMatches(r({ scope: 'site.test' }), entry('https://cdn.test/a.js', 'www.site.test'))).toBe(true);
    expect(ruleMatches(r({ scope: 'site.test' }), entry('https://cdn.test/a.js', 'other.test'))).toBe(false);
  });

  it('script name matches the path, case-insensitive, with * wildcard', () => {
    expect(ruleMatches(r({ script: 'jquery.min.js' }), entry('https://cdn.test/npm/JQuery.min.js?v=3'))).toBe(true);
    expect(ruleMatches(r({ script: 'jquery.min.js' }), entry('https://cdn.test/npm/lodash.js'))).toBe(false);
    expect(ruleMatches(r({ script: '/lib/*.js' }), entry('https://cdn.test/lib/a.js'))).toBe(true);
    expect(ruleMatches(r({ script: '/lib/*.js' }), entry('https://cdn.test/other/a.js'))).toBe(false);
  });

  it('treats regex characters in the script name literally', () => {
    expect(ruleMatches(r({ script: 'a.js' }), entry('https://cdn.test/abjs'))).toBe(false);
  });
});
