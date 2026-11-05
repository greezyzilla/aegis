# Contributing

## Branches

`main` is always releasable and protected by a ruleset: changes land through a pull request, the `check` workflow must pass, and force pushes and branch deletion are blocked.

Work on a short-lived branch named `<type>/<short-slug>`, using the commit types below, e.g. `feat/easyprivacy-paths`, `fix/firefox-initiator`, `ci/release-conventions`. One PR per batch of related work, with one commit per change in it; the branch is deleted when it is merged.

## Commit messages

Every commit is a [Conventional Commit](https://www.conventionalcommits.org/), in English:

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

## PR titles

A plain English sentence, not a Conventional Commit: `Let the user pick the UI language in the options page`. The merge commit carries the title, and release-please reads the line after "Merge pull request", so a Conventional title would show up in the changelog a second time next to the commits it merges.

The `pr-title` workflow checks both rules: every commit in the PR is a Conventional Commit (merges from `main` are skipped) and the title is not. Bot PRs (the Release PR, Dependabot) are one commit each and keep their Conventional title. The description follows the [template](.github/pull_request_template.md): what changes, why, and how it was tested.

## Merging

- **Merge commit** is the default (`gh pr merge <number> --merge`): the PR's commits land on `main` as they are, one change each, so the changelog lists each of them. The merge commit is titled "Merge pull request #N from …" with the PR title as its body.
- **Squash** only for bot PRs (the Release PR, Dependabot): they are a single commit already.
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

UI text lives in `lib/i18n`: `en.ts` is the source and the default, `id.ts` must have the same keys (the type checks it). Add a string to both. The browser suites read the English UI; their test browser is Indonesian, which shows the default does not follow it, and `e2e/indonesian.spec.ts` picks Indonesian and fails on any English word left on screen.

The E2E suite maps every `*.test` host to a local server, so it can check per-domain and per-site rules across "different" sites. The popup is opened as a tab whose `tabs.query` points at the page under test, since Playwright cannot click the toolbar icon.

`test:firefox` needs Firefox 140+ installed (or `FIREFOX_BIN` pointing at its binary) and exits with an error if it is missing. Playwright cannot load extensions in Firefox, so `e2e-firefox/` drives Firefox through Marionette with a throwaway profile, with no extra dependencies. It covers active and inactive sites, allow rules (global, per site, per script), inline sites, iframes, global blocks, a 47k-domain public list, the popup's script log and badge, and the weekly alarm. It makes no outside network requests unless `AEGIS_FIREFOX_NETWORK=1`, which also checks a real EasyPrivacy download.

## Releases

[release-please](https://github.com/googleapis/release-please) owns the version and `CHANGELOG.md`: never edit them by hand. Versions follow semver and live in `package.json`; WXT copies them into both manifests. It keeps one open Release PR, `chore(main): release X.Y.Z`, updated on every merge to `main` with the next version and changelog computed from the Conventional Commit messages (`fix` → patch, `feat` → minor, breaking changes → minor while below 1.0).

Merging that PR tags `vX.Y.Z`, publishes the GitHub Release, and attaches `aegis-X.Y.Z-chrome.zip` and `aegis-X.Y.Z-firefox.zip`. When the repo has the `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` secrets, the signed `aegis-X.Y.Z-firefox.xpi` is attached too, with an `updates.json` that points to it. The Firefox manifest's `update_url` reads `releases/latest/download/updates.json`, so installed copies update themselves to the newest release. Lint the build with `web-ext lint --self-hosted`: without the flag the linter rejects `update_url`, which only Mozilla-hosted add-ons may not carry.

The extension is not published to the stores. Firefox release builds only keep signed add-ons installed, so the Firefox build is signed on AMO as **unlisted**: never listed in the store, signed automatically, and installable for good from the `.xpi`. To sign locally instead, put the AMO API credentials (addons.mozilla.org → Developer Hub → Manage API Keys) in `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` and run `npm run sign:firefox` (output in `dist/signed/`). Signing uploads the sources zip with the build because the bundle is minified; `wxt.config.ts` keeps `backlog/` and test output out of that zip.

The Release PR is opened and updated by the workflow's own token, and the repo is public, so GitHub holds its checks: `check` waits for approval and `pr-title` does not start. A maintainer starts them: `gh pr update-branch <number>` when the branch is behind `main`, otherwise close and reopen the PR. Merge it once both pass, with a squash since it is a single commit: `gh pr merge <number> --squash`. Never merge past the ruleset with `--admin`.

## Dependencies

Dependabot opens grouped PRs once a month for npm packages and GitHub Actions. It only proposes versions at least 7 days old, since freshly published malicious versions are usually caught and pulled within days. Runtime dependency updates are `fix(deps)` and produce a patch release; dev dependency and Actions updates do not.

Before merging, read the lockfile diff for new packages or install scripts. Do not check out or `npm install` a dependency branch you have not looked at.

## License

By contributing, you agree that your contribution is licensed under the project's [PolyForm Noncommercial 1.0.0](LICENSE) license.
