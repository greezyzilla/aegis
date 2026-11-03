import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addRules,
  DEFAULT_SETTINGS,
  editRule,
  removeRule,
  removeSite,
  ruleMatches,
  setEnabled,
  setSiteFlag,
  settingsItem,
} from '@/lib/settings';
import type { AllowRule } from '@/lib/types';

const get = () => settingsItem.getValue();

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings storage', () => {
  it('starts disabled with nothing configured', async () => {
    expect(await get()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
  });

  it('setEnabled toggles the master switch', async () => {
    await setEnabled(true);
    expect((await get()).enabled).toBe(true);
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
    await setSiteFlag('pausedSites', 'www.github.com', 'github.com', true);
    await setSiteFlag('pausedSites', 'www.github.com', 'github.com', true);
    expect((await get()).pausedSites).toEqual(['github.com']);

    // Turning off from a subdomain removes the parent entry that covers it.
    await setSiteFlag('pausedSites', 'gist.github.com', 'gist.github.com', false);
    expect((await get()).pausedSites).toEqual([]);
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
