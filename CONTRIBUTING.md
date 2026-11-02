# Contributing to gertsai/shared

Thanks for considering a contribution. This monorepo houses the OSS shared
infrastructure packages used across the gerts.ai ecosystem.

## Workflow

1. Fork or create a branch from `main`.
2. Implement your change.
3. Run the relevant local checks:
   ```sh
   pnpm install
   pnpm build
   pnpm test
   ```
4. For consumer-facing changes to public packages, create a changeset:
   ```sh
   pnpm changeset
   ```
   Select the affected packages, choose `patch`/`minor`/`major`, and write
   consumer-facing release notes. Private examples are not versioned or tagged.
   Tooling, documentation, and test-only changes need no package release; use
   `pnpm changeset --empty` when a status check needs explicit no-release intent.
5. Open a PR. CI must pass before merge. Review the release plan with:
   ```sh
   pnpm run changeset:status --since=origin/main
   ```
   `pnpm run version:packages` is for scratch verification, not hand-bumping
   versions on feature PRs.
6. After merge to `main`, `.github/workflows/release.yml` creates or updates the
   `chore: release packages` version PR and explicitly dispatches CI on its head.
   This avoids relying on bot-generated events to trigger ordinary workflows.
7. A maintainer reviews versions, changelogs and internal dependency propagation,
   and requires green CI before merging the version PR. This does **not** publish.
8. Publish separately from `main`, using the exact current 40-character SHA:
   ```sh
   pnpm release -f expected_sha=<full-40-character-sha> -f confirmation=PUBLISH
   ```
   This dispatches `publish.yml`; it does not publish locally. The workflow
   requires that SHA to match current `main`, the latest main push CI to have
   succeeded at that SHA, and no pending changesets or release-plan entries.
   It rechecks immediately before publishing.

The current registry is GitHub Packages. The publishing step uses the
repository's `GITHUB_TOKEN` with `packages: write`; no new PAT or GitHub App is
required. Visibility is configured separately from Changesets' `access` option.
Public npm requires a separately approved registry/authentication migration.

Publishing cannot be undone by reverting Git. If a publish partially succeeds,
inspect actual published versions. Re-dispatch the same SHA only if all guards
still pass and the publishing code is unchanged; Changesets checks existing
versions. Changed code requires a new version. Never overwrite published
versions or force-update tags.

See the [Changesets guide](./.changeset/README.md) for details and official sources.

## Local toolchain

- Node ≥ 22 LTS
- pnpm 10.x
- TypeScript 5.9+
- (Optional) [moonrepo](https://moonrepo.dev) — `pnpm dlx @moonrepo/cli` exposes
  task graph caching. The `pnpm` scripts work standalone.

## Adding a new package

1. Create `packages/<name>/` with:
   - `package.json` (`"name": "@gertsai/<name>"`, `"version": "0.0.0"`)
   - `tsconfig.json` (extends `../../tsconfig.base.json`)
   - `src/index.ts`
   - `README.md`
   - `LICENSE` (Apache 2.0)
2. Run `pnpm install` from root to wire workspace links.
3. Add a changeset for the initial release.

## License

By contributing, you agree your work is licensed under Apache 2.0
(see [LICENSE](./LICENSE)).
