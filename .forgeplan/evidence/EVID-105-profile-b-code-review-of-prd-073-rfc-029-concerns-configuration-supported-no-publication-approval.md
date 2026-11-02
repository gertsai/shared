---
depth: standard
id: EVID-105
kind: evidence
last_modified_at: 2026-11-02T17:04:47.894095+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
status: active
title: 'Profile B code review of PRD-073 / RFC-029: CONCERNS — configuration supported, no publication approval'
---

---
assigned_number: 105
created: 2026-11-02
predicted_number: 105
slug: evid-profile-b-code-review-of-prd-073-rfc-029-concerns-configuration-supported
updated: 2026-11-02
---

# Canonical Profile B Changesets configuration review

## Structured Fields
verdict: supports
congruence_level: 3
evidence_type: code_review
review_verdict: CONCERNS
reviewer: CanonicalChangesetsReview
runtime: omp
model: openai-codex/gpt-6.1-sol
base_sha: 4bf577bfcd8891f7f5d2fa948b855f660761e390
result_sha: 4d713da41c9333f5915e24fe6100809a6544c323
changed_paths: .changeset/README.md, .changeset/config.json, .github/scripts/release-preflight.cjs, .github/workflows/ci.yml, .github/workflows/publish.yml, .github/workflows/release.yml, .github/workflows/storybook.yml, AGENTS.md, CONTRIBUTING.md, README.md, package.json
merged_sha: 262fc20a5d328ff937a47d011954a7a62ca6c40d

## Verdict

CONCERNS

Configuration readiness is supported by the frozen implementation, the captured 28-case guard exercise, and actual successful setup/main/generated-release-PR CI. No material defect survived this review; CONCERNS is the required honest-zero disposition under the ADR-013 reviewer discipline, not a finding of failed functional acceptance. This is not a PASS and must not be represented as one by a downstream activation gate.

This verdict concerns configuration activation only. It neither authorizes registry publication nor proves the complete set of package versions that a future Changesets publish would consider unpublished. The structured supports value refers to the bounded PRD-073/RFC-029 configuration claim, not publication permission.

## Scope

- Author: CanonicalChangesetsReview, Profile B code reviewer, running in omp with model openai-codex/gpt-6.1-sol; no Claude Code binary version is asserted.
- Attributed claim tag: claude-code/omp/code-reviewer-task-CanonicalChangesetsReview. The claude-code prefix is the repository's legacy audit-tag convention, not a claim about the actual runtime.
- Parents read in full through Forgeplan MCP: PRD-073 and RFC-029. Existing EVID-101 and EVID-102 were also read in full; they were not edited.
- Workspace for every Forgeplan call: /tmp/shared-changesets-20261102, resolved by the server to /private/tmp/shared-changesets-20261102/.forgeplan. The unrelated default user worktree was not used.
- Frozen diff: 4bf577bfcd8891f7f5d2fa948b855f660761e390..4d713da41c9333f5915e24fe6100809a6544c323. These 11 paths are unchanged in merged main 262fc20a5d328ff937a47d011954a7a62ca6c40d and in the inspected worktree.
- Reviewed every line of 11 source/configuration/documentation paths, 890 lines total; the source diff contains 447 insertions and 76 deletions.
- Files: .changeset/config.json; .changeset/README.md; .github/workflows/ci.yml; .github/workflows/release.yml; .github/workflows/publish.yml; .github/workflows/storybook.yml; .github/scripts/release-preflight.cjs; README.md; CONTRIBUTING.md; package.json; AGENTS.md.
- Scope excludes other historical source, package business APIs, source fixes, dependency installation, build/test/lint/formatter reruns, git writes, activation and publication. AGENTS.md was inspected as an explicitly requested review input, not adopted as a new instruction source.
- Historical boundary: this EVID reviews only source 4d713da41c9333f5915e24fe6100809a6544c323 as merged at 262fc20a5d328ff937a47d011954a7a62ca6c40d. Any later Actions registry-preview or expected package-version plan digest binding is outside this frozen range and is not covered by this review. Such remediation requires its own source/execution evidence and review.

## Tools run

