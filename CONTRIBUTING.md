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
8. Inspect the real registry publication plan before approving a release:
   ```sh
   SHA=$(gh api repos/gertsai/shared/commits/main --jq .sha)
   pnpm release -f expected_sha="$SHA" -f confirmation=PREVIEW
   ```
   `publish.yml` uses read-only package permissions for preview. Review its
   summary and `changesets-preview-<sha>` artifact: the publish set can include
   packages beyond the version PR when a local version is absent from the
   registry. A registry 404 can also mean insufficient package access.
9. After explicit owner approval of every listed package/version, set
   `APPROVED_PLAN_SHA256` to the digest from that reviewed preview and dispatch:
   ```sh
   pnpm release -f expected_sha="$SHA" -f confirmation=PUBLISH -f expected_plan_sha256="$APPROVED_PLAN_SHA256"
   ```
   The workflow requires current `main`, successful latest main push CI, an
   empty Changesets status and the same approval digest. Native Changesets
   `pack`/`publish --from-pack-dir` limit publication to the approved plan.
   Registry state, packed intent and Changesets status are checked again after
   build/test/type/lint/package checks; a changed plan requires fresh approval.

The current registry is GitHub Packages. The publishing step uses the
repository's `GITHUB_TOKEN` with `packages: write`; no new PAT or GitHub App is
required. Visibility is configured separately from Changesets' `access` option.
Public npm requires a separately approved registry/authentication migration.

Publishing cannot be undone by reverting Git. If a publish partially succeeds,
inspect actual registry state, run PREVIEW again and obtain approval for the
remaining versions/new digest. Retry the same SHA only if all guards pass and
publishing code is unchanged. Changed code requires a new version. Never
overwrite published versions or force-update tags.

See the [Changesets guide](./.changeset/README.md) for details and official sources.

## Local toolchain

- Node 22.13+ LTS, Node 24 LTS, or Node 26+ for root release tooling
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
