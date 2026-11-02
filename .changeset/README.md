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

Publishing is a separate, explicitly gated action. Dispatch `.github/workflows/publish.yml` from `main` with `expected_sha` set to the exact current 40-character `main` commit SHA and `confirmation` set to `PUBLISH`. The equivalent convenience command is:

```sh
pnpm release -f expected_sha=<full-40-character-sha> -f confirmation=PUBLISH
```

The command only dispatches the workflow; it does not publish locally. The workflow requires the expected SHA to remain the current `main` SHA, the latest main push CI run at that SHA to have succeeded, and no pending changesets or release-plan entries. Unpublished registry versions are expected at this point; the empty Changesets plan means version preparation is complete. The workflow rechecks its guards immediately before publishing.

The current registry is GitHub Packages. Publishing credentials are limited to the publish workflow, which uses `GITHUB_TOKEN` with `packages: write`; no PAT or GitHub App setup is required. Changesets' `access` setting does not make GitHub Packages visible publicly: package visibility is configured separately. Moving to public npm requires a separately approved registry and authentication change; it is not part of this process.

Publishing cannot be undone by reverting Git. Never overwrite published versions or force-update tags. If a publish partially succeeds, inspect which package versions actually published. Re-dispatch for the same SHA only if all gates still pass and the publishing code is unchanged; Changesets checks existing versions. If code changed, prepare a new version instead of retrying the old release.

## Official references

- [Changesets Action v1](https://github.com/changesets/action/tree/v1)
- [Changesets configuration](https://changesets.dev/guide/config)
- [GitHub: events that trigger workflows and `GITHUB_TOKEN`](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow)
