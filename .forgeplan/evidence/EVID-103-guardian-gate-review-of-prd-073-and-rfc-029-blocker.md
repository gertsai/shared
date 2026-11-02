---
depth: standard
id: EVID-103
kind: evidence
last_modified_at: 2026-11-02T14:02:32.908835+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
- target: EVID-110
  relation: supersedes
status: superseded
title: 'Guardian gate review of PRD-073 and RFC-029: BLOCKER'
---

---
assigned_number: 103
created: 2026-11-02
predicted_number: 103
slug: evid-guardian-gate-review-of-prd-073-and-rfc-029-blocker
updated: 2026-11-02
---

## Verdict

**PRD-073: BLOCKER. RFC-029: BLOCKER.**

The implementation acceptance evidence is supported, including real compiled CI and expected publication refusal. Immediate activation is blocked by missing canonical independent review and ADI records in the inspected chain, not by the pair's draft statuses or the local ENOSPC failure.

## Structured Fields
verdict: refutes
review_verdict: BLOCKER
congruence_level: 3
evidence_type: audit

This verdict refutes **activation readiness at this review snapshot**, not the successful functional observations in EVID-101/EVID-102.

## Artifact under review

- Workspace: /tmp/shared-changesets-20261102, resolved by MCP to /private/tmp/shared-changesets-20261102.
- Reviewer identity: claude-code/omp/guardian-task-ChangesetsActivationGate. Actual harness/model: OMP / openai-codex/gpt-6-astra; the claude-code prefix is compatibility naming, not a claim to a Claude runtime version.
- PRD-073, draft, Standard: Safe Changesets versioning and explicit GitHub Packages publication; child RFC-029.
- RFC-029, draft, Standard: Separate Changesets version PR automation from verified manual publication; based_on PRD-073.
- Joint review: after a clean replacement gate, parent-first activation is the correct sequence. RFC's currently draft parent is not itself a finding.
- Snapshot: the full inbound informs chain for each target contained only EVID-101 and EVID-102. Both full target bodies and both evidence bodies were read through the workspace-scoped CLI; projection bodies were also inspected.

## EVIDENCE chain inspected

| EVID | Recorded verdict | Source | Result and limits |
|---|---|---|---|
| EVID-101 | supports; no canonical review_verdict | Main orchestrator, measurement | 28/28 guard scenarios; actual isolated Changesets version/status and metadata rehearsal. Reports ReleaseSecurity and ReleaseSemverReview PASS, but embeds no reviewer-owned Findings/Ground-truth verification record. Local compiled rebuild failed due to ENOSPC; live CI was explicitly pending. |
| EVID-102 | supports; no canonical review_verdict | Main orchestrator, measurement | Real setup/main/generated-release CI and Storybook pass. Completes EVID-101's remote-execution/build gap. CHECK dispatch refuses and skips publication; not successful publication. |

No prior linked BLOCKER was hidden or ignored. EVID-102 supplements EVID-101; neither supersedes an audit rejection. EVID-098 and EVID-099 were also read in full because PRD-073 cites them. They concern unchanged package behavior and inform PRD-071/PRD-072/RFC-028, not this pair; EVID-099's prior independent PASS does not audit the Changesets configuration.

## Ground-truth verification

DELTA=NONEMPTY.

Command, cwd=/tmp/shared-changesets-20261102, exit 0:

`git diff --stat 4bf577bfcd8891f7f5d2fa948b855f660761e390..262fc20a5d328ff937a47d011954a7a62ca6c40d`

Observed: 14 files changed, 645 insertions(+), 76 deletions(-). Scope includes Changesets config/docs, CI/release/publish/Storybook workflows, release-preflight helper, root scripts, AGENTS.md, and three Forgeplan projections. This establishes a real configuration delta; it does not replace an upstream code/security review. EVID-101's earlier result_sha is 4d713da41c9333f5915e24fe6100809a6544c323; final merged setup and remote execution are pinned by EVID-102 to 262fc20a5d328ff937a47d011954a7a62ca6c40d.

### Independently checked live proof

The immutable JSON payloads were read, and all six run identities/events/head SHAs/conclusions were cross-checked against the current GitHub REST API. No workflow was dispatched or rerun.

