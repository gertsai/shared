---
depth: standard
id: PRD-021
kind: prd
last_modified_at: 2026-05-14T10:56:30.975291+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-036
  relation: informs
status: active
title: Wave 10.D audit-remediation — P0 + P1 critical fixes from EVID-036
---

## Problem Statement

The post-Wave-10 audit ([[EVID-036]]) surfaced 8 critical issues + 14 warnings across logic, architecture, type, and security lenses. Wave 10 (A + B + C) is **functionally complete** but **not production-deployment-ready** without these fixes — three of the issues (CWE-798 hardcoded JWT secret, login accepting any credentials, anonymous upload allowing arbitrary docId overwrite) make a production deploy trivially exploitable. Other criticals (module-singleton tokenProvider race, reactive 401-retry body loss, SSE start-before-subscribe race, Liskov violation in PG soft-delete) make the demo fragile under real concurrency.

This PRD is the **remediation wave** — closes audit P0 + P1 items + selected P2 quick-wins as a single PR atop Wave 10.C. Branch `fix/wave-10-audit-p0-p1`.

## Goals

1. All 3 P0 (deployment-blocking security) items closed: JWT_SECRET prod gate, M9S_DEMO_AUTH login gate, anonymous-upload docId hardening.
2. All 6 P1 (pre-merge correctness) items closed: AsyncLocalStorage tokenProvider, reactive 401-retry bugs, single-flight refresh, refresh_token cookie clearing, SSE replay buffer, PG soft-delete Liskov honored.
3. 4 P2 quick-wins included: `?next=` honored on login redirect (CI-4), docId regex unified, busboy fieldsLimit listeners, login `email` dropped from logs (CWE-532). All smoke gates green (backend tsc 0, web svelte-check 0/0/0, workspace lint clean, backend tests 70/71 with the 1 pre-existing pg-vector infra flake).

## Target Audience

- **Primary:** anyone deploying m9s-example beyond local dev — these fixes are the difference between "demo runs locally" and "demo can be safely run on a public host without immediate compromise."
- **Secondary:** Wave 11+ contributors building on this foundation — race-free token plumbing + Liskov-honored storage interfaces + replay-buffered SSE are required for any future feature that depends on these primitives.
- **Tertiary:** audit re-review on the remediated branch (post-merge); EVID-037 records the closure.

## Functional Requirements

- [ ] **FR-001 (P0 / CI-1)** — `JWT_SECRET` resolution hard-fails when `NODE_ENV === 'production'` AND `process.env.JWT_SECRET` is unset, unless an explicit `M9S_ALLOW_DEMO_SECRET=1` opt-in is present. Applies to both `examples/m9s-example/src/services/auth/src/jwt.ts` and `examples/m9s-example-web/src/lib/server/jwt.ts` (both sign + verify paths).
  - **Acceptance:** module loads (or first call to `getSecret`) throws a clear `Error` when production env is detected without `JWT_SECRET`; demo-opt-in path still works.
- [ ] **FR-002 (P0 / U-5)** — `v1.auth.login` action returns HTTP 403 unless `process.env.M9S_DEMO_AUTH === 'true'`. Eliminates the "accept-any-credentials" surface in production deploys.
  - **Acceptance:** `curl -X POST /api/v1/auth/login` returns 403 by default; sets `M9S_DEMO_AUTH=true` to enable the demo path.
- [ ] **FR-003 (P0 / W-Security-9)** — `v1.ingest.upload` action ignores caller-supplied `docId` form field when the request is anonymous (`session === undefined`) and forces `randomUUID()`. Authenticated callers continue to use the supplied id.
  - **Acceptance:** anonymous upload with `docId=existing-id` form field returns a freshly-generated docId, never overwriting the targeted document.
- [ ] **FR-004 (P1 / CI-2 + U-1 + U-2)** — `examples/m9s-example-web/src/lib/api/client.ts` rewires JWT plumbing: per-request provider via `AsyncLocalStorage`, single-flight refresh promise dedup, pre-consumption request clone for retry, `/auth/refresh` self-recursion guard. New `withJwtTokenProvider(provider, async () => …)` helper replaces deprecated `setJwtTokenProvider` (kept as no-op shim for back-compat).
  - **Acceptance:** two parallel API calls with near-expiry token issue exactly one refresh (verified by test or code review); POST with body survives 401-retry; concurrent SvelteKit requests never observe each other's tokens.
- [ ] **FR-005 (P1 / U-3)** — `auth.ts` hook clears both `auth_token` AND `refresh_token` cookies when access-token verification fails (tamper / expired / wrong kind).
  - **Acceptance:** present a tampered `auth_token` cookie; both auth cookies are unset in response headers.
