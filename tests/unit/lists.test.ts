import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  downloadList,
  listDataItem,
  listErrorItem,
  listMatcher,
  MIN_LIST_DOMAINS,
  parseFilterList,
  urlFilterRegExp,
} from '@/lib/lists';
import { disableList, setListAllow, settingsItem, updateSettings } from '@/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseFilterList', () => {
  it('keeps plain domain blocks and exceptions, lowercased and deduplicated', () => {
    const r = parseFilterList(
      [
        '[Adblock Plus 1.1]',
        '! comment',
        '||Tracker.com^',
        '||tracker.com^',
        '||ads.net^$third-party',
        '||px.io^$script,3p',
        '@@||ok.tracker.com^',
      ].join('\n'),
    );
    expect(r.domains).toEqual(['ads.net', 'px.io', 'tracker.com']);
    expect(r.exceptions).toEqual(['ok.tracker.com']);
    expect(r.skipped).toBe(0);
  });

  it('reads mixed resource types that include scripts as domain blocks', () => {
    const r = parseFilterList(
      ['||a.com^$script,third-party,xmlhttprequest', '||b.com^$~image,third-party', '||c.com^$important'].join('\n'),
    );
    expect(r.domains).toEqual(['a.com', 'b.com', 'c.com']);
    expect(r.filters).toEqual([]);
  });

  it('keeps path entries as DNR url filters', () => {
    const r = parseFilterList(
      [
        '||cdn.com/track.js',
        '||cdn.com^*/pixel$script',
        '/analytics.js',
        '&ev=PageView&',
        '|http://x.o2.pl^',
        '||google.*/collect?',
        '/analytics.js',
      ].join('\n'),
    );
    expect(r.filters).toEqual([
      { url: '||cdn.com/track.js' },
      { url: '||cdn.com^*/pixel', script: true },
      { url: '/analytics.js' },
      { url: '&ev=pageview&' },
      { url: '|http://x.o2.pl^' },
      { url: '||google.*/collect?' },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('keeps site restrictions, party and exceptions on filters', () => {
    const r = parseFilterList(
      [
        '||adobedtm.com^$third-party,domain=~adobe.com|~costco.com',
        '||clarity.ms/tag/$script,domain=phileweb.com',
        '@@||js-agent.newrelic.com^$script,domain=abema.tv',
        '@@||addthis.com/js/*/addthis_widget.js$script,domain=a.com|b.com',
        '@@||adobedtm.com/launch-$script,xmlhttprequest',
        '@@||1trackapp.com/static/tracking/$script,stylesheet,~third-party',
        '||rail.bank.com^$script,~third-party',
      ].join('\n'),
    );
    expect(r.domains).toEqual([]);
    expect(r.filters).toEqual([
      { url: '||adobedtm.com^', notSites: ['adobe.com', 'costco.com'], party: 'third' },
      { url: '||clarity.ms/tag/', sites: ['phileweb.com'], script: true },
      { url: '||js-agent.newrelic.com^', allow: true, sites: ['abema.tv'], script: true },
      { url: '||addthis.com/js/*/addthis_widget.js', allow: true, sites: ['a.com', 'b.com'], script: true },
      { url: '||adobedtm.com/launch-', allow: true, script: true },
      { url: '||1trackapp.com/static/tracking/', allow: true, party: 'first', script: true },
      { url: '||rail.bank.com^', party: 'first', script: true },
    ]);
  });

  it('narrows broken positive sites, and drops an entry whose negated site cannot be expressed', () => {
    const r = parseFilterList(
      ['||a.com/x$domain=ok.com|wayfair.*', '||b.com/x$domain=wayfair.*', '||c.com/x$domain=~wayfair.*'].join('\n'),
    );
    expect(r.filters).toEqual([{ url: '||a.com/x', sites: ['ok.com'] }]);
    expect(r.skipped).toBe(2);
  });

  it('drops path blocks under a blocked domain, unless the list excepts that host', () => {
    const r = parseFilterList(
      [
        '||t.com^',
        '@@||ok.t.com^',
        '||t.com/x.js',
        '||sub.t.com^*/y',
        '||ok.t.com/z.js',
        '@@||t.com/keep.js$domain=a.com',
      ].join('\n'),
    );
    expect(r.filters).toEqual([{ url: '||ok.t.com/z.js' }, { url: '||t.com/keep.js', allow: true, sites: ['a.com'] }]);
    expect(r.skipped).toBe(2);
  });

  it('skips what cannot block a script, or what DNR cannot express', () => {
    const r = parseFilterList(
      [
        'example.com##.ad', // cosmetic
        '/^https?:\\/\\/x/$script', // regex
        '||img.com^$image', // other resource type
        '/pixel.gif$image,ping', // path, other resource types
        '||weird.com^$popup', // popup only
        '||x.com^$~script', // everything but scripts
        '||cb.com/c.js$redirect=noop.js,script', // changes the action
        '||post.com/rec$method=post', // unsupported option
        '||bad_domain^', // invalid host
        '/stats/\u00e9v', // non-ASCII
        '/a|b', // "|" inside the pattern
      ].join('\r\n'),
    );
    expect(r.domains).toEqual([]);
    expect(r.filters).toEqual([]);
    expect(r.skipped).toBe(11);
  });
});

describe('urlFilterRegExp', () => {
  const m = (filter: string, url: string) => urlFilterRegExp(filter).test(url);

  it('anchors || to the host or a subdomain', () => {
    expect(m('||cdn.com/x.js', 'https://cdn.com/x.js')).toBe(true);
    expect(m('||cdn.com/x.js', 'https://a.cdn.com/x.js')).toBe(true);
    expect(m('||cdn.com/x.js', 'https://notcdn.com/x.js')).toBe(false);
    expect(m('||cdn.com/x.js', 'https://evil.com/?u=cdn.com/x.js')).toBe(false);
  });

  it('treats ^ as a separator, * as anything, | as an end anchor, case-insensitive', () => {
    expect(m('||cdn.com^*/pixel', 'http://cdn.com:8080/a/pixel')).toBe(true);
    expect(m('||cdn.com^', 'https://cdn.com.evil.net/')).toBe(false);
    expect(m('/analytics.js|', 'https://x.com/Analytics.js')).toBe(true);
    expect(m('/analytics.js|', 'https://x.com/analytics.js?v=1')).toBe(false);
    expect(m('|http://a.b^', 'http://a.b/')).toBe(true);
    expect(m('|http://a.b^', 'https://a.b/')).toBe(false);
  });
});

describe('listMatcher', () => {
  const covers = listMatcher(
    {
      domains: ['tracker.com'],
      exceptions: ['ok.tracker.com'],
      filters: [
        { url: '/collect.js' },
        { url: '||cdn.com/only-on-news.js', sites: ['news.com'] },
        { url: '||tracker.com^', allow: true, sites: ['partner.com'] },
        { url: '/collect.js', allow: true, notSites: ['news.com'], party: 'first' },
      ],
    },
    ['mine.tracker.com'],
    ['active.com'],
  );

  it('covers the domain and its subdomains only', () => {
    expect(covers('https://tracker.com/a.js')).toBe(true);
    expect(covers('https://a.b.tracker.com/a.js')).toBe(true);
    expect(covers('https://nottracker.com/a.js')).toBe(false);
  });

  it('honors list exceptions and user overrides, with their subdomains', () => {
    expect(covers('https://ok.tracker.com/a.js')).toBe(false);
    expect(covers('https://x.ok.tracker.com/a.js')).toBe(false);
    expect(covers('https://mine.tracker.com/a.js')).toBe(false);
  });

  it('matches path filters, limited to their sites', () => {
    expect(covers('https://cdn.com/collect.js', 'news.com')).toBe(true);
    expect(covers('https://cdn.com/only-on-news.js', 'news.com')).toBe(true);
    expect(covers('https://cdn.com/only-on-news.js', 'blog.com')).toBe(false);
  });

  it('site and first-party exceptions unblock only where they apply, never on active sites', () => {
    expect(covers('https://tracker.com/a.js', 'partner.com')).toBe(false);
    expect(covers('https://tracker.com/a.js', 'other.com')).toBe(true);
    expect(covers('https://www.shop.com/collect.js', 'shop.com')).toBe(false);
    expect(covers('https://cdn.net/collect.js', 'shop.com')).toBe(true);
    expect(covers('https://www.active.com/collect.js', 'active.com')).toBe(true);
  });
});

describe('downloadList', () => {
  const big = Array.from({ length: MIN_LIST_DOMAINS }, (_, i) => `||t${i}.com^`).join('\n');
  const fakeFetch = (status: number, body: string) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

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
