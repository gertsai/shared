---
depth: standard
id: PRD-072
kind: prd
last_modified_at: 2026-10-31T13:46:25.874607+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: EVID-092
  relation: based_on
- target: SPEC-008
  relation: refines
status: active
title: Close eight write-rules readiness findings before merge
---

---
assigned_number: 72
created: 2026-10-30
domain: general / healthcare / fintech / govtech / edtech
epic: null
predicted_number: 72
priority: P0 / P1 / P2 / P3
projectType: web_app / api_backend / mobile_app / cli_tool / library
slug: prd-close-eight-write-rules-readiness-findings-before-merge
stepsCompleted: []
updated: 2026-10-30
---

# Close eight write-rules readiness findings before merge

## Problem

EVID-092 records four P1 and four P2 defects on feat/write-rules-getafter-claims, HEAD 2f0327f. Five findings were runtime-confirmed. The user authorized completing all required remediation after the React snapshot fix (EVID-091). Existing tests pass despite atomicity, post-image and versioning failures. A rejected multi-document operation can currently persist earlier writes, and an authorization predicate can inspect a post-image different from the eventual committed record. These are observable data-integrity and authorization defects, not merely missing documentation or test style.

## Target Users

Consumers of storage-core, entity-storage and pg-client relying on authorization rules, lifecycle operations, transactional atomicity and optimistic concurrency.

## Goals

Close all eight EVID-092 findings with behavioral regression coverage, actual relational-database verification, independent Sol 6.1 review, coherent release metadata and no regressions to the completed React fix.

## Functional Requirements

- [x] FR-001: Every successful mutation of a versioned existing relational-adapter row advances update_version atomically from the stored version, ignoring a caller-supplied replacement value; stale expectedVersion rejects without changing data. Cover update, set merge/overwrite, native upsert and queued writes. Fresh inserts preserve seeded versions.
- [x] FR-002: InMemory batch and transaction publication is atomic across all touched keys. A later CAS/clone failure publishes no earlier delta or listener event. Transaction-local reads reflect queued merges from the committed snapshot, including retained fields and provider-owned version progression.
- [x] FR-003: getAfter reflects the actual ordered post-commit document, including soft-delete stamped rows, restore status=created and null deletion fields, audit payloads, provider version increments and physical destroy absence. Domain-only affectedKeys/patch semantics remain separate from persisted audit data.
- [x] FR-004: affectedKeys matches actual provider persistence. Retain the existing shallow literal-key patch contract of both supplied providers: a key containing a dot is a literal key, not an unimplemented nested-field operation. Remove the special nested diff and inaccurate root-field claims; do not introduce a new nested update API.
- [x] FR-005: hasRoleWithSource treats scalar role/source arguments as singleton lists, equivalent to arrays.
- [x] FR-006: Single-write get/getAfter reads are stable within one evaluation, share in-flight reads, agree with the prefetched target resource, and reuse the same lifecycle write payload later persisted.
- [x] FR-007: Routed writes are evaluated once by a deferred audited runner gate against all pending writes, while preserving the originating service rules, claims and path. Foreign/unsupported runners must not bypass authorization. Direct writes retain their policy enforcement.
- [x] FR-008: Scoped release records cover the original feature commits and remediation, including the breaking default set merge behavior on already-major package versions. Preserve the separate framework-adapter patch release record and existing user changes.

## Acceptance Criteria

- [x] AC1: A real isolated relational database demonstrates version advancement, stale rejection, audit-preserving native upsert and rollback of an earlier write after a later conflict.
- [x] AC2: Permanent in-memory regressions cover batch and transaction late-failure atomicity, blind merge-set read parity and listener silence on abort.
- [x] AC3: Permanent rule/service regressions cover delete/restore getAfter parity, literal dotted keys versus allowlists, scalar/array roles, repeated/in-flight single-write reads and routed sibling post-images.
- [x] AC4: Independent openai-codex/gpt-6.1-sol review has no unresolved in-scope P1/P2 findings; all code/tests are authored by openai-codex/gpt-6-luna.
- [x] AC5: Affected tests, build, typecheck, root CI lint, package export/type checks and frozen lockfile check pass; scope limits are explicit. Release records name every changed public package.

