---
depth: standard
id: EVID-104
kind: evidence
last_modified_at: 2026-11-02T14:04:04.521093+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
status: active
title: 'ADI recording evidence for PRD-073/RFC-029: PASS (supports)'
---

---
assigned_number: 104
created: 2026-11-02
predicted_number: 104
slug: evid-adi-recording-evidence-for-prd-073-rfc-029-pass-supports
updated: 2026-11-02
---

## Verdict

**PASS** — assigned by the main orchestrator for recording the supplied ADI reasoning and its observation boundaries. The supplied evidence verdict is **supports**, with CL3 for actual target-code/workflow observations. No independent domain conclusion is added by the recorder.

This PASS is configuration reasoning only; it is not positive publication verification, registry-inventory knowledge, or owner authorization.

## Evidence type

🛠 Other

Subtype: recording orchestrator-authored ADI reasoning for the Standard+ configuration acceptance chain.

## Raw input provenance

- Source URI: `local://changesets-adi-20261102.md`.
- Resolved host path: `/Users/explosovebit/.omp/agent/sessions/-Work-GertsAi-shared/2026-10-31T09-20-57-208Z_01a19143-1d78-7109-be40-305b07296673/local/changesets-adi-20261102.md` (resolved by tool read, not an assumed URI mapping).
- Size: 4640 bytes / 30 lines, UTF-8.
- Fingerprint: `sha256:db51fc4232647530cef8aba886ba6afe7cbc3cfa51e5f55bfb7417a680077f6d`.
- Captured at: `2026-11-02T14:01:42.395435+00:00`.
- Reasoning author: main orchestrator. Recorder: `claude-code/omp/evidence-recorder-task-ChangesetsAdiRecord`.
- Fingerprint commands: `shasum -a 256 local://changesets-adi-20261102.md`; `wc -lc local://changesets-adi-20261102.md`; `file local://changesets-adi-20261102.md`.
- Supplemental verdict input: main orchestrator assigned PASS in the task conversation and expressly limited it to configuration reasoning.

## Raw input (truncated to ≤2000 chars)

```text
# Changesets ADI reasoning

Author: main orchestrator. Purpose: support PRD-073/RFC-029 design acceptance, not authorize publication. Verdict directive: supports, CL3 for observed target workflows and code; source-derived policy conclusions are identified below. No paid model/provider call or actual publication.

... [truncated, full content at local://changesets-adi-20261102.md sha256:db51fc4232647530cef8aba886ba6afe7cbc3cfa51e5f55bfb7417a680077f6d]
```

## Structured findings

- Preserved hypothesis count: **3**, with every `### Hypothesis` heading and its abduction, deduction, observation and conclusion retained verbatim below. Induction, supplied ground-truth references and authority boundary are also retained verbatim. The recorder's frozen-object checks are explicitly separated.
- Normative versus measured boundary: the rejection of automatic publication is a policy conclusion, not a publishing experiment. Target workflow/code observations retain their assigned CL3; unobserved publication and registry inventory are not promoted to measurements.
- Why no specialist agent fits this slice: the orchestrator already authored and judged the ADI reasoning; this slice records that input without performing a new architectural, code, test or security review.
- Recording-pattern recall and `mm-pipeline-methodology` reads were attempted but unavailable: Hindsight could not read `/version`; no bank request was sent. No memory-derived assertion is used.

### Supplied reasoning (verbatim)

Author: main orchestrator. Purpose: support PRD-073/RFC-029 design acceptance, not authorize publication. Verdict directive: supports, CL3 for observed target workflows and code; source-derived policy conclusions are identified below. No paid model/provider call or actual publication.

### Hypothesis 1 — Automatic publication after version PR merge satisfies explicit publication approval
Abduction: an approved version PR might be treated as publication intent.
Deduction: ordinary merge would be sufficient to reach a registry write, without a separate affirmative publish input.
Observation: repository policy requires separate explicit owner approval for publication. A version-preparation merge is not that approval. This is a normative incompatibility, not an experiment publishing packages.
Conclusion: reject this design under the current approval contract.

