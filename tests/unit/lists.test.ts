import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { downloadList, listDataItem, listErrorItem, listMatcher, MIN_LIST_DOMAINS, parseFilterList } from '@/lib/lists';
import { disableList, setListAllow, settingsItem, updateSettings } from '@/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseFilterList', () => {
  it('keeps plain domain blocks and exceptions, lowercased and deduplicated', () => {
    const r = parseFilterList(
      ['[Adblock Plus 1.1]', '! comment', '||Tracker.com^', '||tracker.com^', '||ads.net^$third-party', '||px.io^$script,3p', '@@||ok.tracker.com^'].join('\n'),
    );
    expect(r.domains).toEqual(['ads.net', 'px.io', 'tracker.com']);
    expect(r.exceptions).toEqual(['ok.tracker.com']);
    expect(r.skipped).toBe(0);
  });

  it('skips what cannot become a script block on every site', () => {
    const r = parseFilterList(
      [
        'example.com##.ad', // cosmetic
        '||cdn.com/track.js', // path
        '||cdn.com^*/pixel', // wildcard path
        '/analytics.js', // not domain anchored
        '/^https?:\\/\\/x/', // regex
        '||site.com^$domain=news.com', // site restricted
        '||img.com^$image', // other resource type
        '||weird.com^$popup', // unsupported option
        '||bad_domain^', // invalid domain
      ].join('\r\n'),
    );
    expect(r.domains).toEqual([]);
    expect(r.skipped).toBe(9);
  });
});

describe('listMatcher', () => {
  const covers = listMatcher({ domains: ['tracker.com'], exceptions: ['ok.tracker.com'] }, ['mine.tracker.com']);

  it('covers the domain and its subdomains only', () => {
    expect(covers('tracker.com')).toBe(true);
    expect(covers('a.b.tracker.com')).toBe(true);
    expect(covers('nottracker.com')).toBe(false);
    expect(covers('com')).toBe(false);
  });

  it('honors list exceptions and user overrides, with their subdomains', () => {
    expect(covers('ok.tracker.com')).toBe(false);
    expect(covers('x.ok.tracker.com')).toBe(false);
    expect(covers('mine.tracker.com')).toBe(false);
  });
});

describe('downloadList', () => {
  const big = Array.from({ length: MIN_LIST_DOMAINS }, (_, i) => `||t${i}.com^`).join('\n');
  const fakeFetch = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('returns parsed data with a timestamp', async () => {
    const d = await downloadList('easyprivacy', fakeFetch(200, big + '\n@@||ok.com^'));
    expect(d.domains).toHaveLength(MIN_LIST_DOMAINS);
    expect(d.exceptions).toEqual(['ok.com']);
    expect(d.updatedAt).toBeGreaterThan(0);
  });

  it('rejects HTTP errors and suspiciously small lists', async () => {
    await expect(downloadList('easyprivacy', fakeFetch(503, big))).rejects.toThrow('HTTP 503');
    await expect(downloadList('easyprivacy', fakeFetch(200, '||a.com^'))).rejects.toThrow('cuma berisi 1 domain');
  });
});

describe('list settings', () => {
  it('disableList turns the list off and drops its data and error', async () => {
    await updateSettings((s) => ({ ...s, lists: ['easyprivacy'] }));
    await listDataItem('easyprivacy').setValue({ domains: ['a.com'], exceptions: [], updatedAt: 1, skipped: 0 });
    await listErrorItem('easyprivacy').setValue('old error');

    await disableList('easyprivacy');
    expect((await settingsItem.getValue()).lists).toEqual([]);
    expect(await listDataItem('easyprivacy').getValue()).toBeNull();
    expect(await listErrorItem('easyprivacy').getValue()).toBeNull();
  });

  it('setListAllow adds once and removes', async () => {
    await setListAllow('cdn.com', true);
    await setListAllow('cdn.com', true);
    expect((await settingsItem.getValue()).listAllow).toEqual(['cdn.com']);
    await setListAllow('cdn.com', false);
    expect((await settingsItem.getValue()).listAllow).toEqual([]);
  });
});
