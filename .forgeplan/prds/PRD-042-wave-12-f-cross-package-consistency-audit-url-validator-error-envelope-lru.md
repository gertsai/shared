---
depth: standard
id: PRD-042
kind: prd
last_modified_at: 2026-05-18T21:07:04.462064+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 12.F — cross-package consistency audit (URL validator + error envelope + LRU)
---

## Problem Statement

EVID-051 §cross-cutting observations flagged 3 cross-package consistency gaps: (a) URL validator logic split between `@gertsai/fetch` + `@gertsai/utils` (drift risk), (b) error envelope three-way drift between `@gertsai/errors/http` ProblemDetails + backend handcurated + frontend inline definitions, (c) LRU cache primitive duplicated in `@gertsai/rest-request-manager` + `@gertsai/auth-openfga` + `@gertsai/m9s-cache` (no shared kernel).

## Goals

1. Identify each duplicated primitive across packages; produce reference call sites.
2. Recommend consolidation target package (e.g. `@gertsai/utils` for URL, new `@gertsai/lru` Tier-1, etc.).
3. Estimate LOC/risk of extraction per primitive.

## Functional Requirements

**FR-001** — URL validator audit: list every `try { new URL(...) } catch` or regex `^https?://` in packages/* + examples/*.
**FR-002** — Error envelope audit: list every `ProblemDetails`/`GertsErrorResponse`/inline error shape definition; identify drift triangle.
**FR-003** — LRU audit: list every `Map`-backed LRU implementation; identify if a single shared kernel would replace all.

## Non-Functional Requirements

Read-only audit. Produces EVID-059.

Refs: EVID-051 §cross-cutting, `packages/{fetch,utils,errors,rest-request-manager,auth-openfga,m9s-cache}/`.



