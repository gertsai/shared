---
depth: standard
id: PRD-022
kind: prd
last_modified_at: 2026-05-14T11:11:45.090499+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-037
  relation: based_on
status: active
title: Wave 10.E audit-backlog closure — refresh rotation + deleted_at migration + IDocumentStore ISP split + defineAction helper
---

## Problem Statement

After Wave 10.D ([[EVID-037]]) closed the audit P0+P1+P2 items, four backlog items from [[EVID-036]] remained: refresh-token rotation (U-6), the `deleted_at` PG migration (CI-3 follow-through), `IDocumentStore` ISP split (W-Arch-2), and `defineAction()` typed helper retiring `: any` action exports (W-Type-1/2). This wave closes all four as a single follow-up PR atop Wave 10.D.

## Goals

1. Refresh-token rotation with reuse detection — rotate on every successful refresh; in-memory `jti` store with `consume()` / `revokeUser()` for stolen-token replay.
2. PG schema gains `deleted_at TIMESTAMPTZ NULL`; `PgDocumentRepository.softDelete` honors the contract identically to the in-memory adapter; partial index `idx_documents_active` keeps read paths fast.
3. `IDocumentStore` split into three narrow interfaces (`IDocumentStore` write / `IDocumentQuery` read / `ISoftDeletableDocumentStore` mutate) per ISP; `FullDocumentStore` union for composition.
4. Local `defineAction()` helper retires every `: any` action export across 11 files (`services/{auth,ingest,search}/**`). All smoke gates green.

## Target Audience

- **Primary:** anyone preparing m9s-example for production — refresh rotation + PG migration are the last items between "demo runs safely" and "demo is production-grade."
- **Secondary:** Wave 11+ contributors and external developers who consume the design as a starter — narrow ISP interfaces + `defineAction()` reduce per-feature cognitive load.

## Functional Requirements

- [ ] **FR-001 (rotation)** — `signRefreshToken()` returns `{token, jti}` with a new UUID jti per call. `JwtClaims.jti` is required on refresh tokens (verify rejects malformed). Login + refresh actions `registerJti(jti, userId, exp)` after signing. `RefreshResponse` now carries both `token` and `refreshToken` (rotated). `consumeJti` atomically transitions `usable → used`; reuse triggers `revokeUser(claims.sub)` which marks every active jti for the user as used.
  - **Acceptance:** present the same refresh token twice — second call returns 401 with "reuse detected"; the user's other active sessions are revoked.
- [ ] **FR-002 (migration)** — `migrations/002_add_documents_deleted_at.{up,down}.sql` adds `deleted_at TIMESTAMPTZ NULL` + partial index `idx_documents_active` (tenant_id, created_at DESC) `WHERE deleted_at IS NULL`. `PgDocumentRepository.{softDelete,listSummaries,count,findById}` filter / update on `deleted_at IS NULL`. Falls back to `PgSoftDeleteNotSupportedError` if the column is absent (un-migrated deploy).
  - **Acceptance:** with migration applied, PG mode delete returns 200; tombstoned rows excluded from list/count/findById. Without migration, action returns HTTP 501 (Wave 10.D behavior preserved).
- [ ] **FR-003 (ISP split)** — `domain/ports/IDocumentStore.ts` exports 3 narrow interfaces: `IDocumentStore` (`save` + `findById`), `IDocumentQuery` (`listSummaries` + `count`), `ISoftDeletableDocumentStore` (`softDelete`). `FullDocumentStore = IDocumentStore & IDocumentQuery & ISoftDeletableDocumentStore`. Concrete adapters (`DocumentRepository`, `PgDocumentRepository`) implement all three. Service contexts and composition root use `FullDocumentStore`.
  - **Acceptance:** tsc passes; narrower interfaces can be cited by future call sites (e.g., a metrics-only read-side consumer can depend on `IDocumentQuery` alone).
- [ ] **FR-004 (`defineAction`)** — `examples/m9s-example/src/lib/define-action.ts` exports `defineAction()` + `RegisteredAction` opaque marker. 11 action files in `services/{auth,ingest,search}/**` migrate from `export const x: any = controller.register(...)` to `export const x = defineAction(controller.register(...))`. Zero `: any` annotations remain on action exports. Zero `eslint-disable @typescript-eslint/no-explicit-any` lines on action exports.
  - **Acceptance:** `grep -rn "export const .*: any = controller.register" examples/m9s-example/src/services/` returns nothing.

## Non-Functional Requirements

**NFR-1 — Backward compatibility**
  - Action consumers (service registration via barrels) are unaffected — `defineAction()` is a no-op cast at runtime.
  - `IDocumentStore` widening: existing `DocumentRepository`/`PgDocumentRepository` adapters still satisfy `IDocumentStore` because they now `implements IDocumentStore, IDocumentQuery, ISoftDeletableDocumentStore`.
  - Refresh-token rotation: clients that don't store the rotated token receive a "reuse" rejection on next refresh — drives them to log in again. The web client (`api/client.ts`) already wires `setRefreshToken?:` on `JwtTokenProvider`.

**NFR-2 — Forgeplan discipline**
  - EVID-038 records ship with `verdict: supports`, `congruence_level: CL3`, `evidence_type: code_review + internal-test-result`. Links to PRD-022 + EVID-037 + EVID-036 (the audit chain).

**NFR-3 — Test gates**
  - Backend `tsc --noEmit`: 0 errors.
  - Web `svelte-check`: 0 errors / 0 warnings.
  - Workspace `eslint --max-warnings 0`: clean.
  - Backend tests: 70/71 (pre-existing pg-vector read-only-FS infra flake; out of scope).

## Stakeholders

- **Owner:** `examples/m9s-example/` (backend) + `examples/m9s-example-web/` (web JwtTokenProvider extension).
- **Reviewers:** Wave 10 audit panel re-review.

## Related Artifacts

- [[EVID-036]] — Wave 10 audit (this PRD's input).
- [[EVID-037]] — Wave 10.D remediation (this PRD's predecessor).
- [[PRD-018]] / [[PRD-019]] / [[PRD-020]] / [[PRD-021]] — Wave 10 PRD chain.
- [[ADR-002]] — Hex layer enforcement (cited for `PgSoftDeleteNotSupportedError` placement, preserved here).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel (continuity).

## Out of Scope

- Persistent jti store (Redis/PG) — in-memory is sufficient for the demo single-process target. Wave 11 / production work.
- `defineAction` upstreaming to `@gertsai/api-core` — Wave 11 v0.2.0 minor bump (adds public typed action helper to the package).
- Refresh-token deny-list persistence across restarts.
- Wider migration of inline `<button>`/`<input>` markup — Wave 10.D unrelated backlog.




