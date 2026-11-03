# Aegis

Browser extension (Brave/Chrome, MV3) that blocks every script by default once enabled, and lets you allow scripts per domain (optionally per script name), globally or per site.

## Develop

```bash
npm install
npm run dev      # opens a Chromium with the extension loaded, with HMR
npm run build    # output in .output/chrome-mv3
```

## Test

```bash
npm test               # unit (Vitest + WXT fakeBrowser): lib/ and backup import
npm run test:coverage  # same, with coverage report in coverage/
npm run test:e2e       # builds, then runs Playwright against real Chromium with the extension loaded
```

The E2E suite maps every `*.test` host to a local server, so it can check per-domain and per-site rules across "different" sites. The popup is opened as a tab whose `tabs.query` points at the page under test, since Playwright cannot click the toolbar icon.

Load in Brave: `brave://extensions` → Developer mode → **Load unpacked** → `.output/chrome-mv3`.
Turn off Brave Shields' own script blocking so the two don't overlap.

## How it works

All blocking is done with `declarativeNetRequest` dynamic rules, rebuilt from settings on every change (`lib/rules.ts`):

| Priority | Rule |
|---|---|
| 3 | Paused site: `allowAllRequests` for the page |
| 2 | Allow rule: script domain (+ optional `urlFilter` on the script name, + optional `initiatorDomains` for a site scope), or an inline-allowed site |
| 1 | Block every `script` request, and append a CSP header that drops inline scripts |

Domains match their subdomains. A per-site rule matches the document that loads the script, so scripts inside a third-party iframe follow the iframe's domain.

Inline scripts never hit the network, so `entrypoints/inline-watch.content.ts` runs in every frame and reports `securitypolicyviolation` events caused by Aegis' own CSP (violations of the site's own CSP are ignored). The popup lists inline blocks per frame host, so an embedded player's inline scripts can be allowed separately from the page. An inline-allowed domain applies wherever that domain is loaded, as a page or as an iframe.

The popup lists blocked scripts on the current tab, collected by `webRequest` in observe mode (`entrypoints/background.ts`). A script blocked by another blocker (e.g. Brave Shields) also shows up as blocked.

## Layout

```
entrypoints/background.ts   rule sync, per-tab script log, badge
entrypoints/popup/          per-tab UI
entrypoints/options/        manage all rules, paused/inline sites, import/export
lib/rules.ts                settings -> DNR rules
lib/settings.ts             storage + rule operations
lib/domain.ts               domain/script normalization
```
