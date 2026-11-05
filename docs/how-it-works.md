# How it works

All blocking is done with `declarativeNetRequest` dynamic rules, rebuilt from the settings on every change (`lib/rules.ts`). Higher priority wins:

| Priority | Rule                                                               |
| -------- | ------------------------------------------------------------------ |
| 6        | Global block, on every site                                        |
| 5        | Public list exception (`@@` entry), never on active sites          |
| 4        | Public list entry                                                  |
| 3        | Allow everything on pages that are not active sites                |
| 2        | Allow rule, or a site whose inline scripts are allowed             |
| 1        | Block every script, and add a CSP header that drops inline scripts |

- **6, global block.** A script domain, optionally with a `urlFilter` on the script name.
- **5, list exception.** Allowed with the list's own site restriction, and kept off active sites with `excludedInitiatorDomains`.
- **4, list entry.** One rule holds all of a list's plain domains in `requestDomains`, since the dynamic-rule cap counts rules, not domains. Each path entry or site-restricted entry is a `urlFilter` rule of its own. The list's domain exceptions and the hosts allowed from the popup go in `excludedRequestDomains`.
- **3, inactive pages.** `allowAllRequests` on every top-level page except the active sites, so tabs that are not active, iframes included, load everything below priority 4.
- **2, allow rule.** A script domain, optionally with a `urlFilter` on the script name and `initiatorDomains` when it is scoped to one site.
- **1, default.** Applies only on active sites, because priority 3 covers every other page.

Only the top-level page decides whether a tab is active, so an iframe inside an active site is blocked too. Domains match their subdomains. A per-site rule matches the document that loads the script, so scripts inside a third-party iframe follow the iframe's domain.

## Inline scripts

Inline scripts never hit the network, so `entrypoints/inline-watch.content.ts` runs in every frame and reports the `securitypolicyviolation` events caused by Aegis' own CSP. Violations of the site's own CSP are ignored. The popup lists inline blocks per frame host, so an embedded player's inline scripts can be allowed separately from the page. An inline-allowed domain applies wherever that domain loads, as a page or as an iframe.

## Script log

On an active site the popup lists the scripts blocked on the current tab; on every site it lists the scripts that ran, each blockable globally. Both come from logs collected by `webRequest` in observe mode (`entrypoints/background.ts`). A script blocked by another blocker, such as Brave Shields, shows up as blocked too.

## Firefox

- Firefox caps dynamic rules at 5,000 (Chrome: 30,000). A list's plain domains fit in one rule, but each path entry or exception needs its own: EasyPrivacy comes to about 8,500. On Firefox the least script-like path entries are left out to stay under the cap, and the options page shows how many.
- A request blocked by DNR reaches `webRequest` as `NS_ERROR_ABORT` instead of `net::ERR_BLOCKED_BY_CLIENT`. The background accepts both.

## Layout

```
entrypoints/background.ts            rule sync, per-tab script log, badge
entrypoints/inline-watch.content.ts  reports inline scripts blocked by Aegis' CSP
entrypoints/popup/                   per-tab UI
entrypoints/options/                 rules, global blocks, sites, lists, settings, backup
components/                          UI pieces shared by the popup and options
lib/rules.ts                         settings -> DNR rules
lib/settings.ts                      storage and rule operations
lib/lists.ts                         public list download and parsing
lib/domain.ts                        domain and script normalization
tests/                               unit tests (Vitest)
e2e/                                 Chromium suite (Playwright)
e2e-firefox/                         Firefox suite (Marionette)
```
