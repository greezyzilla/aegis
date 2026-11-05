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

## Releases

[release-please](https://github.com/googleapis/release-please) owns the version and `CHANGELOG.md`: never edit them by hand. It keeps one open Release PR, `chore(main): release X.Y.Z`. Merging that PR tags `vX.Y.Z`, publishes the GitHub Release, and attaches the Chrome and Firefox builds (see the README's Release section).

The Release PR is opened with the workflow's own token, so GitHub runs no checks on it, and it only changes the version and changelog. A maintainer merges it past the required check: `gh pr merge <number> --squash --admin`.

## Dependencies

Dependabot opens grouped PRs once a month for npm packages and GitHub Actions. It only proposes versions at least 7 days old, since freshly published malicious versions are usually caught and pulled within days. Runtime dependency updates are `fix(deps)` and produce a patch release; dev dependency and Actions updates do not.

Before merging, read the lockfile diff for new packages or install scripts. Do not check out or `npm install` a dependency branch you have not looked at.

## License

By contributing, you agree that your contribution is licensed under the project's [PolyForm Noncommercial 1.0.0](LICENSE) license.