- [ ] **FR-006 (P1 / U-4)** — SSE emitter buffers last `REPLAY_LIMIT = 8` events per docId for `BUFFER_TTL_MS = 5 min`; `subscribe()` flushes the buffer synchronously before registering a live listener. Terminal events (`done` / `error`) mark the buffer terminal — late subscribers receive the tail and skip live-listener registration.
  - **Acceptance:** start an inline ingest, wait 100ms, then subscribe — receives full lifecycle in order.
- [ ] **FR-007 (P1 / CI-3)** — `PgDocumentRepository.softDelete` throws `PgSoftDeleteNotSupportedError` (defined in `shared/errors.ts` to respect hex boundary per ADR-002). The delete action maps it to HTTP 501 `Not Implemented`. The in-memory `DocumentRepository` continues to soft-delete via `BaseEntityStorageService.delete()`.
  - **Acceptance:** Memory mode: delete returns 200 + `{deleted: true}`. PG mode: delete returns 501 + message pointing at the missing `deleted_at` migration.
- [ ] **FR-008 (P2 quick-wins)** — `?next=` consumed by login redirect with same-origin path validation (`safeNextRedirect()`); docId regex unified to `^[A-Za-z0-9_-]{1,128}$` across upload + delete; busboy `fieldsLimit` + `filesLimit` listeners surface as `PayloadTooLargeError`; raised `fields: 8 → 16`; login logger drops `email`, keeps `userId + tenantId`.
  - **Acceptance:** `/admin/content` → `/login?next=/admin/content` → successful login → redirects to `/admin/content`. Open-redirect attempts (`next=//evil.com`, `next=javascript:alert(1)`, `next=/\evil.com`) fall back to `/`.

## Non-Functional Requirements

**NFR-1 — Backward compatibility**
  - `setJwtTokenProvider` keeps its export signature (no-op shim) so external callers compile; ALS-based replacement is the only path read by middleware.
  - All Wave 9 / 10.A / 10.B / 10.C routes function identically for the happy path; only previously-broken edge cases change behavior.

**NFR-2 — Security regression prevention**
  - Both JWT secret paths refuse to silently fall back in production.
  - Anonymous upload cannot overwrite by docId.
  - Open-redirect attempts on login's `?next=` are validated.

**NFR-3 — Test gates**
  - Backend `tsc --noEmit`: 0 errors.
  - Web `svelte-check`: 0 errors / 0 warnings.
  - Workspace lint (`eslint --max-warnings 0`): clean.
  - Backend tests: 70/71 (the 1 pre-existing `pg-vector` read-only-FS infra flake remains; out of scope).

**NFR-4 — Forgeplan discipline**
  - EVID-037 records closure of EVID-036's P0+P1 items with `verdict: supports`, `congruence_level: CL3`, `evidence_type: code_review + internal-test-result`. Links to PRD-021 + EVID-036.

## Stakeholders

- **Owner:** `examples/m9s-example/` + `examples/m9s-example-web/` codebases.
- **Reviewers:** Wave 10 audit panel (re-review on PR), CLAUDE.md red-line keeper.

## Related Artifacts

- [[EVID-036]] — Wave 10 audit report (this PRD's input).
- [[PRD-018]] / [[PRD-019]] / [[PRD-020]] — Wave 10 sub-wave PRDs (whose FRs this PRD remediates).
- [[ADR-002]] — Hex layer enforcement (cited for `PgSoftDeleteNotSupportedError` placement decision).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel (continuity).

## Out of Scope

- Refresh-token rotation + reuse detection (audit U-6 / P2-11) — deferred; tracked as Wave 11 backlog. Today's fix improves single-flight + clearing but does not implement rotation.
- `JwtClaims` extraction to a shared types package (audit CI-5 / P3-15) — backlog (`@gertsai-examples/m9s-example-shared-types`).
- `IDocumentStore` ISP split (audit W-Arch-2 / P3-16) — backlog.
- OpenFGA tuple write relocation out of `pg-document.repository.ts` (audit W-Arch-3 / P3-17) — backlog.
- 2-tier refresh middleware redesign (audit W-Arch-7 / P3-18) — backlog.
- `defineAction()` typed helper in `@gertsai/api-core` (audit W-Type-1/2 / P3-19) — backlog.
- Per-docId `EventEmitter` map (audit W-Logic-3 / P3-20) — backlog; current global emitter + per-doc replay buffer is sufficient for the demo workload.
- `deleted_at` migration itself — this PRD fails-loud on PG; the schema migration is tracked as a separate task.




