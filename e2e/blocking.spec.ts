import { ALL_SCRIPTS, DEFAULTS, expect, rule, test } from './fixtures';

test.describe('blocking rules in a real browser', () => {
  test('fresh install is disabled: everything runs', async ({ visit, ran, getSettings }) => {
    expect((await getSettings())?.enabled ?? false).toBe(false);
    const page = await visit('site-a.test');
    expect(await ran(page)).toEqual({ inline: true, loaded: ALL_SCRIPTS('site-a.test') });
  });

  test('enabled with no rules blocks first-party, third-party and inline', async ({ setSettings, visit, ran }) => {
    await setSettings(DEFAULTS);
    const page = await visit('site-a.test');
    expect(await ran(page)).toEqual({ inline: false, loaded: [] });
  });

  test('global domain rule allows the domain and its subdomains on every site', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test')] });
    const expected = { inline: false, loaded: ['cdn.test/lib/a.js', 'cdn.test/lib/b.js', 'sub.cdn.test/c.js'] };
    expect(await ran(await visit('site-a.test'))).toEqual(expected);
    expect(await ran(await visit('site-b.test'))).toEqual(expected);
  });

  test('script name narrows the rule to that file', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test', 'global', 'b.js')] });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: false, loaded: ['cdn.test/lib/b.js'] });
  });

  test('script name supports * wildcard', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test', 'global', '/lib/*.js')] });
    expect(await ran(await visit('site-a.test'))).toEqual({
      inline: false,
      loaded: ['cdn.test/lib/a.js', 'cdn.test/lib/b.js'],
    });
  });

  test('per-site rule only applies on that site', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('other.test', 'site-a.test')] });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: false, loaded: ['other.test/d.js'] });
    expect(await ran(await visit('www.site-a.test'))).toEqual({ inline: false, loaded: ['other.test/d.js'] });
    expect(await ran(await visit('site-b.test'))).toEqual({ inline: false, loaded: [] });
  });

  test('first-party scripts can be allowed for their own site', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('site-a.test', 'site-a.test')] });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: false, loaded: ['site-a.test/self.js'] });
  });

  test('global and per-site rules combine', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test', 'global', 'a.js'), rule('other.test', 'site-b.test')] });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: false, loaded: ['cdn.test/lib/a.js'] });
    expect(await ran(await visit('site-b.test'))).toEqual({
      inline: false,
      loaded: ['cdn.test/lib/a.js', 'other.test/d.js'],
    });
  });

  test('inline scripts can be allowed per site', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, inlineSites: ['site-a.test'] });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: true, loaded: [] });
    expect(await ran(await visit('site-b.test'))).toEqual({ inline: false, loaded: [] });
  });

  test('pausing a site lets everything run there only', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, pausedSites: ['site-a.test'] });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: true, loaded: ALL_SCRIPTS('site-a.test') });
    expect(await ran(await visit('site-b.test'))).toEqual({ inline: false, loaded: [] });
  });

  test('turning it off removes every rule', async ({ setSettings, visit, ran }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test')] });
    await setSettings({ ...DEFAULTS, enabled: false, rules: [rule('cdn.test')] });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: true, loaded: ALL_SCRIPTS('site-a.test') });
  });

  test('rules survive a service worker restart', async ({ setSettings, visit, ran, context, sw }) => {
    await setSettings({ ...DEFAULTS, rules: [rule('cdn.test', 'global', 'a.js')] });
    // Stop the service worker through CDP; DNR rules live in the browser, not the worker.
    const cdp = await context.newCDPSession(await context.newPage());
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find((t) => t.type === 'service_worker' && t.url === sw.url());
    expect(target, 'extension service worker target').toBeTruthy();
    await cdp.send('Target.closeTarget', { targetId: target!.targetId });
    expect(await ran(await visit('site-a.test'))).toEqual({ inline: false, loaded: ['cdn.test/lib/a.js'] });
  });
});