| Tool or evidence | Observed result | Execution boundary |
|---|---|---|
| Clean-shell git rev-parse/diff/log reads | Commands completed; frozen delta present; source and merged target paths identical | Fresh read-only object-store inspection, no git writes |
| Read and Grep tools | All 11 files read completely; required approval/config/dispatch tokens found | Fresh static inspection; token probe below is literal tool output |
| wc -l | 890 total lines across the 11 files | File-size accounting, not test coverage |
| shasum -a 256 | Guard, local proof log, version proof and three live payload hashes recorded below | Primary-input provenance, not a behavioral rerun |
| Existing local guard proof | passed=28, failed=0 | Read /tmp/changesets-preflight-proof-20261102.log; not replayed |
| Existing real version proof | Nine expected public versions and changelogs; private example 0.0.31; pending changesets=0 and pending releases=0 | Read /tmp/changesets-version-proof-20261102.json and immutable release-PR comparison; no new CLI version run |
| Existing actual CI payloads | Setup/main/release-PR runs each have six completed successful jobs, with successful build/test/typecheck/lint/package-check steps | Read captured real GitHub Actions run/job/step payloads; no job rerun |
| Existing negative Publish payload | Preflight failure; final publication action skipped | Actual run 41455181852, not a fixture and not a positive publication |
| actionlint; node --check; local ESLint | EVID-101 reports exit 0 | Not rerun; these reported exits are supplementary, not freshly measured here |
| New lint/typecheck/tests/install/build/formatters | n/a — explicitly not run | Existing observations used as assigned; host ENOSPC not worked around |
| Hindsight memory_recall and mm-gate-failures | unavailable: /version could not be read; fpl-hsmem 3.7.0 requires API >=0.10.2 and <0.11.0; no bank request was sent | Review continuity limitation, not an invented source finding |
| Code-review-graph | unavailable in this session's mounted tools | Direct frozen diff and complete changed-file inspection used instead |

## Ground-truth verification

Base/source/merge SHAs came from the assignment and were independently resolved from this worktree's git object store. The following command was actually executed in a clean shell, with cwd=/tmp/shared-changesets-20261102:

~~~sh
bash --noprofile --norc -c 'set +u; R=/tmp/shared-changesets-20261102; git -C "$R" rev-parse --show-toplevel; git -C "$R" rev-parse 4bf577bfcd8891f7f5d2fa948b855f660761e390 4d713da41c9333f5915e24fe6100809a6544c323 262fc20a5d328ff937a47d011954a7a62ca6c40d HEAD; git -C "$R" diff --stat 4bf577bfcd8891f7f5d2fa948b855f660761e390..4d713da41c9333f5915e24fe6100809a6544c323; git -C "$R" diff --cached --stat; if git -C "$R" diff --quiet 4bf577bfcd8891f7f5d2fa948b855f660761e390..4d713da41c9333f5915e24fe6100809a6544c323 && git -C "$R" diff --cached --quiet; then echo DELTA=EMPTY; else echo DELTA=PRESENT; fi'
~~~

Literal stdout:

~~~text
/private/tmp/shared-changesets-20261102
4bf577bfcd8891f7f5d2fa948b855f660761e390
4d713da41c9333f5915e24fe6100809a6544c323
262fc20a5d328ff937a47d011954a7a62ca6c40d
262fc20a5d328ff937a47d011954a7a62ca6c40d
 .changeset/README.md                  |  41 +++++++++++
 .changeset/config.json                |   7 +-
 .github/scripts/release-preflight.cjs | 132 ++++++++++++++++++++++++++++++++++
 .github/workflows/ci.yml              |  56 ++++++++++++---
 .github/workflows/publish.yml         |  96 +++++++++++++++++++++++++
 .github/workflows/release.yml         |  83 ++++++++++++---------
 .github/workflows/storybook.yml       |   2 -
 AGENTS.md                             |  12 ++++
 CONTRIBUTING.md                       |  47 ++++++++++--
 README.md                             |  42 +++++------
 package.json                          |   5 +-
 11 files changed, 447 insertions(+), 76 deletions(-)
