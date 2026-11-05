// Minimal Marionette client that runs Firefox with the extension, no dependencies.
//
// Why Marionette: Playwright cannot load extensions in Firefox. WebDriver BiDi and Marionette both
// refuse to navigate to moz-extension:// URLs, so extension pages are opened from the browser chrome,
// which needs MOZ_REMOTE_ALLOW_SYSTEM_ACCESS. That is set only for the throwaway profile made here.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const EXTENSION_ID = 'aegis@greezyzilla';
/** Fixed through a pref so extension pages have a known URL. */
const UUID = '6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f';

/** FIREFOX_BIN, then the usual install locations, then `firefox` on PATH. */
export function findFirefox() {
  const candidates = [
    process.env.FIREFOX_BIN,
    '/Applications/Firefox.app/Contents/MacOS/firefox',
    '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;
  try {
    return execFileSync('which', ['firefox'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Starts Firefox headless with a temporary profile and installs the extension temporarily. */
export async function launch({ firefox, extPath, hosts }) {
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-firefox-'));
  fs.writeFileSync(
    path.join(profile, 'user.js'),
    [
      ['network.dns.localDomains', hosts.join(',')],
      ['extensions.webextensions.uuids', JSON.stringify({ [EXTENSION_ID]: UUID })],
      ['marionette.port', port],
      ['browser.shell.checkDefaultBrowser', false],
      ['datareporting.policy.dataSubmissionEnabled', false],
      ['toolkit.telemetry.reportingpolicy.firstRun', false],
      ['browser.aboutwelcome.enabled', false],
      ['app.update.enabled', false],
      ['network.proxy.type', 0],
    ]
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n'),
  );
  const ff = spawn(firefox, ['--headless', '--no-remote', '--marionette', '--profile', profile], {
    stdio: 'ignore',
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' },
  });
  const exited = new Promise((resolve) => ff.once('exit', resolve));
  /** Waits for Firefox to exit before removing the profile, or it writes files back into it. */
  const cleanup = async () => {
    if (ff.exitCode === null) ff.kill();
    await Promise.race([exited, sleep(10000)]);
    if (ff.exitCode === null && ff.signalCode === null) ff.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  };
  try {
    return await connect(ff, port, extPath, cleanup);
  } catch (err) {
    await cleanup();
    throw err;
  }
}

async function connect(ff, port, extPath, cleanup) {

  let sock = null;
  for (let i = 0; i < 240 && !sock; i++) {
    sock = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1', () => resolve(s));
      s.on('error', () => resolve(null));
    });
    if (!sock) await sleep(250);
  }
  if (!sock) throw new Error('Firefox did not start Marionette within 60 s');

  // Marionette frames are "<byte length>:<json>".
  let buf = Buffer.alloc(0);
  let hello;
  const helloSeen = new Promise((r) => (hello = r));
  const pending = new Map();
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const colon = buf.indexOf(':');
      if (colon < 0) return;
      const len = Number(buf.subarray(0, colon).toString());
      if (buf.length < colon + 1 + len) return;
      const msg = JSON.parse(buf.subarray(colon + 1, colon + 1 + len).toString('utf8'));
      buf = buf.subarray(colon + 1 + len);
      if (!Array.isArray(msg)) {
        hello();
        continue;
      }
      const [, id, error, result] = msg;
      const p = pending.get(id);
      pending.delete(id);
      if (error) p.reject(new Error(`${error.error}: ${error.message}`));
      else p.resolve(result);
    }
  });
  await helloSeen;

  let nextId = 1;
  const send = (command, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const body = Buffer.from(JSON.stringify([0, id, command, params]), 'utf8');
      sock.write(`${body.length}:`);
      sock.write(body);
    });

  await send('WebDriver:NewSession', { capabilities: { pageLoadStrategy: 'normal' } });
  try {
    await send('Addon:Install', { path: extPath, temporary: true });
  } catch (err) {
    sock.destroy();
    throw new Error(`Firefox refused the extension at ${extPath}: ${err.message}`, { cause: err });
  }

  const api = {
    send,
    extUrl: (page) => `moz-extension://${UUID}/${page}`,

    async newTab() {
      const { handle } = await send('WebDriver:NewWindow', { type: 'tab' });
      await send('WebDriver:SwitchToWindow', { handle, focus: true });
      return handle;
    },
    use: (handle) => send('WebDriver:SwitchToWindow', { handle, focus: true }),
    goto: (url) => send('WebDriver:Navigate', { url }),

    /** Opens an extension page from the browser chrome and switches to it. */
    async openExtPage(page) {
      const url = api.extUrl(page);
      const before = new Set(await send('WebDriver:GetWindowHandles'));
      await send('Marionette:SetContext', { value: 'chrome' });
      await send('WebDriver:ExecuteScript', {
        script: `const w = Services.wm.getMostRecentWindow('navigator:browser');
          w.gBrowser.selectedTab = w.gBrowser.addTab(arguments[0], {
            triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
          });`,
        args: [url],
      });
      await send('Marionette:SetContext', { value: 'content' });
      for (let i = 0; i < 100; i++) {
        const handle = (await send('WebDriver:GetWindowHandles')).find((h) => !before.has(h));
        if (handle) {
          await send('WebDriver:SwitchToWindow', { handle, focus: true });
          const { value } = await send('WebDriver:GetCurrentURL');
          if (value.startsWith('moz-extension://')) {
            await sleep(300);
            return handle;
          }
        }
        await sleep(100);
      }
      throw new Error(`could not open ${page}`);
    },

    /** Runs a function (given as source) in the current tab with JSON args; returns its JSON result. */
    async run(fn, ...args) {
      const script = `const done = arguments[arguments.length - 1];
        (async () => (${fn})(...${JSON.stringify(args)}))().then(
          (v) => done(JSON.stringify(v === undefined ? null : v)),
          (e) => done(JSON.stringify({ __error: String(e) })),
        );`;
      const { value } = await send('WebDriver:ExecuteAsyncScript', { script, args: [], scriptTimeout: 60000 });
      const parsed = JSON.parse(value);
      if (parsed && parsed.__error) throw new Error(parsed.__error);
      return parsed;
    },

    async close() {
      try {
        await send('Marionette:Quit', { flags: ['eForceQuit'] });
      } catch {
        // Firefox may close the socket before answering.
      }
      sock.destroy();
      await cleanup();
    },
  };
  return api;
}
