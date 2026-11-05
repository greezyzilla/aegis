import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { chromium, test as base, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import type { ListData } from '../lib/lists';
import { buildDnrRules } from '../lib/rules';
import type { AllowRule, BlockRule, Settings, TabState } from '../lib/types';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '../dist/chrome-mv3');

/**
 * Every *.test host resolves to a local server. Each page loads:
 *   inline script, first-party /self.js, cdn.test/lib/a.js, cdn.test/lib/b.js,
 *   sub.cdn.test/c.js, other.test/d.js
 * Each script records "<host><path>" in window.loaded.
 */
function startServer() {
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0] ?? '';
    const port = (server.address() as AddressInfo).port;
    if (req.url?.startsWith('/embed')) {
      // Mimics a streaming site: the player lives in a third-party iframe that needs its own inline script.
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html><body>
<script>window.inline = 1</script>
<iframe src="http://player.test:${port}/player" width="400" height="200"></iframe>
</body></html>`);
      return;
    }
    if (req.url?.startsWith('/player')) {
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html><body>
<script>window.inline = 1</script>
<script>window.inline2 = 1</script>
<script src="http://cdn.test:${port}/lib/a.js"></script>
</body></html>`);
      return;
    }
    if (req.url?.startsWith('/strict')) {
      // The site's own CSP blocks inline; Aegis must not count that as its own block.
      res.setHeader('content-type', 'text/html');
      res.setHeader('content-security-policy', "script-src 'self'");
      res.end(`<!doctype html><html><body><script>window.inline = 1</script></body></html>`);
      return;
    }
    if (req.url?.startsWith('/page')) {
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html><head><title>${host}</title></head><body>
<script>window.inline = 1</script>
<script src="/self.js"></script>
<script src="http://cdn.test:${port}/lib/a.js"></script>
<script src="http://cdn.test:${port}/lib/b.js"></script>
<script src="http://sub.cdn.test:${port}/c.js"></script>
<script src="http://other.test:${port}/d.js"></script>
</body></html>`);
      return;
    }
    res.setHeader('content-type', 'text/javascript');
    res.end(`window.loaded = (window.loaded || []).concat(${JSON.stringify(host + (req.url ?? ''))});`);
  });
  return new Promise<http.Server>((resolve) => server.listen(0, () => resolve(server)));
}

export const ALL_SCRIPTS = (site: string) => [
  'cdn.test/lib/a.js',
  'cdn.test/lib/b.js',
  'other.test/d.js',
  `${site}/self.js`,
  'sub.cdn.test/c.js',
];

/** Blocking on: "test" makes every *.test site active. */
export const DEFAULTS: Settings = {
  rules: [],
  blocks: [],
  activeSites: ['test'],
  inlineSites: [],
  lists: [],
  listAllow: [],
};

export const rule = (domain: string, scope = 'global', script?: string): AllowRule => ({
  id: `${domain}|${script ?? ''}|${scope}`,
  domain,
  script,
  scope,
  createdAt: 0,
});

export const block = (domain: string, script?: string): BlockRule => ({
  id: `${domain}|${script ?? ''}`,
  domain,
  script,
  createdAt: 0,
});

interface Fixtures {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  /** Replaces stored settings (and downloaded list data) and waits until the background has synced the DNR rules. */
  setSettings: (s: Settings, lists?: Record<string, ListData>) => Promise<void>;
  getSettings: () => Promise<Settings>;
  /** Opens http://<host><path> (default /page) and returns the page. */
  visit: (host: string, path?: string) => Promise<Page>;
  /** Tab state recorded by the background for a page. */
  tabState: (page: Page) => Promise<TabState>;
  /** What actually ran on the page. */
  ran: (page: Page) => Promise<{ inline: boolean; loaded: string[] }>;
  /** Opens popup.html in a tab, pretending `target` is the active tab. */
  openPopup: (target: Page) => Promise<Page>;
  tabIdOf: (page: Page) => Promise<number>;
}

export const test = base.extend<Fixtures, { port: number }>({
  port: [
    async ({}, use) => {
      const server = await startServer();
      await use((server.address() as AddressInfo).port);
      server.close();
    },
    { scope: 'worker' },
  ],

  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      // The suite reads the Indonesian UI; English is covered by the unit tests and screenshots.
      locale: 'id-ID',
      args: [
        '--lang=id',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--host-resolver-rules=MAP *.test 127.0.0.1',
      ],
    });
    await use(context);
    await context.close();
  },

  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },

  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },

  setSettings: async ({ sw }, use) => {
    await use(async (s, lists = {}) => {
      const listItems = Object.fromEntries(Object.entries(lists).map(([id, d]) => [`list:${id}`, d]));
      if (Object.keys(listItems).length) await sw.evaluate((items) => chrome.storage.local.set(items), listItems);
      await sw.evaluate((settings) => chrome.storage.local.set({ settings }), s);
      // Wait for these exact rules, not just a count: different settings can yield the same number
      // of rules (e.g. a fresh install and one active site), and a page loaded in between mixes both.
      const expected = buildDnrRules(s, lists).rules;
      await expect
        .poll(() => sw.evaluate(async () => chrome.declarativeNetRequest.getDynamicRules()))
        .toMatchObject(expected);
    });
  },

  getSettings: async ({ sw }, use) => {
    await use(() => sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings as Settings));
  },

  visit: async ({ context, port }, use) => {
    await use(async (host, path = '/page') => {
      const page = await context.newPage();
      await page.goto(`http://${host}:${port}${path}`);
      return page;
    });
  },

  ran: async ({}, use) => {
    await use((page) =>
      page.evaluate(() => {
        const w = window as unknown as { inline?: number; loaded?: string[] };
        return { inline: !!w.inline, loaded: (w.loaded ?? []).slice().sort() };
      }),
    );
  },

  tabIdOf: async ({ sw }, use) => {
    await use(async (page) => {
      const url = page.url();
      const id = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
      if (id === undefined) throw new Error(`No tab for ${url}`);
      return id;
    });
  },

  tabState: async ({ sw, tabIdOf }, use) => {
    await use(async (page) => {
      const id = await tabIdOf(page);
      const state = await sw.evaluate(
        async (key) => (await chrome.storage.session.get(key))[key] as TabState | undefined,
        `tab:${id}`,
      );
      // Background persists with a short delay; treat "not yet written" as empty.
      return state ?? { scripts: [], frames: [], inline: [] };
    });
  },

  openPopup: async ({ context, extensionId, tabIdOf }, use) => {
    await use(async (target) => {
      const tabId = await tabIdOf(target);
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 360, height: 600 });
      // A real popup is anchored to the active tab; here the popup is itself a tab, so point it at `target`.
      await popup.addInitScript(
        ([id, url]) => {
          chrome.tabs.query = (async () => [{ id, url }]) as unknown as typeof chrome.tabs.query;
        },
        [tabId, target.url()] as const,
      );
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.getByRole('heading', { name: 'Aegis' }).waitFor();
      return popup;
    });
  },
});

export { expect };
