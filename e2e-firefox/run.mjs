// Runs Aegis in real Firefox (headless) and checks the same behavior as the Chromium e2e suite.
// Usage: node e2e-firefox/run.mjs [dist/firefox-mv3]   (npm run test:firefox builds first)
// AEGIS_FIREFOX_NETWORK=1 also downloads the real EasyPrivacy list.
import path from 'node:path';
import { findFirefox, launch } from './marionette.mjs';
import { HOSTS, startServer } from './server.mjs';

const extPath = path.resolve(process.argv[2] ?? 'dist/firefox-mv3');
const firefox = findFirefox();
if (!firefox) {
  console.error('Firefox not found. Install Firefox 140+ or set FIREFOX_BIN to its binary.');
  process.exit(2);
}

const ALL = (site) => [
  'cdn.test/lib/a.js',
  'cdn.test/lib/b.js',
  'other.test/d.js',
  `${site}/self.js`,
  'sub.cdn.test/c.js',
];
const BASE = { rules: [], blocks: [], activeSites: [], inlineSites: [], lists: [], listAllow: [] };
const rule = (domain, scope = 'global', script) => ({
  id: `${domain}|${script ?? ''}|${scope}`,
  domain,
  scope,
  ...(script && { script }),
  createdAt: 0,
});
const block = (domain) => ({ id: domain, domain, createdAt: 0 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
/** Re-evaluates until the value matches (rule syncs are async), then records pass or fail. */
async function expectEventually(name, read, want, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let got;
  for (;;) {
    try {
      got = await read();
    } catch (e) {
      got = `error: ${e.message}`;
    }
    if (JSON.stringify(got) === JSON.stringify(want)) {
      passed++;
      console.log(`  ✓ ${name}`);
      return;
    }
    if (Date.now() > deadline) break;
    await sleep(500);
  }
  failures.push(name);
  console.log(`  ✘ ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
}

const server = await startServer();
const PORT = server.address().port;
console.log(`Firefox: ${firefox}\nExtension: ${extPath}`);
let ff;
try {
  ff = await launch({ firefox, extPath, hosts: HOSTS });
} catch (err) {
  console.error(`\n  ✘ could not start: ${err.message}`);
  server.close();
  process.exit(1);
}

try {
  const ext = await ff.openExtPage('options.html');
  const inExt = async (fn, ...args) => {
    await ff.use(ext);
    return ff.run(fn, ...args);
  };
  const set = (settings, extra = {}) =>
    inExt((s, x) => browser.storage.local.set({ ...x, settings: s }), settings, extra);
  const ran = async (host, p = '/page') => {
    await ff.newTab();
    await ff.goto(`http://${host}:${PORT}${p}`);
    return ff.run(() => ({ inline: !!window.inline, loaded: (window.loaded || []).sort() }));
  };
  const frameRan = async () => {
    await ff.newTab();
    await ff.goto(`http://stream.test:${PORT}/embed`);
    await ff.send('WebDriver:SwitchToFrame', { id: 0 });
    const r = await ff.run(() => ({ inline: !!window.inline, loaded: (window.loaded || []).sort() }));
    await ff.send('WebDriver:SwitchToParentFrame');
    return r;
  };
  /** Tab log and badge of the last tab on `host`, as the popup and toolbar see them. */
  const tabView = (host) =>
    inExt(async (h) => {
      const [tab] = (await browser.tabs.query({ url: `*://${h}/*` })).slice(-1);
      const key = `tab:${tab.id}`;
      const state = (await browser.storage.session.get(key))[key] ?? { scripts: [], inline: [] };
      return {
        blocked: state.scripts.filter((s) => s.blocked).length,
        lists: state.scripts.filter((s) => s.list).map((s) => s.list),
        initiators: state.scripts.map((s) => `${s.host}/${s.file} < ${s.initiator}`).sort(),
        inline: state.inline,
        page: state.page,
        badge: await browser.action.getBadgeText({ tabId: tab.id }),
      };
    }, host);

  console.log('\nRule sync and blocking');
  await expectEventually('fresh install blocks nothing', () => ran('site-a.test'), {
    inline: true,
    loaded: ALL('site-a.test'),
  });
  await set({ ...BASE, activeSites: ['site-a.test'] });
  await expectEventually('active site blocks scripts and inline', () => ran('site-a.test'), {
    inline: false,
    loaded: [],
  });
  await expectEventually('active site covers www', () => ran('www.site-a.test'), { inline: false, loaded: [] });
  await expectEventually('other sites run everything', () => ran('site-b.test'), {
    inline: true,
    loaded: ALL('site-b.test'),
  });
  await expectEventually(
    'no sync error',
    () => inExt(async () => (await browser.storage.session.get('syncError')).syncError ?? null),
    null,
  );

  console.log('\nPopup data');
  await ran('site-a.test');
  await expectEventually(
    'blocked scripts logged (NS_ERROR_ABORT), page host, badge',
    async () => {
      const v = await tabView('site-a.test');
      return [v.blocked, v.page, v.badge];
    },
    [5, 'site-a.test', '5'],
  );
  await expectEventually('inline block reported per frame', async () => (await tabView('site-a.test')).inline, [
    { host: 'site-a.test', count: 1 },
  ]);

  console.log('\nAllow rules');
  await set({ ...BASE, activeSites: ['test'], rules: [rule('cdn.test')] });
  await expectEventually('global allow covers subdomains', async () => (await ran('site-a.test')).loaded, [
    'cdn.test/lib/a.js',
    'cdn.test/lib/b.js',
    'sub.cdn.test/c.js',
  ]);
  await set({ ...BASE, activeSites: ['test'], rules: [rule('cdn.test', 'global', 'b.js')] });
  await expectEventually('script name narrows the rule', async () => (await ran('site-a.test')).loaded, [
    'cdn.test/lib/b.js',
  ]);
  await set({ ...BASE, activeSites: ['test'], rules: [rule('other.test', 'site-a.test')] });
  await expectEventually('per-site rule applies on its site', async () => (await ran('site-a.test')).loaded, [
    'other.test/d.js',
  ]);
  await expectEventually(
    'script log records the initiating site (originUrl)',
    async () => (await tabView('site-a.test')).initiators,
    [
      'cdn.test/a.js < site-a.test',
      'cdn.test/b.js < site-a.test',
      'other.test/d.js < site-a.test',
      'site-a.test/self.js < site-a.test',
      'sub.cdn.test/c.js < site-a.test',
    ],
  );
  await expectEventually('per-site rule not elsewhere', async () => (await ran('site-b.test')).loaded, []);
  await set({ ...BASE, activeSites: ['test'], inlineSites: ['site-a.test'] });
  await expectEventually('inline allowed per site', () => ran('site-a.test'), { inline: true, loaded: [] });

  console.log('\nIframes');
  await set({ ...BASE, activeSites: ['stream.test'] });
  await expectEventually('iframe inside an active page stays blocked', frameRan, { inline: false, loaded: [] });
  await set({
    ...BASE,
    activeSites: ['stream.test'],
    inlineSites: ['player.test'],
    rules: [rule('cdn.test', 'player.test')],
  });
  await expectEventually('iframe inline site + iframe-scoped rule', frameRan, {
    inline: true,
    loaded: ['cdn.test/lib/a.js'],
  });
  await expectEventually(
    'a script inside an iframe is logged with the iframe as initiator',
    async () => (await tabView('stream.test')).initiators,
    ['cdn.test/a.js < player.test'],
  );

  console.log('\nGlobal blocks');
  await set({ ...BASE, blocks: [block('other.test')], activeSites: ['site-a.test'], rules: [rule('other.test')] });
  await expectEventually(
    'global block on an inactive site',
    async () => (await ran('site-b.test')).loaded,
    ALL('site-b.test').filter((s) => s !== 'other.test/d.js'),
  );
  await expectEventually('global block beats an allow rule', async () => (await ran('site-a.test')).loaded, []);

  console.log('\nPublic list');
  const domains = Array.from({ length: 47000 }, (_, i) => `t${i}.example`).concat('cdn.test');
  await set(
    { ...BASE, lists: ['easyprivacy'] },
    { 'list:easyprivacy': { domains, exceptions: ['sub.cdn.test'], updatedAt: 1, skipped: 0 } },
  );
  await expectEventually(
    '47k-domain list is one DNR rule with its exception',
    async () =>
      (
        await inExt(async () =>
          (await browser.declarativeNetRequest.getDynamicRules()).map((r) => [
            r.action.type,
            r.condition.requestDomains?.length ?? 0,
            r.condition.excludedRequestDomains ?? [],
          ]),
        )
      ).at(-1),
    ['block', 47001, ['sub.cdn.test']],
  );
  await expectEventually(
    'list blocks its domains, minus the exception',
    async () => (await ran('site-b.test')).loaded,
    ['other.test/d.js', 'site-b.test/self.js', 'sub.cdn.test/c.js'],
  );
  await expectEventually(
    'list hits tagged, counted on the badge',
    async () => {
      const v = await tabView('site-b.test');
      return [v.lists, v.badge];
    },
    [['easyprivacy', 'easyprivacy'], '2'],
  );
  const filters = [{ url: '/lib/b.js' }, { url: '||cdn.test^*/lib/b.js', allow: true, sites: ['site-b.test'] }];
  await set(
    { ...BASE, lists: ['easyprivacy'] },
    { 'list:easyprivacy': { domains: ['other.test'], exceptions: [], filters, updatedAt: 1, skipped: 0 } },
  );
  await expectEventually('path entry blocks everywhere', async () => (await ran('site-a.test')).loaded, [
    'cdn.test/lib/a.js',
    'site-a.test/self.js',
    'sub.cdn.test/c.js',
  ]);
  await expectEventually(
    'path hit tagged with the list (originUrl)',
    async () => (await tabView('site-a.test')).lists,
    ['easyprivacy', 'easyprivacy'],
  );
  await expectEventually('site exception unblocks on its site', async () => (await ran('site-b.test')).loaded, [
    'cdn.test/lib/a.js',
    'cdn.test/lib/b.js',
    'site-b.test/self.js',
    'sub.cdn.test/c.js',
  ]);
  await set(
    { ...BASE, lists: ['easyprivacy'], activeSites: ['site-b.test'], rules: [rule('cdn.test')] },
    { 'list:easyprivacy': { domains: ['other.test'], exceptions: [], filters, updatedAt: 1, skipped: 0 } },
  );
  await expectEventually(
    'site exception does not apply on an active site',
    async () => (await ran('site-b.test')).loaded,
    ['cdn.test/lib/a.js', 'sub.cdn.test/c.js'],
  );

  const many = Array.from({ length: 6000 }, (_, i) => ({ url: `/x${i}.js` }));
  await set(
    { ...BASE, lists: ['easyprivacy'] },
    { 'list:easyprivacy': { domains: ['other.test'], exceptions: [], filters: many, updatedAt: 1, skipped: 0 } },
  );
  await expectEventually(
    '6,000 path entries are cut to the 5,000-rule cap, without a sync error',
    () =>
      inExt(async () => {
        const s = await browser.storage.session.get(['listDropped', 'syncError']);
        return [
          (await browser.declarativeNetRequest.getDynamicRules()).length,
          s.listDropped ?? null,
          s.syncError ?? null,
        ];
      }),
    [5000, 1004, null],
    60000,
  );
  await set({ ...BASE });
  await expectEventually(
    'dropped count cleared once everything fits',
    () => inExt(async () => (await browser.storage.session.get('listDropped')).listDropped ?? null),
    null,
  );

  await expectEventually(
    'weekly refresh alarm',
    () => inExt(async () => (await browser.alarms.get('aegis:lists'))?.periodInMinutes ?? null),
    10080,
  );
  if (process.env.AEGIS_FIREFOX_NETWORK === '1') {
    await expectEventually(
      'real EasyPrivacy download',
      async () => {
        const res = await inExt(() => browser.runtime.sendMessage({ type: 'aegis:list-refresh', id: 'easyprivacy' }));
        const n = await inExt(
          async () => (await browser.storage.local.get('list:easyprivacy'))['list:easyprivacy']?.domains.length ?? 0,
        );
        return [res, n > 40000];
      },
      [{ ok: true }, true],
      60000,
    );
  }

  console.log('\nPages');
  await ff.openExtPage('popup.html');
  await expectEventually(
    'popup renders',
    () => ff.run(() => document.querySelector('h1')?.textContent ?? null),
    'Aegis',
  );
  await ff.openExtPage('options.html');
  await expectEventually(
    'options renders every section',
    () => ff.run(() => [...document.querySelectorAll('.section-title')].map((h) => h.firstChild.textContent.trim())),
    ['Active sites', 'Allow rules', 'Global blocks', 'Public lists', 'Inline scripts allowed', 'Settings', 'Backup'],
  );
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log(`\n  ✘ run crashed: ${e.stack ?? e.message}`);
} finally {
  await ff.close();
  server.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
