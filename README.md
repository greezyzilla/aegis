# Aegis

Aegis blocks scripts on the sites you choose and lets through only the ones you allow.

Some sites load ads from a different vendor every week, so blocking them by domain never keeps up. On those sites Aegis blocks every script, and you allow the few the page actually needs from the popup. Everywhere else it stays out of the way, apart from trackers you block globally or pull in from EasyPrivacy.

Runs in Brave/Chrome and Firefox 140+. It is not on the extension stores; see [Install](#install).

## Install

Builds are attached to each [release](https://github.com/greezyzilla/aegis/releases). If there is no release yet, build it from source (see [Development](#development)).

**Brave / Chrome.** Unzip `aegis-X.Y.Z-chrome.zip`, open `brave://extensions` (or `chrome://extensions`), turn on Developer mode, click **Load unpacked** and pick the unzipped folder. In Brave, leave Shields' own script blocking off so the two don't overlap.

**Firefox.** Download the signed `.xpi`, then in `about:addons` open the gear menu and choose **Install Add-on From File**. It is signed by Mozilla as an unlisted add-on, so it stays installed after a restart.

Neither build updates itself. To upgrade, install the newer release the same way.

## Using it

Nothing is blocked until you activate a site, add a global block or turn on a list.

Open the popup on a site and switch on **Aktif di situs ini**. From then on every script on that site is blocked, inline ones included, and the popup lists what was blocked, grouped by domain. Allow a domain or a single script for this site only (**Situs ini**) or for every active site (**Global**). Inline scripts are listed per frame, so an embedded player can be allowed without allowing the page around it. With auto-reload on, the default, the tab reloads once when you close the popup.

On any site the popup also lists the scripts that ran. **Blok global** blocks one on every site, active or not, and a global block wins over allow rules.

The options page holds everything else: allow rules, global blocks, active and inline-allowed sites, EasyPrivacy (downloaded from easylist.to when you turn it on, refreshed weekly) and a JSON export/import of your settings. If EasyPrivacy breaks a site, allow the host from the popup.

## Limitations

- The interface is in Indonesian only.
- It blocks scripts and nothing else: images, iframes and other requests load as usual.
- Firefox allows 5,000 dynamic blocking rules, Chrome 30,000. EasyPrivacy needs about 8,500, so on Firefox the least script-like path entries are left out. The options page shows how many.

## Development

```bash
npm install
npm run dev            # Chromium with the extension loaded and hot reload
npm run build          # dist/chrome-mv3 (npm run build:firefox: dist/firefox-mv3)
npm test
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the browser test suites, branches, commit messages and releases. [docs/how-it-works.md](docs/how-it-works.md) explains how the blocking is built on `declarativeNetRequest`.

## License

[PolyForm Noncommercial 1.0.0](LICENSE): free to use, change and share for non-commercial purposes. Selling it is not allowed.
