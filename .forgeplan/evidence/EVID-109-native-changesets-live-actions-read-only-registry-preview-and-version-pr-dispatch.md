---
depth: standard
id: EVID-109
kind: evidence
last_modified_at: 2026-11-02T16:35:19.452345+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: RFC-029
  relation: informs
- target: PRD-073
  relation: informs
status: active
title: 'Native Changesets live Actions: read-only registry preview and version PR dispatch'
---

---
assigned_number: 109
created: 2026-11-02
predicted_number: 109
slug: evid-native-changesets-live-actions-read-only-registry-preview-and-version-pr
updated: 2026-11-02
---

# Native Changesets live Actions proof

## Structured Fields
verdict: supports
congruence_level: 3
evidence_type: integration_test

## Verdict
PASS for configuration runtime, not actual publication or publication approval. Recorder omp-coding-agent. Source604b88b merged by PR137 as a69f36f7cc2104f04ecc737f0b939cad72089c35.

## Ground-truth verification
- PR137 CI41477545977: source604b88b, pull_request, success6/6.
- Main CI41479311558: push at a69f36f, success6/6 including build/test/types, changeset guard cases, ESLint, ATTW, Publint and Dependency Cruiser.
- Version-only Release41479311866: push at same main SHA, success. Actual native action2 created/updated PR130 and the explicit CI-dispatch step succeeded. PR130 new head0a287b970ced405e0145e49f31e16562b66af4aa.
- Release-head CI41479387844: workflow_dispatch at exact0a287b9 head, completed success6/6. Automatic pull_request run41479387925 was action_required; it was not counted as success or silently skipped. Early gh pr checks returned no checks while direct dispatched run existed; actual dispatched execution, not absent rollup, supplies proof.
- PREVIEW41479411271 at exactmaina69f36f: success, package-read job generated native schema1 plan and uploaded changesets-preview-a69f36f7cc2104f04ecc737f0b939cad72089c35. Publishing job skipped. Downloaded actual artifact selected only entity-queries0.1.0/public/latest at this pre-version-merge source. This is NOT the final versioned publication list. Approval digest4a5a997e43152a5d1e1df08f57e615f35df6e3f4ea4861841e6b09a30a076ff5.
- Deliberate negative41480096058 at sameSHA: confirmationPUBLISH with guaranteed-malformed expected_plan_sha256 INVALID-GUARD-TEST. Preview succeeded; first write-capable-job guard failed before checkout with: Approved publication plan is missing or changed; review PREVIEW and approve its exact plan SHA-256. All checkout/build/pack/publication steps skipped. This expected failure is refusal proof, not successful publishing.

## Release content
Actual PR130 diff contains exactly24 files: six consumed changesets, nine manifests and nine changelogs; no source/lock/workflow/private changes. Reviewed targets: entity-react3.0.1, storage-core3.0.0, entity-storage7.0.0, entity-queries1.0.0, rpc-proxy-builder8.1.0, entity1.2.1, fetch0.4.2, pg-client4.0.0, query-dsl3.0.0. All names have @gertsai/ prefix. Major changelogs retain breaking merge-default and peer-contract migration notes.

## Limits
No registry writes, published tags or positive publication occurred. The final candidate set/digest must be obtained again from the exact versioned main after version PR merge and its successful main CI. A package may be absent or hidden by registry authorization; preview does not grant authorization to publish. Current actual Actions token can query this plan, unlike local org inventory API credentials.

## Provenance
https://github.com/gertsai/shared/pull/137
https://github.com/gertsai/shared/pull/130
https://github.com/gertsai/shared/actions/runs/41479311558
https://github.com/gertsai/shared/actions/runs/41479311866
https://github.com/gertsai/shared/actions/runs/41479387844
https://github.com/gertsai/shared/actions/runs/41479411271
https://github.com/gertsai/shared/actions/runs/41480096058

## Version PR completion
The owner-authorized workflow approval endpoint accepted approval of pull_request run41479387925. That actual PR run then completed successfully6/6, rather than counting its prior action_required state. PR130 merged at ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2 with exact head0a287b970ced405e0145e49f31e16562b66af4aa. This merge only changes version/changelog intent; it does not authorize or invoke publication. A new read-only preview was dispatched against that versioned main.

## Actual versioned-main rehearsal
At versioned main ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2, actual push CI41481803555 completed6/6 successfully. Release41481803545 succeeded: pending-intent detection completed and both version-PR creation and CI dispatch steps were skipped because notes were consumed. No publication step exists on this automatic path. Read-only PREVIEW41481831977 succeeded and its downloaded native artifact contains exactly the nine versioned targets listed above, in dependency-ordered batches4/3/2. Production helper recomputation against the real versioned candidate emitted9 releases and intent digest581105805248fe0519104a0012bb201dbb0b62f297e4b2c58a87622743ca24bf, exit0. This does not authorize publication; any subsequent main metadata merge requires an exact new-SHA preview before approval.

