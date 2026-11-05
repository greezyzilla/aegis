# Contributing

## Branches

`main` is always releasable and protected by a ruleset: changes land through a pull request, the `check` workflow must pass, and force pushes and branch deletion are blocked.

Work on a short-lived branch named `<type>/<short-slug>`, using the commit types below, e.g. `feat/easyprivacy-paths`, `fix/firefox-initiator`, `ci/release-conventions`. Open one PR per change; the branch is deleted when it is merged.

## Commit messages and PR titles

[Conventional Commits](https://www.conventionalcommits.org/), in English:

```
<type>(<optional scope>): <what changes, imperative, lowercase>
```

| Type                                                        | Use for                          | Release |
| ----------------------------------------------------------- | -------------------------------- | ------- |
| `feat`                                                      | a new capability for users       | minor   |
| `fix`                                                       | a bug fix                        | patch   |
| `perf`                                                      | faster or lighter, same behavior | patch   |
| `refactor`, `style`, `test`, `docs`, `build`, `ci`, `chore` | everything else                  | none    |

Common scopes: `popup`, `options`, `lists`, `rules`, `backup`, `firefox`, `deps`. Mark a breaking change with `!` (`feat!: ...`) or a `BREAKING CHANGE:` footer. Explain the why in the body.

The PR title follows the same format: the `pr-title` workflow checks it, and it becomes the commit message on `main`.

## Merging

- **Squash merge** is the default: one PR, one commit on `main`, with the PR title as its message.
- **Merge commit** only when the PR's commits must stay separate, for example when a later file refers to one of them by hash (as `.git-blame-ignore-revs` does). Say so in the PR.
- Rebase merging is disabled, and history on `main` is never rewritten.

## Before opening a PR

```bash
npm run compile && npm run lint && npm run format:check && npm test
```

CI runs the same checks plus both builds. The browser suites stay local because they need real browsers and minutes. Run them when behavior changes:

```bash
npm run test:e2e       # Chromium (Playwright)
npm run test:firefox   # Firefox (Marionette)
```

## Running and testing locally

```bash
npm run dev            # opens a Chromium with the extension loaded, with HMR
npm run build          # dist/chrome-mv3
npm run build:firefox  # dist/firefox-mv3
npm run lint           # ESLint
npm run format         # Prettier (CI runs npm run format:check)
npm test               # unit (Vitest + WXT fakeBrowser): lib/ and backup import
npm run test:coverage  # same, with a coverage report in coverage/
npm run test:e2e       # builds, then runs Playwright against real Chromium with the extension loaded
npm run test:firefox   # builds for Firefox, then runs the same scenarios in real Firefox (headless)
```

To try a build by hand, load `dist/chrome-mv3` from `brave://extensions` → Developer mode → **Load unpacked**, or load `dist/firefox-mv3/manifest.json` from `about:debugging` → This Firefox → **Load Temporary Add-on** (gone after a restart).

The E2E suite maps every `*.test` host to a local server, so it can check per-domain and per-site rules across "different" sites. The popup is opened as a tab whose `tabs.query` points at the page under test, since Playwright cannot click the toolbar icon.

`test:firefox` needs Firefox 140+ installed (or `FIREFOX_BIN` pointing at its binary) and exits with an error if it is missing. Playwright cannot load extensions in Firefox, so `e2e-firefox/` drives Firefox through Marionette with a throwaway profile, with no extra dependencies. It covers active and inactive sites, allow rules (global, per site, per script), inline sites, iframes, global blocks, a 47k-domain public list, the popup's script log and badge, and the weekly alarm. It makes no outside network requests unless `AEGIS_FIREFOX_NETWORK=1`, which also checks a real EasyPrivacy download.

## Releases

[release-please](https://github.com/googleapis/release-please) owns the version and `CHANGELOG.md`: never edit them by hand. Versions follow semver and live in `package.json`; WXT copies them into both manifests. It keeps one open Release PR, `chore(main): release X.Y.Z`, updated on every merge to `main` with the next version and changelog computed from the Conventional Commit messages (`fix` → patch, `feat` → minor, breaking changes → minor while below 1.0).

Merging that PR tags `vX.Y.Z`, publishes the GitHub Release, and attaches `aegis-X.Y.Z-chrome.zip` and `aegis-X.Y.Z-firefox.zip`. When the repo has the `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` secrets, the signed Firefox `.xpi` is attached too.

The extension is not published to the stores. Firefox release builds only keep signed add-ons installed, so the Firefox build is signed on AMO as **unlisted**: never listed in the store, signed automatically, and installable for good from the `.xpi`. To sign locally instead, put the AMO API credentials (addons.mozilla.org → Developer Hub → Manage API Keys) in `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` and run `npm run sign:firefox` (output in `dist/signed/`). Signing uploads the sources zip with the build because the bundle is minified; `wxt.config.ts` keeps `backlog/` and test output out of that zip.

The Release PR is opened with the workflow's own token, so GitHub runs no checks on it, and it only changes the version and changelog. A maintainer merges it past the required check: `gh pr merge <number> --squash --admin`.

## Dependencies

Dependabot opens grouped PRs once a month for npm packages and GitHub Actions. It only proposes versions at least 7 days old, since freshly published malicious versions are usually caught and pulled within days. Runtime dependency updates are `fix(deps)` and produce a patch release; dev dependency and Actions updates do not.

Before merging, read the lockfile diff for new packages or install scripts. Do not check out or `npm install` a dependency branch you have not looked at.

## License

By contributing, you agree that your contribution is licensed under the project's [PolyForm Noncommercial 1.0.0](LICENSE) license.
