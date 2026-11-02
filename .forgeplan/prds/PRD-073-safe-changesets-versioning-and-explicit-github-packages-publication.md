---
depth: standard
id: PRD-073
kind: prd
last_modified_at: 2026-11-02T17:37:04.889151+00:00
last_modified_by: omp-coding-agent/1.0.0
status: active
title: Safe Changesets versioning and explicit GitHub Packages publication
---

---
assigned_number: 73
created: 2026-11-02
domain: general / healthcare / fintech / govtech / edtech
epic: null
predicted_number: 73
priority: P0 / P1 / P2 / P3
projectType: web_app / api_backend / mobile_app / cli_tool / library
slug: prd-safe-changesets-versioning-and-explicit-github-packages-publication
stepsCompleted: []
updated: 2026-11-02
---

# Safe Changesets release management

## Problem
Initial PR136 separated automatic version preparation from manual publication. Further inspection showed that approving version bumps alone does not constrain Changesets publication: unqualified publish discovers all public workspace versions absent from the registry. Maintainers need an exact tested source commit and an explicitly approved actual publication set. Read-only inventory and irreversible publishing must remain separate operations.

## Target Users
Maintainers and package authors.

## Goals
Prepare independent versions/changelogs automatically, run actual release-head CI, and publish only owner-approved package/version/access/tag/registry intent at the exact tested current main commit. Preserve GitHub Packages and existing repository credentials.

## Functional Requirements
- FR-001: Main pushes may update version PRs, never publish.
- FR-002: Generated release PRs receive actual CI on their current head.
- FR-003: Publication requires explicit PUBLISH, exact current main SHA, latest successful main push CI and no pending changesets/releases; reject malformed prerequisites before registry writes.
- FR-004: Preserve independently versioned public packages and reviewed breaking peer-contract majors; private examples receive no version/tag churn.
- FR-005: Keep GitHub Packages and repository token; version preparation has no package-write permission, preview has read-only package permission.
- FR-006: Concise AGENTS.md and contributor docs explain authoring, version review, preview, approval, publication and partial recovery without promising public npm.
- FR-007: Read-only preview exposes actual unpublished candidates. Bind publication to the exact owner-approved package/version/access/tag/registry digest; fresh changed intent requires renewed approval. Only approved packed contents may be published.

## Non-Goals
No public npm migration, PAT installation, shared version groups, package business API changes or actual publication during configuration. The narrowly required Changesets CLI/action toolchain upgrade enables native plan/pack APIs; unrelated dependency upgrades remain out of scope.

## Non-Functional Requirements
Publication is serialized, never cancelled mid-run. No new long-lived credentials. Preview uses a read-only job token; the separately approved write-capable job uses its token for native plan refresh and final publishing. Selected main/build code is trusted; this is not a sandbox for hostile repository scripts or byte-level artifact attestation. Unsupported native plan schemas and ambiguous/malformed data fail closed. Registry authorization failure is not evidence of an empty registry.

## Acceptance Criteria
- [x] FR-004: Real native version rehearsal preserves nine reviewed public targets, their changelogs and all three private example versions, including0.0.31.
- [x] FR-001, FR-003, FR-005, FR-007: Workflows validate; 28 independently executed helper cases verify candidate/approval/packed scope boundaries; real native pack and exact merged-main status baseline pass.
- [x] FR-006: Short AGENTS.md rules and release docs match native preview/approve/pack workflow.
- [x] Native configuration PR137 source604b88b passes all six CI jobs and merges without publication.
- [x] FR-002: Observe native action2 version-only workflow regenerate release PR and dispatch actual CI on its head.
- [x] FR-007: Observe real read-only native PREVIEW using Actions package-read credentials; record actual success or concrete access failure without publishing.

## Reasoning
Prefer native saved-plan packing over unqualified discovery or a custom registry client. Keep automatic preparation separate from irreversible owner-approved writes. Use existing GITHUB_TOKEN CI dispatch instead of introducing a PAT/App. Partial publication changes the remaining set and requires a fresh preview and approval.

## Related Artifacts
RFC-029 implements the contract. EVID106 contains bounded native ADI/real CLI proof, EVID107 independent static review, EVID108 independent runtime PASS. Historical EVID101–105 describe initial CLI2 setup and its gate gaps, not blanket approval of new native code.

## Delivery Evidence
PR137 merged as a69f36f7cc2104f04ecc737f0b939cad72089c35 after actual CI41477545977 succeeded6/6. No package publication. Depth remains explicitly Standard for existing release tooling with unchanged registry/package business APIs; EVID109 now records real native main/release-head CI, read-only preview and malformed-approval refusal. Final guardian gate remains required before parent activation.

## Final configuration approval
EVID112 PASS7/7 closes the configuration gate. EVID111 independently measures the new helper at88.39% lines/statements,88.23% branches and100% functions against80% thresholds; exactly one file, not whole-monorepo coverage. Historical EVID103/110 remain preserved as superseded, not deleted. The separate owner Y approves the exact nine-version publication at main ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2 and intent digest581105805248fe0519104a0012bb201dbb0b62f297e4b2c58a87622743ca24bf. No positive publication is asserted by this configuration decision.

## Observed publication
EVID113 records the separately approved successful publication of all nine versions. Actual read-only registry recheck returns an empty native publication plan; all nine published GitHub Releases and their source tags were separately verified. Publication source is ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2; later evidence-only commits do not move those release tags.