### Hypothesis 2 — Version-only automation plus exact-SHA guarded manual publication satisfies the contract without new credentials
Abduction: separate the harmless version preparation event from irreversible publication.
Deduction: main push cannot invoke publication; the existing token can dispatch CI on the bot PR; wrong affirmative input, stale/main-mismatched SHA, pending release notes, missing or failed latest push CI and wrong registry all refuse before a publishing action. Positive publication would additionally require separately approved PUBLISH at the exact tested current main SHA.
Observation: merged PR136 main262fc20a5d328ff937a47d011954a7a62ca6c40d; version-only run41455069834 succeeded. Main CI41455069733 and real bot-dispatched release PR CI41455130754 at c4fffa54050784d77dcac410ba3bd07116ed492e each passed all six jobs. Real manual CHECK run41455181852 failed with Confirmation must equal PUBLISH; publishing was skipped. EVID101 records28 direct-helper fixture scenarios including malformed/stale prerequisites and a real installed Changesets version rehearsal; EVID102 records live observations and their boundaries.
Conclusion: supports the configuration design. Actual registry publication has not been tested or authorized. Job credentials remain trusted-code credentials, not hostile-build isolation. The set of missing registry versions still must be checked/approved before a real publication; a version plan alone is not proof of registry state.

### Hypothesis 3 — A new long-lived PAT or GitHub App is necessary to obtain CI on generated version PRs
Abduction: GITHUB_TOKEN automation events may not produce ordinary PR CI, so a new credential might be necessary.
Deduction: if necessity holds, explicit workflow_dispatch with the existing token cannot produce successful CI on the generated PR head.
Observation: version-only run41455069834's dispatch step succeeded, and CI41455130754 is a real successful workflow_dispatch at the exact bot PR head. No new token/App/secret was installed.
Conclusion: reject the necessity claim. This does not claim PATs/Apps are unable to work or never useful for other workflows.

## Induction
Choose hypothesis2 for configuration under the existing registry, independent-versioning and explicit-approval constraints. Preserve GitHub Packages, keep fixed/linked arrays empty, explicitly disable private version/tag churn, and retain workspace dependency propagation. The nine planned version bumps were validated against real generated manifests/changelogs and successful CI; this is distinct from the registry's complete unpublished-version set.

## Ground-truth verification
Immutable primary sources: https://github.com/gertsai/shared/pull/136 ; https://github.com/gertsai/shared/actions/runs/41455069733 ; https://github.com/gertsai/shared/actions/runs/41455069834 ; https://github.com/gertsai/shared/actions/runs/41455130754 ; https://github.com/gertsai/shared/actions/runs/41455181852 . Local captured machine payloads: /tmp/changesets-live-actions-proof-20261102.json ; /tmp/changesets-live-release-pr-proof-20261102.json ; /tmp/changesets-real-refusal-proof-20261102.json . Guard SHA25658cc93b9a809609340688facb826281eeeb774c90cf6ae4ceed69c2ba15a271b. Existing EVID101/102 explicitly preserve fixture boundaries and the local ENOSPC limitation, closed for compiled verification by real CI.

### Recorder frozen-object checks

These read-only provenance checks establish the presence of the claimed configuration delta, not publication success. No test, build, lint, formatter, installation, workflow dispatch or publication was run by the recorder.

- Base..head: `4bf577bfcd8891f7f5d2fa948b855f660761e390..262fc20a5d328ff937a47d011954a7a62ca6c40d`. Base is the first parent of the supplied merged PR136 commit, resolved from the local Git object store. The supplied source commit is `4d713da41c9333f5915e24fe6100809a6544c323`.
- Resolved repository root: `/private/tmp/shared-changesets-20261102`; tool workspace remains `/tmp/shared-changesets-20261102`.
- Expected delta tokens from the submitted hypotheses and parent contract: `Confirmation must equal PUBLISH`, `createWorkflowDispatch`, `privatePackages`.
- Ground-truth gate: **DELTA=PRESENT**, all three expected tokens **FOUND**, PASS-eligible for the assigned recording verdict.
- The complete frozen source diff was read with `git -C /tmp/shared-changesets-20261102 diff --no-ext-diff 4bf577bfcd8891f7f5d2fa948b855f660761e390..262fc20a5d328ff937a47d011954a7a62ca6c40d -- .changeset/config.json .github/scripts/release-preflight.cjs .github/workflows/release.yml .github/workflows/publish.yml` (exit 0). This recorder does not replace the separate code-review EVID.

