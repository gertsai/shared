---
depth: standard
id: PRD-060
kind: prd
last_modified_at: 2026-05-20T19:51:36.985120+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 23 — deep audit auth-openfga + rest-request-manager + queue + session-guard
---

## Problem Statement

Pre-1.0 audit gap closure. Wave 12.B/C/D were shallow; Wave 13.D2 + 15 + 18 + 20 were deep on specific packages. Mid-tier packages need deep audit:

- `@gertsai/auth-openfga` — OpenFGA ReBAC adapter (Wave 6.2/6.3 multi-instance scoping; Wave 12.B touched but not deep on security paths)
- `@gertsai/rest-request-manager` — REST retry + circuit breaker + token bucket (ADR-009; Wave 14.1 LruMap migration but core untouched)
- `@gertsai/queue` — BullMQ wrappers (Wave 15.B context but Tier-1 itself not deep)
- `@gertsai/session-guard` — invariant guards over `@gertsai/session` (Wave 12.D shallow)

~4.2k LOC total (src + tests).

## Goals

Read-only deep audit. Surface CRIT/HIGH/MED/LOW findings with file:line citations. Wave 24+ fix recommendations.

## Functional Requirements

**FR-001** — Per-package audit: logic, types, security, architecture.

**FR-002** — auth-openfga: ReBAC contract correctness, multi-instance scoping (ADR-012 fingerprint cache), CWE-770 LruTtlMap (post Wave 14.1).

**FR-003** — rest-request-manager: token-bucket invariants per ADR-009 Amendment 1.2.1, CircuitBreaker LRU (post Wave 14.1), HTTP→AppError translation per I-8, AbortError handling.

**FR-004** — queue: BullMQ wrapper correctness, /standalone runner safety, no leaks.

**FR-005** — session-guard: assertion vs check semantics, predicate correctness, error class hierarchy.

## Non-Functional Requirements

Read-only audit. No source modifications.

## Out of Scope

Actual fixes (Wave 24+). Wave 15.D ApiController action-pipeline still pending.

## Related Artifacts

- EVID-051 (Wave 12.D shallow precedent)
- EVID-059 + EVID-074 + EVID-076 (deep audit pattern precedents)
- ADR-009 (rest-rm), ADR-012 (auth-openfga fingerprint)



