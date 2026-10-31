---
depth: standard
id: EVID-094
kind: evidence
last_modified_at: 2026-10-30T21:59:21.933786+00:00
last_modified_by: omp-coding-agent/1.0.0
status: deprecated
title: Existing example migration CLI fails strict TypeScript compilation during isolated test setup
---

---
assigned_number: 94
created: 2026-10-30
predicted_number: 94
slug: evid-existing-example-migration-cli-fails-strict-typescript-compilation-during
updated: 2026-10-30
---

# Existing example migration CLI compilation failure

## Structured Fields

verdict: refutes
congruence_level: 3
evidence_type: test

## Scope and provenance

Observed while preparing an isolated pgvector database for the full workspace regression following PRD-072/RFC-028. This refutes the current usability of the example migrate:up command, not the scoped storage/write-rules repair. The migration runner was not edited in this task. Its HEAD and working-tree SHA-256 are identical: e7ab5029d47f70bfd3758f0144fda3b0064db41a4f4fff9c866d031b39f972fc.

## Reproduction

With a fresh task-owned pgvector/pgvector:pg17 database accepting connections, run `POSTGRES_URL=postgresql://postgres@127.0.0.1:4194/m9s pnpm --filter @gertsai-examples/m9s-example run migrate:up`. The command exits 1 before executing SQL.

## Observed result

The existing ts-node entrypoint fails strict compilation in examples/m9s-example/scripts/migrate.ts: TS2345 at lines126/137, TS2339 at135/136, TS2532 at259. Regex captures retain string|undefined, the inferred migration slot includes an optional-name branch, and an indexed applied-row access is possibly undefined. These errors were observed, not inferred from a scanner. No validation was disabled or source/config modified to suppress them.

## Boundary and next trigger

The root build/typecheck omit this CLI entrypoint and therefore do not prove it works. Remediation is required before the next use of the migration CLI or the next example migration-tooling change. That future change must retain strict checking and prove fresh-database migration execution; transformation/runtime stages have not yet been reached, so no claim is made about later stages.

For this task, isolated E2E schema initialization uses the exact repository 001/002 forward SQL files through psql with ON_ERROR_STOP and one transaction. This is test-database setup only, not a claim that the broken CLI has been fixed and not a production deployment procedure. See KNOWN-ISSUES.md.


## Deprecation

Reason: Replaced for current applicability by EVID-096 actual strict ts-node CLI and 11 behavioral cases in each isolated round; independent Sol authorization in EVID-097. Preserve historical failure.
Date: 2026-10-31
