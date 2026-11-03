---
depth: standard
id: EVID-114
kind: evidence
last_modified_at: 2026-11-03T13:53:04.835575+00:00
last_modified_by: omp-coding-agent/1.0.0
status: draft
title: AI consumer discovery PR verification and honest acceptance boundaries
---

---
assigned_number: 114
created: 2026-11-03
predicted_number: 114
slug: evid-ai-consumer-discovery-pr-verification-and-honest-acceptance-boundaries
updated: 2026-11-03
---

## Summary

Scoped verification receipt for the AI consumer documentation/navigation change. Implementation commits:36526ce and622bcc3, based on main8cb51c1717197928c81fc82f1d5c3904b67601a3. This is a commit-scoped test/review receipt, not approval to publish packages or enable external indexing.

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: test
review_verdict: PASS

## Observations

- Frozen installation: pnpm install --frozen-lockfile succeeded. The existing copied dependency tree was reconciled to the tracked lockfile; Changesets CLI3.0.3 was installed from the declared lock. No dependency declaration or lockfile edit was requested.
- pnpm build succeeded before the first recursive test run.
- The initial ambient pnpm test failed in the example's two broker e2e beforeAll hooks after local Redis connection attempts. The ignored local .env existed, relevant variables were absent from the parent process, and project.config imports dotenv/config. No secret file contents were inspected or published. This failed run is retained as a failure, not silently counted as passing.
- A controlled clean-config run used DOTENV_CONFIG_PATH=/dev/null pnpm test. It succeeded:43executed Vitest summaries,5777passed,0failed,116skipped. Infrastructure-dependent skipped cases were not counted as passed. No test was removed, skipped newly, or changed to suppress the observed failure.
- Subsequent pnpm typecheck, pnpm lint, pnpm run docs:check, pnpm run changeset:status --since=origin/main, pnpm run publint, pnpm run attw and pnpm run depcruise all completed successfully in the same sequential command.
- docs:check executed13Node behavioral regressions:13passed,0failed,0skipped. Actual corpus:10documents,42source packages,157local links/anchors,25public import paths,0errors. It rejects missing targets/anchors, unknown/private imports, specific null wildcard exports, unsupported link syntax and repository escape through linked destinations AND initial documents/manifests/packages directory.
- dependency-cruiser reported no violations for164modules and397dependencies.
- Independent documentation review: PrePushDocsReview PASS, static review only.
- Independent tooling review: PrePushToolReview initially CONCERNS for unconfined initial reads. The parent added canonical-path checks before enumeration/reads and3negative fixtures. Independent re-review returned PASS; no actionable defects remain within the limited checker scope. Review agents did not execute checks or edit files.

## Additional already-observed checks

The exact documented timeout example executed against actual async-utils source in Node22 and reported timeout semantics:PASS. This was an explicit source-resolution smoke, NOT an installed registry consumer. Context7 configuration passed the official draft7 JSON Schema using an already-installed validator and remains disallow:true. CI YAML parsed successfully; actionlint was unavailable and is NOT reported as passed.

## Scope and limits

Repository docs/tooling only; no public library API, package versions, registry or publishing workflow was changed. The navigation gate does not render all Markdown, compile all examples, check named exports/types, crawl every historical README or prove external HTTP/registry availability. Older package README semantic discrepancies remain a separate documented follow-up.

The existing GitHub credential received HTTP403 from the canonical package metadata endpoint for insufficient scopes. Registry-consumer acceptance remains blocked until authorized package-read access is available through a secret manager/environment. No credential values were logged or permissions expanded. Source smoke does not close that gate.

No Context7 submission, production migration, infrastructure startup, package publication, forced lifecycle activation, or unrelated user-draft cleanup was performed. Historical project-health warnings about legacy evidence formatting/state tracking were observed, not repaired or claimed green as part of this documentation PR.

## Reproduction

Run from the implementation branch with the declared Node/pnpm toolchain:

1. pnpm install --frozen-lockfile
2. pnpm build
3. DOTENV_CONFIG_PATH=/dev/null pnpm test
4. pnpm typecheck
5. pnpm lint
6. pnpm run docs:check
7. pnpm run changeset:status --since=origin/main
8. pnpm run publint
9. pnpm run attw
10. pnpm run depcruise

The dotenv override isolates local mock-mode regression from ignored personal .env files without editing or deleting those files. Real infrastructure suites and a registry consumer need their own prerequisites and results.

## Raw result provenance

The clean-config sequential command exited0. Its raw local log is retained in the task session, not uploaded as a potentially sensitive transcript. UTF8size:191263bytes. SHA256:d3f2c7569ff84e5825beefdbcd2b1abafacc5b9fac3f1264316e04e90846f02c. The initial failed ambient run is retained separately in the same task session. The summaries above were extracted from executed command output, not inferred from source or an earlier release.

