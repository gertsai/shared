# Changesets

Changesets record which independently versioned public packages need a release and why. Create one for a consumer-facing package change; do not create release entries for private examples.

## Author a changeset

Run `pnpm changeset`, select each affected public package and choose its bump:

- `patch` for a backwards-compatible fix;
- `minor` for backwards-compatible functionality;
- `major` for a breaking change once that package is at version 1.0.0 or later.

Before 1.0.0, a `minor` bump can carry a breaking change under pre-1.0 SemVer. Write concise consumer-facing notes explaining the change and any migration impact. Choose the bump according to the actual change; a source-code change is not automatically minor, and legitimate peer-dependency changes may require a bump.

Private example applications are not versioned or tagged by Changesets. Pure tooling, documentation, and test-only changes that do not affect a published package need no package release. If a status check needs explicit no-release intent, use `pnpm changeset --empty`.

## Review and prepare

Use `pnpm run changeset:status --since=origin/main` to review the proposed release plan. Inspect selected packages, bump levels, notes, and internal dependency propagation. `pnpm run version:packages` applies the pending changesets locally for scratch verification; do not use it on a feature PR to hand-bump package versions. The release bot prepares the version PR.

## Release process

After changes land on `main`, `.github/workflows/release.yml` creates or updates the `chore: release packages` version PR and explicitly dispatches CI on its head. This avoids depending on bot-triggered workflow events or their approval prompts. A maintainer reviews the generated versions, changelogs, and internal dependency propagation, and requires CI before merging. Merging this version PR does **not** publish packages.

Publishing is a separate, explicitly gated action. First inspect the real registry plan at the exact current `main` commit:

```sh
SHA=$(gh api repos/gertsai/shared/commits/main --jq .sha)
pnpm release -f expected_sha="$SHA" -f confirmation=PREVIEW
```

PREVIEW uses `packages: read`, cannot publish, and produces a summary plus a `changesets-preview-<sha>` artifact. Review every candidate and the plan SHA-256. The version PR is not the complete publication set: Changesets can publish any public workspace version absent from the registry. A 404 can mean a new package or insufficient package access, so do not interpret it as proof the registry is empty.

After explicit owner approval of every listed package/version, set `APPROVED_PLAN_SHA256` to the reviewed preview digest:

```sh
pnpm release -f expected_sha="$SHA" -f confirmation=PUBLISH -f expected_plan_sha256="$APPROVED_PLAN_SHA256"
```

The command only dispatches Actions; it does not publish locally. Publication requires the exact current `main` SHA, successful latest main push CI, no pending changesets or release-plan entries, and the same approved package/version/access/dist-tag/registry digest. The workflow refreshes the native registry plan after its checks, packs only that approved plan, then revalidates the packed intent and fresh Changesets status. `publish --from-pack-dir` consumes those tarballs instead of discovering additional publishable packages.

The root toolchain pins Changesets CLI 3.0.3 and Action 2.1.2; both preview and publish use the same CLI because native plan JSON is experimental across versions. The version-only Action runs only when local changeset intent exists and never enters publication mode. No hand-written registry client or new long-lived credential is used.

The current registry is GitHub Packages. Preview uses the repository `GITHUB_TOKEN` with `packages: read`; publishing uses `packages: write`. No PAT or GitHub App setup is required, but existing packages must grant this repository Actions access. Visibility is separate from Changesets `access`. Public npm requires a separately approved registry/authentication migration.

Publishing cannot be undone by reverting Git. Never overwrite versions or force-update tags. After partial success, inspect actual registry state, run PREVIEW again and obtain approval for the remaining versions/new digest. Retry the same SHA only if all gates still pass and the publishing code is unchanged; changed code requires a new version.

## Official references

- [Changesets Action 2.1.2](https://github.com/changesets/action/tree/v2.1.2)
- [Native publish-plan, pack and publish commands](https://changesets.dev/guide/cli#publish-plan)
- [Changesets configuration](https://changesets.dev/guide/config)
- [GitHub: events that trigger workflows and `GITHUB_TOKEN`](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow)
