---
depth: standard
id: PRD-073
kind: prd
last_modified_at: 2026-11-02T13:33:48.027748+00:00
last_modified_by: omp-coding-agent/1.0.0
status: draft
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
The repository has Changesets2.31.0 and a working version PR, but one push workflow can publish without a separate affirmative action. Release PR CI is not currently registered after bot updates. Contributor docs incorrectly promise public npm publication. Private examples are versioned implicitly; package-manager configuration diverges in Storybook. Maintainers cannot currently distinguish a harmless version-preparation push from a publishing run using a dedicated approval event.

## Target Users
Maintainers and authors of the independently versioned shared packages.

## Goals
Authors record package intent once; automation prepares versions/changelogs and verifies release PRs; publication targets the existing GitHub Packages registry only after explicit confirmation of an exact tested main commit. No new long-lived token required.

## Functional Requirements
- FR-001: Pushes to main may prepare/update the version PR but must never publish.
- FR-002: Generated version PRs receive actual CI execution on their head, not a skip or absence.
- FR-003: Publication requires an explicit manual dispatch with full expected SHA and affirmative confirmation, main branch/current-head agreement, successful latest main CI, and no pending changesets/releases. Failed or malformed prerequisites refuse publication.
- FR-004: Preserve independent public package versions and internal workspace dependency propagation; explicitly disable version/tag churn for private examples.
- FR-005: Keep GitHub Packages registry and repository-scoped token; split versioning and publishing permissions.
- FR-006: Concise AGENTS.md rules and contributor/public docs explain changeset authoring, release review, manual publication, recovery and migration limits without implying public npm distribution.

## Non-Goals
No public npm migration, PAT installation, dependency upgrades, shared version groups, package business API changes, or actual publication during configuration work.

## Non-Functional Requirements
Publication is serialized and never cancelled mid-run. No new long-lived credentials; NODE_AUTH_TOKEN is injected only into the publication step. The manually selected main commit and its build code are trusted; this workflow is not a sandbox against hostile repository code. Verification uses disposable clones and existing CI; no extra production service or package API. Refusal must occur before irreversible registry writes.

## Acceptance Criteria
- [x] FR-004: Installed CLI accepts config; isolated real version run produces consistent public versions/changelogs without changing private versions.
- [x] FR-001/FR-003/FR-005: Workflow validation passes and exact publication guard rejects wrong confirmation/ref/SHA, stale head, missing/failed CI, pending/malformed release status, and non-GitHub registry.
- [ ] FR-002: Actual Actions CI runs on generated release PR through workflow dispatch without new credentials.
- [ ] FR-006: Setup PR and updated main checks pass; publication remains manual.

## Reasoning
Keep the existing registry/version model. Prefer separate manual publish workflow over automatic merge-triggered publication because operator approval is a repository requirement. Dispatch existing CI with GITHUB_TOKEN rather than requiring a new GitHub App/PAT just for bot PR checks. Publication cannot be reversed by reverting Git; fixes require a new version/deprecation.

## Related Artifacts
RFC-029 implements this release-only setup. EVID-098/EVID-099 cover unchanged package behavior.