## Non-Functional Requirements

- NFR1: SQL version advancement adds no read-before-write round trip or runtime driver dependency.
- NFR2: In-memory atomic staging copies touched keys only, not entire collections; failed operations publish no notifications.
- NFR3: Single-evaluation read caching coalesces concurrent requests without global cache retention.
- NFR4: Test database and smoke artifacts are task-owned, isolated and removed after verification. Existing user changes remain untouched.

## Non-Goals

No publication, push, merge or PR creation; no edits to gertsai_codex; no new nested patch syntax, PostgreSQL identifier support, retry policy or unrelated ESLint reconfiguration. Preserve user agent/settings/config changes and completed React fix.

## Reasoning

Considered enforcing the current shallow literal-key storage semantics in diffing versus introducing nested updates in both providers and every post-image builder. The former fixes the actual mismatch without silently changing the storage API or adding new SQL patch machinery. For atomic memory writes, stage only touched keys rather than clone/publish whole collections, preserving disjoint-write behavior. The relational adapter derives versions in the SQL mutation rather than a read-then-write race.

## Related Artifacts

EVID-092 is the failing readiness baseline; SPEC-008 is the existing storage contract; EVID-091 records the completed React fix to preserve. RFC-028 defines the remediation; EVID-093 records the final verification.

## Independent review integration findings

Sol 6.1 found three authorization ownership gaps after the first implementation: caller-owned domain patches/action params may diverge from queued provider payloads; audited runners remain writable after the user callback while predicates execute; constructor claims remain caller-aliased. Own coherent snapshots before stamping/queueing, close direct and routed runner mutation immediately at callback settlement before the deferred gate, and retain an immutable service claims snapshot. Permanent behavioral tests must prove denied writes do not alter stored rows.

The real SQL regression suite confirmed projection/predicate placeholder collisions in JSONB filtering. Allocate disjoint field-parameter indexes. Sol also identified inherited array-contains-any string/number/null coercion errors; use JSONB singleton containment without changing flat-column compiler consumers. Verify all through real PostgreSQL.

## Verification record

EVID-093 records completed implementation, independent Sol source review, 28 compiled runtime scenarios, full workspace tests (5794 pass, 105 skip), final types/lint/build and scoped package/release checks. EVID-094 preserves the historical CLI failure; EVID-096 now proves its repair with strict subprocess and real migration cases. EVID-098 records the latest complete root regression (5788 passed, 105 skipped, 0 failed) and typechecks after separately authorized incidental-default test removal. No Git publication or npm release was performed.

## Requirement verification coverage

| Requirement | Acceptance | Observed proof |
|---|---|---|
| FR-001 | AC1 | EVID-093 real PostgreSQL version and rollback state |
| FR-002 | AC2 | EVID-093 memory atomicity, cloning, merge-read and event regressions |
| FR-003 | AC3 | EVID-093 exact lifecycle postimage and commit parity |
| FR-004 | AC3 | EVID-093 literal dotted-key persistence and denial checks |
| FR-005 | AC3 | EVID-093 scalar and list role/source cases |
| FR-006 | AC3 | EVID-093 repeated and concurrent stable rule reads |
| FR-007 | AC3, AC4 | EVID-093 deferred ownership/lifetime/action/CAS tests and Sol review |
| FR-008 | AC5 | EVID-093 frozen-lock, pending changeset and package export checks |

## Activation boundary

Historical activation blockers EVID-095/EVID-097 are deprecated after independent Sol final PASS EVID-099. EVID-096 proves reconciled Wave37 gates; EVID-098 proves the final full root regression with actual PG integration. Preserve historical observations and legitimate graph edges. Activation requires fresh per-artifact R_eff >=0.5 and zero MUST errors; PRD-072 precedes RFC-028. No publication or Git writes authorized.