| Run | Head / event | Observed |
|---|---|---|
| [41454452257](https://github.com/gertsai/shared/actions/runs/41454452257) | 248f84c5e402b9d3bf7700a6aa74c44ac9e9f091 / pull_request | Setup CI success; all six jobs successful. |
| [41455069733](https://github.com/gertsai/shared/actions/runs/41455069733) | 262fc20a5d328ff937a47d011954a7a62ca6c40d / push | Main CI success; all six jobs successful. |
| [41455130754](https://github.com/gertsai/shared/actions/runs/41455130754) | c4fffa54050784d77dcac410ba3bd07116ed492e / workflow_dispatch | Actual generated PR130 CI success; all six jobs successful. API also identifies PR130 and changeset-release/main. |
| [41455069834](https://github.com/gertsai/shared/actions/runs/41455069834) | same main SHA / push | Version job and generated-PR CI dispatch step successful. |
| [41455069668](https://github.com/gertsai/shared/actions/runs/41455069668) | same main SHA / push | Storybook build/deploy successful. |
| [41455181852](https://github.com/gertsai/shared/actions/runs/41455181852) | same main SHA / workflow_dispatch | Deliberate CHECK refusal: overall failure; publication preflight fails; publish step skipped. |

The three CI runs each include successful Build / Test / Typecheck, Changesets status, ESLint, Are The Types Wrong, Publint and Dependency Cruiser jobs. The payloads separately show successful pnpm build, test and typecheck steps. **This closes the local compiled-build gap; it does not make the failed local scratch rebuild a pass.**

For the negative run, the live [check annotation](https://api.github.com/repos/gertsai/shared/check-runs/125309959605/annotations) says exactly: “Unhandled error: Error: Confirmation must equal PUBLISH.” The live [job steps](https://api.github.com/repos/gertsai/shared/actions/jobs/125309959605) confirm successful baseline/status generation, failed preflight, and skipped build/test/checks/recheck/publication. This is evidence of expected refusal, not publication success. The dispatched CHECK value is recorded by EVID-102; no registry publication was attempted by this review or authorized by this gate.

/tmp/changesets-live-release-pr-proof-20261102.json pins PR130 at c4fffa54050784d77dcac410ba3bd07116ed492e. Its nine public versions agree with EVID-101: entity-react 3.0.1, storage-core 3.0.0, entity-storage 7.0.0, entity-queries 1.0.0, rpc-proxy-builder 8.1.0, entity 1.2.1, fetch 0.4.2, pg-client 4.0.0 and query-dsl 3.0.0; all registry values are https://npm.pkg.github.com. Private m9s-example remains private=true/version=0.0.31. Detailed version-PR content approval belongs to the separately assigned release reviewer.

## Findings

### B1 — Canonical independent audit chain missing (BLOCKER, both targets)
EVID-101's Result names two genuine upstream PASS reports, but EVID-101 and EVID-102 identify their recorder as the main orchestrator and neither contains a canonical Profile B review_verdict/Findings/Ground-truth verification record. The target get/score results show no other informing review EVID. The Standard+ requirement for an upstream Profile B PASS is therefore not satisfied. Treating the summary as the review itself would also fail the required Ground-truth verification section for its claimed code/configuration change. Guardian's own diff inspection above does not retroactively fix that provenance gap.

Required action: obtain and link canonical independent review EVID(s), including a nonempty frozen base..head verification, findings/dispositions, security scope and RFC-to-PRD acceptance fit. Preserve EVID-101/102 as measurement evidence; do not turn the main's summary into an invented independent audit.

### B2 — Linked three-hypothesis ADI evidence missing (BLOCKER, both targets)
The complete two-EVID informs chain has no ADI/hypotheses record and zero Hypothesis sections. RFC-029 Options Considered lists three options, but is not the required informing ADI EVID. The guardian Standard+ ADI rule applies independently of /gate-check's omitted post-build Standard thresholds. Standard remains explicitly selected; no escalation is made here.

Required action: an authorized artifact author records the actual reasoning and at least three evaluated hypotheses in canonical informing EVID; do not manufacture a claim that paid forgeplan_reason ran.

### C1 — Required recall unavailable (CONCERNS, both targets)
Both memory_recall and mental_model_get(mm-gate-failures), explicitly bank=gerts_shared, returned: “Hindsight compatibility check failed: /version could not be read; fpl-hsmem 3.7.0 requires API >=0.10.2 and <0.11.0. No bank request was sent.” Bank selection resolved successfully. This establishes a client/server compatibility preflight failure only. Bank contents, bank health and existence of mm-gate-failures are unknown; no empty/unhealthy-bank inference is made. No settings or bank data were changed.

### C2 — Coverage floor unproven (CONCERNS, both targets)
EVID-101/102 give scenario counts and successful CI, not an instrumented coverage percentage. Twenty-eight passing scenarios are not 100% code coverage. The conservative 80% floor cannot be marked passed, and no below-70% result is invented. A reviewer must supply measured coverage or explicitly resolve applicability for this configuration-only scope under the project's declared gate policy.

### C3 — Named local ship-gate wrappers absent (CONCERNS, both targets)
package.json:18-34 has no check:ready-to-ship; the complete root listing contains no Makefile, so make ci-check/make gate are not present. These wrappers were skipped (not present), not passed. Real six-job CI is independently supported above and is not rerun. This is a gate-methodology limitation, not evidence of broken compilation or failed tests.

## Gate criteria

| Criterion | PRD-073 | RFC-029 | Evidence |
|---|---|---|---|
| Required artifact sections / MUST validation | PASS | PASS | Both validate calls: exit 0, errors 0, warnings 0. PRD has actor/problem, Non-Goals and NFR sections. |
| Entire linked EVID chain inspected | PASS | PASS | EVID-101/102 full bodies and links; referenced EVID-098/099 contextual only. |
| Upstream independent PASS with ground truth | BLOCKER | BLOCKER | B1. |
| Standard+ linked ADI with at least 3 hypotheses | BLOCKER | BLOCKER | B2. |
| Hidden prior linked BLOCKER | None | None | Neither input EVID carries a review BLOCKER; they carry supports measurements. |
| Acceptance evidence / scope boundaries | PASS | PASS | Live CI closes ENOSPC; expected refusal is not publication success. |
| Parent activation ordering | PASS | PASS, conditional sequence | PRD first, then RFC only after a clean replacement gate; draft status alone is not a defect. |
| Recall / coverage / local wrappers | CONCERNS | CONCERNS | C1-C3. |
| Blast radius within declared scope | PASS | PASS | Release configuration across public packages, not package APIs or registry migration. |

### Project-config gates

**Config source: not found — defaults applied.** The explicit read of /tmp/shared-changesets-20261102/.forgeplan/project-config.yaml returned not found. All seven keys below therefore use conservative defaults.

| Criterion | Threshold | Observed | Result |
|---|---|---|---|
| Test coverage | min_test_coverage=80 | No percentage in EVID-101/102 | CONCERNS, unproven |
| Critical findings | max_findings_critical=0 | 0 reported unresolved code/security Critical findings | PASS, bounded to reported chain |
| High findings | max_findings_high=3 | 0 reported unresolved code/security High findings | PASS, bounded to reported chain |
| Medium findings | max_findings_medium=10; CONCERNS above 20 | 0 reported unresolved code/security Medium findings | PASS, bounded to reported chain |
| Validate pass | require_validate_pass=true | Both targets pass, 0 errors/warnings | PASS |
| Audit pass | require_audit_pass=true | No qualifying upstream Profile B EVID PASS | BLOCKER under the stronger Standard+ audit rule (B1) |
| Evidence chain | require_evidence_chain=[prd,rfc,adr,spec] | 2 informs-linked measurements for each target | PASS |

**Gates summary: 5/7 for each artifact.** Methodology blockers B1/B2 and concerns C1-C3 remain independent of reported code-finding severity counts. This evidence is not counted as its own upstream audit.

## Methodology

All Forgeplan CLI commands used cwd=/tmp/shared-changesets-20261102. All Forgeplan MCP calls explicitly name that workspace. Only this new EVID is authored; existing artifacts/source, original developer worktree, git history and publication are not modified.

- forgeplan get PRD-073/RFC-029/EVID-101/EVID-102/EVID-098/EVID-099 --json: current bodies and relationships read, exit 0.
- forgeplan validate PRD-073 --json and forgeplan validate RFC-029 --json: exit 0, each 0 errors/0 warnings.
- forgeplan score PRD-073 --json and forgeplan score RFC-029 --json: exit 0, each pre-gate R_eff=1.0, weakest_link=null, 2 nonexpired active supporting EVIDs. RFC score notes draft PRD skipped; joint parent-first ordering addresses that sequence, not an override.
- forgeplan calibrate PRD-073 / RFC-029: exit 0. Current Standard for both; current suggestion Deep due solely to section_count (10 and 11 respectively). Both suggestions are reported, neither applied. Initial unsupported --json attempts exited 2; corrected plain calls succeeded.
- .forgeplan/quality-gates.yaml is absent from the complete .forgeplan listing. Shipped fpl-skills 1.75.1 template was read: post_build.standard does not exist. No post-build Standard thresholds were invented. This does not replace guardian's activation rules.
- forgeplan health --json: exit 0, workspace unhealthy on unrelated historical records; no target/EVID-101/EVID-102 findings. forgeplan gaps and blindspots completed: 46 workspace MUST / 102 SHOULD / 7 COULD, none naming this pair; no blind spots. Those workspace totals do not block this pair.
- Workspace-scoped contradictions check reports none and explicitly limits v1 to duplicate-title detection; no semantic-contradiction clearance is claimed. No brownfield-linked artifacts, so orphan and decay scans over unrelated history were not performed.
- No local build, test, lint, formatter, dependency install, source scan, git write, workflow dispatch, activation, tag, merge or publish command ran. The git diff above is the sole frozen-delta inspection.
- Project ship wrappers: skipped (not present), C3. Hindsight recall/model: attempted, unavailable before any bank request, C1.

## Revisit Trigger check

Neither target has an active ADR linked via informs/based_on/refines or named as a governing ADR in its body. No linked ADR decision foundation, fired trigger or aging F+G+R source exists to assess in this bounded chain. Result: not applicable, not a claim that unrelated repository ADRs are fresh. No supersedes or Gate override NOTE links; REFRESH/delta-spec checks do not apply. No qualifying DDD decomposition, three-module architecture or STRIDE keyword trigger was identified in the two artifact bodies; no extra architecture artifact is fabricated as a requirement.

## Blast radius

- Affected scope: repository-wide release preparation, generated version PR CI and the manually gated GitHub Packages publication path for public packages; current candidate has nine public version changes. No package business API change or registry migration is authorized by these configuration artifacts.
- Activation changes decision status, not production deployment or publication. The setup is already merged at the pinned main SHA; a refusal here does not roll that merge back.
- Reversibility: before any separate owner-approved publication, configuration can be reverted through a reviewed PR. After publication, Git revert cannot remove distributed versions; a separately approved new version/deprecation is required. No time-bound rollback SLA is stated or inferred.
- Downstream: RFC-029 depends on PRD-073; PR130 is an external release candidate, not a newly discovered Forgeplan child. No other downstream artifact appeared in current target relationships.
- Detection: existing CI/preflight exposes execution failures on subsequent runs; missing audit provenance requires another gate review. No production alarm/detection-time guarantee is evidenced.
- Threshold check: actual configuration scope matches the artifacts' stated release-only boundary. Positive publication and its irreversible effects remain explicitly outside this gate.

## Orchestrator instructions

**BLOCKER → halt activation; do NOT activate PRD-073 or RFC-029.** Obtain canonical independent Profile B audit EVID with a nonempty frozen Ground-truth verification and findings/dispositions (B1), and canonical linked three-hypothesis ADI EVID from an artifact author (B2). Record resolution of C1-C3 rather than silently treating unavailable checks as passes. After remediation, re-run guardian on the full updated chain and create explicit superseding gate evidence addressing this EVID. Keep this historical snapshot intact. Only a later clean gate may recommend PRD-first/RFC-second activation.

No publication authorization is given. Actual publication still requires explicit owner Y for the exact release operation and its then-current tested main commit; CHECK is not PUBLISH and no successful publication is claimed.

## References

- Targets: PRD-073; RFC-029.
- Full informing chain at snapshot: EVID-101; EVID-102. Context only: EVID-098; EVID-099.
- /tmp/changesets-live-actions-proof-20261102.json; /tmp/changesets-live-release-pr-proof-20261102.json; /tmp/changesets-real-refusal-proof-20261102.json.
- Primary GitHub run/job/annotation URLs above.
- Mental model requested: mm-gate-failures, unavailable; not consulted successfully.
- No prior guardian EVID for this pair appeared in the inspected graph.