DELTA=PRESENT
~~~

Both per-file diffs were then read with git diff over the same frozen range, split into executable/configuration paths and documentation paths. To bind the line-numbered worktree reads to the frozen source, this exact additional command was executed:

~~~sh
bash --noprofile --norc -c 'git -C /tmp/shared-changesets-20261102 diff --name-only 4d713da41c9333f5915e24fe6100809a6544c323 -- .changeset/config.json .changeset/README.md .github/workflows/ci.yml .github/workflows/release.yml .github/workflows/publish.yml .github/workflows/storybook.yml .github/scripts/release-preflight.cjs README.md CONTRIBUTING.md package.json AGENTS.md'
~~~

It completed with empty stdout. A separate object-store comparison of source..merge also returned MERGED_TARGET_PATHS=IDENTICAL and WORKTREE_TARGET_PATHS=IDENTICAL. The merge object is PR136 with parents 4bf577bfcd8891f7f5d2fa948b855f660761e390 and 248f84c5e402b9d3bf7700a6aa74c44ac9e9f091.

Expected delta tokens derived from FR-001/FR-003/FR-004 and RFC-029: a version-only changesets action; workflow_dispatch and createWorkflowDispatch; privatePackages version=false/tag=false; a distinct manual publish workflow; and an exact RELEASE_CONFIRMATION/PUBLISH guard. All were found in the fully read frozen-equivalent files. The focused approval-token probe used the specialized Grep tool rather than a shell grep:

~~~json
{"pattern":"process\\.env\\.RELEASE_CONFIRMATION","path":"/tmp/shared-changesets-20261102/.github/scripts/release-preflight.cjs","case":true,"gitignore":true,"skip":0}
~~~

Literal tool output:

