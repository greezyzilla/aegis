# Aegis

Free to use and modify for non-commercial purposes; selling it is not allowed ([license](#license)).

Browser extension (Brave/Chrome, MV3) with two layers:

- **Global blocks**: script domains (optionally a script name) blocked on every site, e.g. trackers.
- **Public lists**: EasyPrivacy, downloaded from easylist.to when you turn it on in Options and refreshed weekly. Its domain and path entries block scripts on every site like a global block, honoring the list's `$domain=` and `$third-party` restrictions. Its `@@` exceptions unblock where they apply (never on active sites), and so do the hosts you allow from the popup.
- **Active sites**: sites you turn on from the popup. There every script is blocked unless an allow rule (per domain, optionally per script name, on all active sites or one site) lets it through, e.g. for sites that inject ads from varying vendors.

Nothing is blocked until you add a global block or activate a site.

## Develop

```bash
npm install
npm run dev      # opens a Chromium with the extension loaded, with HMR
npm run build    # output in dist/chrome-mv3
npm run lint     # ESLint
npm run format   # Prettier (CI runs npm run format:check)
```

Branches, commit messages, merging and releases follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Test

```bash
npm test               # unit (Vitest + WXT fakeBrowser): lib/ and backup import
npm run test:coverage  # same, with coverage report in coverage/
npm run test:e2e       # builds, then runs Playwright against real Chromium with the extension loaded
npm run test:firefox   # builds for Firefox, then runs the same scenarios in real Firefox (headless)
```

`test:firefox` needs Firefox 140+ installed (or `FIREFOX_BIN` pointing at its binary) and exits with an error if it is missing. Playwright cannot load extensions in Firefox, so `e2e-firefox/` drives Firefox through Marionette with a throwaway profile, no extra dependencies. It makes no outside network requests unless `AEGIS_FIREFOX_NETWORK=1`, which also checks a real EasyPrivacy download.

The E2E suite maps every `*.test` host to a local server, so it can check per-domain and per-site rules across "different" sites. The popup is opened as a tab whose `tabs.query` points at the page under test, since Playwright cannot click the toolbar icon.

Load in Brave: `brave://extensions` → Developer mode → **Load unpacked** → `dist/chrome-mv3`.
Turn off Brave Shields' own script blocking so the two don't overlap.

### Firefox

Supported as MV3, Firefox 140 or newer (`npm run build:firefox`, output in `dist/firefox-mv3`). To try a local build, load it from `about:debugging` → This Firefox → **Load Temporary Add-on** → `dist/firefox-mv3/manifest.json`; it is gone after a restart. To keep it installed, use the signed `.xpi` from a release.

Differences from Chrome:

- Firefox caps dynamic DNR rules at 5,000 (Chrome: 30,000). A list's domains fit in one rule, but each path entry or exception is a rule of its own: EasyPrivacy needs about 8,500. On Firefox the least script-like path entries are left out to stay under the cap, and Options shows how many.
- A request blocked by DNR is reported to `webRequest` as `NS_ERROR_ABORT` instead of `net::ERR_BLOCKED_BY_CLIENT`; the background accepts both.
- The Playwright suite only drives Chromium; `npm run test:firefox` covers Firefox: active and inactive sites, allow rules (global, per site, per script), inline sites, iframes, global blocks, a 47k-domain public list, the popup's script log and badge, and the weekly alarm.

## Release

Versions follow semver, live in `package.json` (WXT copies them into both manifests), and are bumped by [release-please](https://github.com/googleapis/release-please), never by hand:

1. Every merge to `main` updates one open **Release PR** with the next version and `CHANGELOG.md`, computed from the Conventional Commit messages (`fix` → patch, `feat` → minor, breaking changes → minor while below 1.0).
2. Merging the Release PR tags `vX.Y.Z`, creates the GitHub Release, and attaches `aegis-X.Y.Z-chrome.zip` and `aegis-X.Y.Z-firefox.zip`. When the repo has the `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` secrets, the signed Firefox `.xpi` is attached too.

The extension is not published to the stores. Brave/Chrome loads the unzipped Chrome build unpacked. Firefox release builds only keep signed add-ons installed, so the Firefox build is signed on AMO as **unlisted**: never listed in the store, signed automatically, and installable for good from the `.xpi`. To sign locally instead, put the AMO API credentials (addons.mozilla.org → Developer Hub → Manage API Keys) in `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` and run `npm run sign:firefox` (output in `dist/signed/`). Signing uploads the sources zip with the build because the bundle is minified; `wxt.config.ts` keeps `backlog/` and test output out of that zip.

## How it works

All blocking is done with `declarativeNetRequest` dynamic rules, rebuilt from settings on every change (`lib/rules.ts`):

| Priority | Rule                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6        | Global block: script domain (+ optional `urlFilter` on the script name), on every site                                                                                                                                                                                       |
| 5        | Public list exception (`@@` entry): allow, with the list's site restriction, never on active sites (`excludedInitiatorDomains`)                                                                                                                                              |
| 4        | Public list: one rule holds all its domains in `requestDomains` (the dynamic-rule cap counts rules, not domains); each path or site-restricted entry is one `urlFilter` rule. The list's domain exceptions and the hosts allowed from the popup are `excludedRequestDomains` |
| 3        | `allowAllRequests` on every top-level page except active sites (`excludedRequestDomains`), so inactive tabs, iframes included, load everything except priority 4+                                                                                                            |
| 2        | Allow rule: script domain (+ optional `urlFilter` on the script name, + optional `initiatorDomains` for a site scope), or an inline-allowed site                                                                                                                             |
| 1        | Block every `script` request, and append a CSP header that drops inline scripts                                                                                                                                                                                              |

Only the top-level page decides whether a tab is active, so an iframe inside an active site is blocked too. Domains match their subdomains. A per-site rule matches the document that loads the script, so scripts inside a third-party iframe follow the iframe's domain.

Inline scripts never hit the network, so `entrypoints/inline-watch.content.ts` runs in every frame and reports `securitypolicyviolation` events caused by Aegis' own CSP (violations of the site's own CSP are ignored). The popup lists inline blocks per frame host, so an embedded player's inline scripts can be allowed separately from the page. An inline-allowed domain applies wherever that domain is loaded, as a page or as an iframe.

On an active site the popup lists blocked scripts on the current tab; on every site it lists the scripts that ran, each blockable globally. Both come from logs collected by `webRequest` in observe mode (`entrypoints/background.ts`). A script blocked by another blocker (e.g. Brave Shields) also shows up as blocked.

## Layout

```
entrypoints/background.ts   rule sync, per-tab script log, badge
entrypoints/popup/          per-tab UI
entrypoints/options/        manage allow rules, global blocks, active/inline sites, auto-reload, import/export
lib/rules.ts                settings -> DNR rules
lib/settings.ts             storage + rule operations
lib/domain.ts               domain/script normalization
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE): you may use, change and share Aegis for any non-commercial purpose. Selling it, or using it for commercial purposes, is not allowed.