Exact diff probe (executed with `bash --noprofile --norc -c`):

```bash
set +u
R="/tmp/shared-changesets-20261102"
git -C "$R" diff --stat 4bf577bfcd8891f7f5d2fa948b855f660761e390..262fc20a5d328ff937a47d011954a7a62ca6c40d
git -C "$R" diff --cached --stat
if git -C "$R" diff --quiet 4bf577bfcd8891f7f5d2fa948b855f660761e390..262fc20a5d328ff937a47d011954a7a62ca6c40d && git -C "$R" diff --cached --quiet; then
  echo "DELTA=EMPTY"
else
  echo "DELTA=PRESENT"
fi
```

Literal stdout (exit 0; stderr empty):

```text
 .changeset/README.md                               |  41 +++++++
 .changeset/config.json                             |   7 +-
 ...tion-guard-scenarios-and-independent-reviews.md |  76 ++++++++++++
 ...ing-and-explicit-github-packages-publication.md |  60 ++++++++++
 ...-automation-from-verified-manual-publication.md |  62 ++++++++++
 .github/scripts/release-preflight.cjs              | 132 +++++++++++++++++++++
 .github/workflows/ci.yml                           |  56 +++++++--
 .github/workflows/publish.yml                      |  96 +++++++++++++++
 .github/workflows/release.yml                      |  83 +++++++------
 .github/workflows/storybook.yml                    |   2 -
 AGENTS.md                                          |  12 ++
 CONTRIBUTING.md                                    |  47 ++++++--
 README.md                                          |  42 +++----
 package.json                                       |   5 +-
 14 files changed, 645 insertions(+), 76 deletions(-)
DELTA=PRESENT
```

Exact token probe (executed with `bash --noprofile --norc -c`):

```bash
set +u
git -C /tmp/shared-changesets-20261102 grep -n -E 'Confirmation must equal PUBLISH|createWorkflowDispatch|privatePackages' 262fc20a5d328ff937a47d011954a7a62ca6c40d -- .github/scripts/release-preflight.cjs .github/workflows/release.yml .changeset/config.json
```

Literal stdout (exit 0; stderr empty):

```text
262fc20a5d328ff937a47d011954a7a62ca6c40d:.changeset/config.json:11:  "privatePackages": {
262fc20a5d328ff937a47d011954a7a62ca6c40d:.github/scripts/release-preflight.cjs:108:    throw new Error('Confirmation must equal PUBLISH.');
262fc20a5d328ff937a47d011954a7a62ca6c40d:.github/workflows/release.yml:77:            await github.rest.actions.createWorkflowDispatch({
```

## Authority boundary
Configuration acceptance is not registry publication approval. No actual publish operation, package-access modification or token-scope grant is requested by this reasoning. Local GitHub token inventory lookup returned HTTP403 missing read:packages; anonymous lookup returned HTTP401. Registry inventory remains unobserved here, not empty.

## Recommended next steps

- Guardian/orchestrator may consider this draft alongside the separate canonical code-review EVID for PRD-073/RFC-029. Only that authorized actor may activate artifacts; the recorder does not activate.
- Any actual publication still requires separate owner authorization for the exact tested current main SHA and checking/approving the registry's missing-version set. This artifact grants neither authorization nor registry knowledge.

## References

- Parents: PRD-073; RFC-029 (both `informs`).
- Related evidence: EVID-101 (bounded local helper/CLI observations); EVID-102 (live workflow observations and boundaries).
- Primary raw source: `local://changesets-adi-20261102.md`.

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: audit

CL3 applies to the supplied observations of actual target code and workflows. Normative design-policy reasoning is explicitly identified above; actual publication and complete registry inventory are unobserved. The audit type classifies this methodology evidence record, not an independent domain audit.




