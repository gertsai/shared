---
depth: standard
id: RFC-029
kind: rfc
last_modified_at: 2026-11-02T13:30:45.849457+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: based_on
status: draft
title: Separate Changesets version PR automation from verified manual publication
---

---
assigned_number: 29
created: 2026-11-02
prd: null
predicted_number: 29
slug: rfc-separate-changesets-version-pr-automation-from-verified-manual-publication
updated: 2026-11-02
---

# Changesets release pipeline

## Summary
Separate version preparation on main push from an explicit publish workflow. Use existing Changesets2.31.0/pnpm10.29.2/Node22 and GitHub Packages; no new dependency or token.

## Motivation
Current release.yml grants package write permission even to version preparation and publishes on ordinary main pushes when no changesets remain. Bot-generated PR130 currently has no registered CI. CONTRIBUTING promises the wrong registry.

## Options Considered
1. Chosen: version-only Changesets action plus CI dispatch, separate manual publish.yml with fail-closed preflight and exact SHA. No new credentials and explicit publication intent.
2. Rejected: keep auto publication after release PR merge. Violates explicit publication approval contract.
3. Rejected: add a PAT/GitHub App solely to trigger release PR CI. Additional owner-managed secrets are unnecessary because workflow_dispatch works with GITHUB_TOKEN.

## Proposed Direction
release.yml uses changesets/action@v1 without publish input; version command is pnpm run version:packages. If a version PR exists, use pullRequestNumber output and GitHub API to read its actual head ref and dispatch ci.yml there. Version job permissions: contents/pull-requests/actions write, no packages write. CI gains workflow_dispatch and a Changesets status job with normal PR since-base check and generated-release PR exemption from new-note requirement.

New publish.yml workflow_dispatch requires confirmation=PUBLISH and expected_sha. Checkout only dispatched main SHA. Preflight helper validates main ref, exact40hex input equals context.sha and current main head, latest push CI at that SHA is completed/successful, Changesets status has empty changesets/releases arrays, and every public package has GitHub Packages publishConfig.registry. Build/test/types/lint/package checks complete before changesets/action publish; package token exists only in publication step. Concurrency never cancels running publication. Ordinary main pushes never invoke publishing. GitHub release/tag creation remains Changesets-owned.

Config explicitly sets privatePackages version=false/tag=false and workspace-protocol-only dependency updates; fixed/linked stay empty, updateInternalDependencies remains patch. Root release delegates to explicit workflow dispatch; docs specify GitHub Packages is not public npm. Storybook drops conflicting pnpm version and consumes packageManager pin.

## Implementation Phases
- [x] Implement workflows/config/preflight, update README/CONTRIBUTING and add concise requested AGENTS.md rules.
- [x] Run actionlint, 28-case behavioral preflight smoke, isolated actual Changesets version/status and archive metadata checks. Full scratch rebuild was blocked by host ENOSPC; compiled release validation remains the real CI gate.
- [x] Independent workflow/security review; fix concrete findings.
- [ ] Open/merge setup PR after green CI; observe real generated release PR CI dispatch.
- [ ] Record evidence and leave publication to separate explicit approval.

## Verification and rollback
No registry calls with publish side effects during setup. Simulate versioning in an isolated task clone, not developer working tree. Guard tests use deterministic API responses only to exercise refusal/approval state transitions, not to claim real publication. Real GitHub CI dispatch must subsequently be observed. Revert setup before publishing if workflow validation fails; registry publication is irreversible and outside this configuration artifact.

## Sources
https://github.com/changesets/action/tree/v1
https://changesets.dev/guide/config
https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry

## Related Artifacts
PRD-073 is the parent; existing release PR130 supplies a real pending version-plan fixture.


