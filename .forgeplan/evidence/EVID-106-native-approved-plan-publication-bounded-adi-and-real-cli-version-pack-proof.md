---
depth: standard
id: EVID-106
kind: evidence
last_modified_at: 2026-11-02T16:28:46.198702+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: RFC-029
  relation: informs
- target: PRD-073
  relation: informs
status: active
title: 'Native approved-plan publication: bounded ADI and real CLI version-pack proof'
---

---
assigned_number: 106
created: 2026-11-02
predicted_number: 106
slug: evid-native-approved-plan-publication-bounded-adi-and-real-cli-version-pack
updated: 2026-11-02
---

# Native publication scope proof

## Structured Fields
verdict: supports
congruence_level: 3
evidence_type: integration_test

## Verdict
PASS for bounded local native version/pack behavior and ADI support, not registry inventory or publication. Recorder: omp-coding-agent. Source604b88b870e32da949d41d80370106d6faee4707; generated disposable version fixture3c9cdaead95a0a50de02e93d83e93f160d92d726.

## Ground-truth verification
Actual CLI3.0.3 versioning preserved all nine reviewed target versions. Actual five-package dependency build produced ESM, CJS and declarations. Actual pnpm changeset pack --from-publish-plan selected only entity-queries1.0.0; production describePlan validated real workspace enumeration and packed name/version/registry. Approval digest4729aaf7ea2921b164bcc44ced307956c28a26cf7412f363b0599fdc52eff0bb was identical before/after pack. Tar inspection asserted LICENSE, CHANGELOG.md, dist/index.js, index.cjs, index.d.ts and index.d.cts; exactly one archive. New versioned candidate main baseline returned zero pending changesets and releases with unfiltered actual changeset status. Native pnpm source explicitly passes --no-git-checks when publishing, so detached checkout is supported.

The initial smoke packed unversioned0.1.0 and correctly failed its CHANGELOG requirement; we kept the assertion and exercised the real versioned1.0.0 candidate instead. The synthetic selected plan is not registry availability evidence; no native registry preview or registry writes occurred in this local smoke. Local API credentials cannot enumerate org packages (403); absence of access is not absence of packages.

## ADI Reasoning
### Hypothesis 1 — implicit discovery exceeds a version-PR list
Abduction: unqualified publish can include every missing public workspace version. Deduction: approving only the nine bumped versions cannot constrain discovery. Induction: official CLI docs and native publish implementation confirm discovery unless from-pack-dir is supplied. Chosen saved-pack path avoids new discovery at irreversible publication time.

### Hypothesis 2 — native saved plan preserves explicit scope
Abduction: a canonical digest over package/version/access/tag/registry plus packed identity checks can bind owner approval to publication scope. Deduction: package additions/removals or changed intent must reject; native packing should preserve selected identities without adding other workspaces. Induction: 28 behavioral helper cases passed in parent runs; actual single-package native pack and real archive metadata yielded the identical digest and no extra archive. Independent tester verification remains separate. Approval is intent-level, not byte attestation or isolation of hostile build scripts.

### Hypothesis 3 — native toolchain cutover retains reviewed version intent
Abduction: CLI3 native plans remove the need for a custom registry client but its version behavior must be checked against the reviewed release. Deduction: actual version rehearsal must preserve nine exact public targets and private0.0.31; version/publish subactions must remain separate. Induction: real CLI3 rehearsal initially exposed two lower targets; explicit peer-contract major note restored entity-queries1.0.0 and query-dsl3.0.0, and all nine now match. Actual versioning plus empty post-version status passed. New live action dispatch/registry preview remain pending; old EVID102 is not substituted for them.

## Provenance
/tmp/changesets-native-v3-version-plan-proof-20261102.json
/tmp/changesets-native-pack-proof-20261102.json
/tmp/changesets-v3-post-version-status-20261102.json
https://changesets.dev/guide/cli
https://github.com/changesets/action/releases/tag/v2.1.2

## Limits
No positive publication, registry inventory, production token-access claim or claim that local tests authorize release. Owner must approve the exact actual candidate set, SHA and digest after version PR merge and successful main CI.

## Raw provenance hashes
```json
[
  {
    "path": "/tmp/changesets-native-v3-version-plan-proof-20261102.json",
    "bytes": 2127,
    "sha256": "bcf19bc194340f505e8e532198a0657516e151542df84531d87ece7c93c20e6b"
  },
  {
    "path": "/tmp/changesets-native-pack-proof-20261102.json",
    "bytes": 747,
    "sha256": "34edd831c843d87936833946d2ea0891e002bf9e4bb1eeca9a3fe915a4750064"
  },
  {
    "path": "/tmp/changesets-v3-post-version-status-20261102.json",
    "bytes": 40,
    "sha256": "4ec7c626b19296521c4582c178975c4327a5ab42a27d2883138e9f3a605c2441"
  }
]
```

Status-baseline detail: /tmp/shared-changesets-v3-smoke-20261102 retains pre-version main604b88b and therefore status there correctly rejects changed packages without notes. The separate /tmp/shared-changesets-v3-candidate-20261102 has both HEAD and localmain at versioned3c9cdae, reproducing the merged-main baseline created by publication workflow. Only that post-version candidate is claimed as empty-status proof.