~~~text
[/tmp/shared-changesets-20261102/.github/scripts/release-preflight.cjs#4569]
 106:module.exports = async function validateReleasePreflight({ github, context, core, statusPath }) {
*107:  if (process.env.RELEASE_CONFIRMATION !== 'PUBLISH') {
 108:    throw new Error('Confirmation must equal PUBLISH.');
 109:  }
 110:
~~~

Diff state: DELTA=PRESENT. Expected token: FOUND. The frozen-ground-truth precondition is satisfied; the final CONCERNS disposition comes from the honest-zero review rule, not an empty diff or missing implementation token.

### Existing execution evidence independently inspected

The following are observations from the primary machine payloads read during this review, not new executions and not an adoption of the orchestrator's prose alone:

| Run | Exact head SHA | Event and observed result |
|---|---|---|
| https://github.com/gertsai/shared/actions/runs/41454452257 | 248f84c5e402b9d3bf7700a6aa74c44ac9e9f091 | Setup PR pull_request; success; all six jobs completed successfully |
| https://github.com/gertsai/shared/actions/runs/41455069733 | 262fc20a5d328ff937a47d011954a7a62ca6c40d | Main push; success; all six jobs completed successfully |
| https://github.com/gertsai/shared/actions/runs/41455130754 | c4fffa54050784d77dcac410ba3bd07116ed492e | Generated release PR workflow_dispatch; success; all six jobs completed successfully |
| https://github.com/gertsai/shared/actions/runs/41455069834 | 262fc20a5d328ff937a47d011954a7a62ca6c40d | Main push version preparation; Create or update the release pull request and Dispatch CI for the generated release pull request both succeeded |
| https://github.com/gertsai/shared/actions/runs/41455069668 | 262fc20a5d328ff937a47d011954a7a62ca6c40d | Main push Storybook; pnpm setup, install, Storybook build, upload and Pages deployment succeeded |
| https://github.com/gertsai/shared/actions/runs/41455181852 | 262fc20a5d328ff937a47d011954a7a62ca6c40d | Real negative workflow_dispatch; publish job failed at Validate publication preflight and Publish packages and create GitHub releases was skipped |

The three six-job CI payloads include successful Build / Test / Typecheck, Changesets status, ESLint, Publint, Are The Types Wrong, and Dependency Cruiser jobs. Their build/test/typecheck commands are recorded as successful steps, not merely a success label on a skipped workflow. The release-PR CI status step and the version workflow's explicit dispatch step are both successful.

The refusal payload independently shows frozen installation, local main baseline creation and status generation succeeded; preflight failed; every subsequent build/test/type/lint/package-check/recheck/publication step was skipped. EVID-102 and the assignment identify the deliberate confirmation=CHECK input; the inspected JSON contains the step outcomes, not the dispatch input or error text. The guard's line 108 explains the stated error, Confirmation must equal PUBLISH. No claim is made that the payload alone contains that input or message.

The local preflight transcript contains passed=28, failed=0 and explicitly says No external API or registry publication; deterministic API fixtures exercise preflight decisions. Its synthetic allowed SHA is aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, not a live publication authorization. Scenarios cover confirmation, SHA format/match, branch/main movement, malformed branch/status/CI data, pending notes/releases, registry refusal, private-package exclusion and CI selection including newer failed over older successful runs. The final allowed fixture uses real versioned manifests and real CLI empty status but still deterministic GitHub API responses.

The local real-version proof and release PR130's immutable c4fffa54050784d77dcac410ba3bd07116ed492e comparison agree on entity-react 3.0.1, storage-core 3.0.0, entity-storage 7.0.0, entity-queries 1.0.0, rpc-proxy-builder 8.1.0, entity 1.2.1, fetch 0.4.2, pg-client 4.0.0 and query-dsl 3.0.0. Each compared public manifest retains https://npm.pkg.github.com; the private example is still private=true/version 0.0.31. These nine version bumps are not asserted to be the complete registry missing-version inventory.

## Findings

No material findings survived the pre-report gate: 0 Bug, 0 Style, 0 Architecture, 0 Performance, 0 Docs, 0 Test gap.

I checked push-versus-manual publication triggers, CI dispatch on the actual release PR, permission separation, exact SHA/current-main/latest-push-CI guards, malformed/pending-plan refusal, private-package settings and the final preflight ordering against FR-001 through FR-006. I also compared contributor/public/agent instructions with the scripts and workflows, and inspected captured run/job/step and version payloads; no unjustified implementation gap was found within configuration-activation scope. Known publication-inventory and trusted-code limitations below are explicitly bounded requirements/non-goals, not manufactured defects or a hidden positive publication verdict.

## Acceptance trace and positive observations

- FR-001 / FR-005: .github/workflows/release.yml:19-22 grants version preparation contents/pull-requests/actions write without packages write. Its changesets action at lines 37-45 specifies version but no publish input. Publication exists only in the separate manually dispatched publish.yml; both workflows share a non-cancelling concurrency group.
- FR-002: release.yml:60-81 checks the returned PR repository/base/head branch before dispatching ci.yml on its actual ref. The real version step and real release-PR CI payload independently show dispatch and all six jobs succeeded; a bot-created PR was not treated as implicitly tested.
- FR-003: release-preflight.cjs:16-32 and 64-129 fail closed on malformed/pending status, missing or unsuccessful latest matching push CI, invalid confirmation, non-full SHA, dispatch mismatch, non-main ref and current-main movement. publish.yml:79-88 repeats the guard before its irreversible publication action, and live CHECK refusal skipped that action.
- FR-004: .changeset/config.json:5-15 keeps independent fixed/linked arrays empty and patch internal propagation while explicitly disabling private-package version/tag churn. The real-version and immutable PR-manifest proofs agree on public targets and the unchanged private example.
- FR-006: .changeset/README.md:23-35, CONTRIBUTING.md:30-53, README.md:96-112 and AGENTS.md:7-12 distinguish version preparation, explicit publication, GitHub Packages versus public npm, visibility, and partial-publish recovery. package.json:31-33 supplies matching status/version/dispatch commands; Storybook consumes the same pnpm pin rather than a conflicting major.

## Test coverage delta

- Before/after coverage percentages: unknown; no percentage coverage report was supplied or generated, and no 80% coverage claim is made.
- Behavioral evidence read: 28 existing guard scenarios, real local version/status proof, three real six-job CI runs, successful version dispatch/Pages, and a real negative publication run.
- Newly authored tests/branches: none; this task is read-only review plus canonical evidence recording.
- Still outside observed behavior: positive publication, actual registry writes/tags/releases, complete registry missing-version inventory, and isolation from malicious main/build code.
- The earlier scratch rebuild's ENOSPC failure remains a local failure; successful remote build/test/typecheck jobs are separate evidence, not a claim that the local rebuild passed. The scratch pack in EVID-101 was metadata-only and is not treated as a compiled distributable.

## Trusted-code and publication limits

1. The manually selected main commit and its install/build/test/action code are trusted. publish.yml grants packages:write at job scope; restricting the explicit real NODE_AUTH_TOKEN assignment to lines 90-96 does not make earlier repository code a hostile-code sandbox or remove the job token's ambient authority. The supplied live observation notes setup-node may expose an earlier placeholder. The property reviewed is explicit real-token environment scoping and workflow separation, not credential non-reachability by hostile trusted code.
2. No actual publication, GitHub release creation, package tag creation, public npm migration or new secret was performed or authorized by this review. The real CHECK run is negative proof only; it does not prove a successful publication path.
3. Empty Changesets arrays show that note/version preparation is complete, not that the registry contains every other version. The final command is unfiltered pnpm changeset publish, so publication approval cannot be inferred to cover only the nine newly bumped public targets. The complete authenticated GitHub Packages missing-version inventory is unobserved here. The assignment reports existing authenticated 403/missing read:packages and anonymous 401 observations; those registry requests were not retried and are not presented as personally re-observed in this review.
4. Configuration readiness and registry approval are separate gates. Before any real publication, the owner must have an authenticated, complete package@version inventory of what Changesets could publish and approve that concrete scope and exact tested current main SHA. Neither successful CI nor this supporting configuration EVID substitutes for that approval.
5. Hindsight continuity and percentage coverage are unavailable, as disclosed above. No source change is recommended solely to fill those observation gaps.

## Provenance

Exact shasum -a 256 results from this review:

~~~text
58cc93b9a809609340688facb826281eeeb774c90cf6ae4ceed69c2ba15a271b  .github/scripts/release-preflight.cjs
818b7c8af94358a4d38e8d2a52bd3fd269a44c7d66e2276fe77402c7f90b5f06  /tmp/changesets-preflight-proof-20261102.log
02ce560caedf87a01a13baa704ec89d07f0b2d7b690888320094524494563a50  /tmp/changesets-version-proof-20261102.json
732f21346d7780f9b842ba804f3d593344e7727582095cb93ae7a542dd4b175a  /tmp/changesets-live-actions-proof-20261102.json
d428a27dfb6ac7f47cb41c4636662f74e715fe01929e3e851000df7ce5528eb5  /tmp/changesets-live-release-pr-proof-20261102.json
be372a621c95b2f4d53d707ac63f9017f7d566a2eab079ffa12700aacb198f07  /tmp/changesets-real-refusal-proof-20261102.json
~~~

The guard/local-proof/version-proof hashes match EVID-101's recorded values. GitHub run URLs and exact SHAs above are durable primary-source locators; the local files are captured machine payloads. CL3 is justified by direct inspection of the actual target repository code and its real target-system job/step payloads. External API fixtures are explicitly segregated from actual workflow execution, and prior reported local tool exits are not upgraded into new executions.

## Next steps

The orchestrator/guardian may evaluate the configuration-activation gate using this canonical CONCERNS result and the separately owned ADI evidence. No coder dispatch is requested because there is no material source finding. A gate requiring an explicit PASS must not relabel this evidence; actual publication remains withheld pending the separate inventory and owner-approval prerequisites.

## References

- Parents: PRD-073 and RFC-029; this evidence informs both.
- Prior execution evidence: EVID-101 and EVID-102, read completely and intentionally unchanged.
- Reviewer-discipline reference: ADR-013 policy supplied with the reviewer assignment; no new architectural decision was authored.
- Merged implementation: PR136 at 262fc20a5d328ff937a47d011954a7a62ca6c40d; reviewed source commit 4d713da41c9333f5915e24fe6100809a6544c323.

