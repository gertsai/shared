# Agent instructions

Follow `CLAUDE.md` for repository-wide engineering and safety rules.

## Changesets

- Add `pnpm changeset` for consumer-facing changes to public packages; choose patch for fixes, minor for compatible features, and major for breaking changes at version 1.0.0 or later. Before 1.0.0, breaking changes may use minor.
- Tooling/docs/test-only changes need no package release; use `pnpm changeset --empty` when the status check requires explicit no-release intent. Private examples are not versioned or tagged.
- Review `pnpm run changeset:status --since=origin/main`. Do not hand-bump versions or commit generated changelogs in feature PRs; the release bot owns version preparation.
- Never publish on a normal push or merge. Run read-only PREVIEW first; publishing requires owner approval of every listed version, its plan SHA-256 and the exact tested `main` SHA. Use guarded `publish.yml`; the registry is GitHub Packages, not public npm.

Details: [Changesets workflow](.changeset/README.md).
