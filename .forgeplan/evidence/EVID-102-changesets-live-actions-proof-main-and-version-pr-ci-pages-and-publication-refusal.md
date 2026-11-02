---
depth: standard
id: EVID-102
kind: evidence
last_modified_at: 2026-11-02T13:49:24.132605+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
status: active
title: 'Changesets live Actions proof: main and version PR CI, Pages and publication refusal'
---

---
assigned_number: 102
created: 2026-11-02
predicted_number: 102
slug: evid-changesets-live-actions-proof-main-and-version-pr-ci-pages-and-publication
updated: 2026-11-02
---

# Live Changesets workflow acceptance

## Structured Fields
evidence_type: measurement
verdict: supports
congruence_level: 3

## Measurement
Recorder: main orchestrator. Real GitHub Actions and repository API observations on 2026-11-02. Setup PR136 merged without bypass at 262fc20a5d328ff937a47d011954a7a62ca6c40d. This evidence completes the remote-execution gaps explicitly left open in EVID-101.

## Result
- Setup PR CI: https://github.com/gertsai/shared/actions/runs/41454452257 — pull_request, head 248f84c5e402b9d3bf7700a6aa74c44ac9e9f091, success, six jobs.
- Merged main CI: https://github.com/gertsai/shared/actions/runs/41455069733 — push, head 262fc20a5d328ff937a47d011954a7a62ca6c40d, success, six jobs.
- Version preparation: https://github.com/gertsai/shared/actions/runs/41455069834 — push, same main SHA, version job success, explicit generated-PR CI dispatch step success. No publish input is configured.
- Real generated release PR130 CI: https://github.com/gertsai/shared/actions/runs/41455130754 — workflow_dispatch, head c4fffa54050784d77dcac410ba3bd07116ed492e, success, six jobs. No PAT or new secret was introduced.
- Storybook build and deployment: https://github.com/gertsai/shared/actions/runs/41455069668 — push, same main SHA, build-and-deploy success. The prior pnpm version mismatch no longer blocks this path. No visual design change is claimed.

Each six-job CI run passed Build / Test / Typecheck, Changesets status, ESLint, Are The Types Wrong, Publint and Dependency Cruiser. These real CI builds close the local compiled-build limitation caused by host ENOSPC; no claim is made that the local scratch rebuild passed.

Actual version PR manifests were read at immutable c4fffa54050784d77dcac410ba3bd07116ed492e through the GitHub API. All nine public versions match EVID-101's real rehearsal: entity-react3.0.1, storage-core3.0.0, entity-storage7.0.0, entity-queries1.0.0, rpc-proxy-builder8.1.0, entity1.2.1, fetch0.4.2, pg-client4.0.0 and query-dsl3.0.0. Each retains https://npm.pkg.github.com. Private m9s-example remains private=true/version0.0.31.

## Live Negative Publication Scenario
https://github.com/gertsai/shared/actions/runs/41455181852 — manually dispatched on exact main262fc20a5d328ff937a47d011954a7a62ca6c40d with confirmation=CHECK, deliberately not PUBLISH. Frozen install, local-main baseline creation and real Changesets status generation succeeded. Validate publication preflight failed with exact error: Confirmation must equal PUBLISH.

All subsequent build/test/type/lint/package-check/recheck steps and Publish packages and create GitHub releases were skipped. Overall failure is the expected refusal result, not a broken successful-publication claim. No actual publication was attempted. setup-node's earlier NODE_AUTH_TOKEN value is a placeholder; the real publishing token is supplied only to the final publish action. Trusted repository code is not sandboxed by this environment scoping.

## Interpretation
FR001-006 are exercised: harmless version preparation on main, actual automatic CI dispatch to the bot PR, explicit confirmation refusal in the real publish workflow, independent public versions with unchanged private version, same registry/token model, and documentation/AGENTS rules delivered through a green merged PR. Positive registry publication remains a separate owner-approved operation, not a setup acceptance requirement.

## Provenance
- /tmp/changesets-live-actions-proof-20261102.json stores exact live run/job/step payloads.
- /tmp/changesets-live-release-pr-proof-20261102.json stores the immutable-head manifest comparison.
- /tmp/changesets-real-refusal-proof-20261102.json stores the real failed guard and skipped publish steps.
- GitHub URLs and immutable head SHAs above are the durable primary sources.

## Limitations
No registry publication, package release/tag creation, npm migration or hostile-build isolation was tested or authorized. GitHub job annotations warn that some existing action majors declare Node20 while forced to Node24 and ubuntu-latest is migrating to Ubuntu26; current observed runs succeed, action upgrades are outside this change.

## Congruence Level Justification
CL3: real workflows execute the target repository and installed dependencies in its actual GitHub Actions environment; observations are not API fixtures.

## Related Artifacts
Informs PRD-073 and RFC-029; supplements bounded local evidence EVID-101.



