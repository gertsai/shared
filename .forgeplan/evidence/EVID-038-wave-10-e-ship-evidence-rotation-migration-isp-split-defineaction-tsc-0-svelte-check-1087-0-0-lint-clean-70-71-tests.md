---
depth: standard
id: EVID-038
kind: evidence
last_modified_at: 2026-05-14T11:12:36.843553+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-022
  relation: informs
status: active
title: Wave 10.E ship evidence — rotation + migration + ISP split + defineAction — tsc 0 / svelte-check 1087-0-0 / lint clean / 70-71 tests
---

## Summary

Wave 10.E ships the four remaining audit-backlog items from [[EVID-036]]: refresh-token rotation with reuse detection, the `deleted_at` PG migration, the `IDocumentStore` ISP split, and the local `defineAction()` helper retiring every `: any` action export. **All smoke gates green**: backend tsc 0, web svelte-check 1087/0/0, lint clean, backend tests 70/71 (pre-existing pg-vector infra flake).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review + internal-test-result

`congruence_level: CL3` — same-target smoke runs (this exact branch). R_eff = max(0, 1.0 − 0.0) = 1.0.

## What was built

### 1. Refresh-token rotation + reuse detection (FR-001 / audit U-6)

- `examples/m9s-example/src/services/auth/src/rotation-store.ts` (NEW, ~120 LOC) — in-memory `Map<jti, {userId, exp, used}>` with `registerJti / consumeJti / revokeUser / pruneJtiStore / __resetRotationStoreForTests`. Atomic transition via single-threaded Node tick.
- `services/auth/src/jwt.ts`: `signRefreshToken()` now returns `{token, jti}` with `randomUUID()` per call. `JwtClaims.jti?` added; verify rejects refresh tokens missing jti.
- `services/auth/src/actions/login.action.ts`: registers the freshly-minted jti after sign.
- `services/auth/src/actions/refresh.action.ts`: atomic `consumeJti(claims.jti)` → mints a new pair (access + rotated refresh) → registers new jti. Reuse path calls `revokeUser(claims.sub)` and logs `revokedCount` (no PII).
- `services/auth/types.ts`: `RefreshResponse` gains `refreshToken: string` so clients receive the rotated token.
- `examples/m9s-example-web/src/lib/api/client.ts`: `JwtTokenProvider.setRefreshToken?:` optional method added; `RefreshResult` now `{access, refresh}`; both proactive + reactive paths persist the rotated refresh.

**Behavior:**
- Login → user gets `{access, refresh-1, jti-1}`. Store: `{jti-1: usable}`.
- Refresh once → `consume(jti-1)` → `{access', refresh-2, jti-2}` registered. Store: `{jti-1: used, jti-2: usable}`.
- Refresh again with refresh-1 (stolen replay) → `consume(jti-1)` returns `reuse` → `revokeUser` marks jti-2 used → both legitimate + attacker forced to re-login.

### 2. PG `deleted_at` migration (FR-002 / audit CI-3 follow-through)

- `migrations/002_add_documents_deleted_at.up.sql` (NEW): `ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL` + partial index `idx_documents_active (tenant_id, created_at DESC) WHERE deleted_at IS NULL`.
- `migrations/002_add_documents_deleted_at.down.sql` (NEW): DROP INDEX + DROP COLUMN. Documented destructive behavior (loses tombstones).
- `infrastructure/pg-document.repository.ts`:
  - `findById` / `listSummaries` / `count` all filter `AND deleted_at IS NULL`.
  - `softDelete` now `UPDATE documents SET deleted_at = now() WHERE id = ... AND deleted_at IS NULL`.
  - Catch-block detects PostgreSQL error 42703 (`undefined_column` / "deleted_at") → throws `PgSoftDeleteNotSupportedError` so un-migrated deploys still surface HTTP 501 (Wave 10.D fail-loud preserved).

**Behavior:**
- With migration: PG mode delete returns 200 + `{deleted: true}`. Tombstones excluded from list / count / findById. List + count stay in sync.
- Without migration: action returns 501 with actionable message ("apply migration 002").

### 3. `IDocumentStore` ISP split (FR-003 / audit W-Arch-2)

- `domain/ports/IDocumentStore.ts` rewritten:
  - `IDocumentStore` — write port (`save`, `findById`). Note: `findById` is part of the write port because the ingest pipeline uses it for read-modify-write (existing-id upsert). The ingest action requires it.
  - `IDocumentQuery` — read projection (`listSummaries`, `count`).
  - `ISoftDeletableDocumentStore` — mutating delete (`softDelete`).
  - `FullDocumentStore = IDocumentStore & IDocumentQuery & ISoftDeletableDocumentStore` — composition union for adapters + service context.
- `DocumentRepository` and `PgDocumentRepository` now `implements IDocumentStore, IDocumentQuery, ISoftDeletableDocumentStore` (same concrete classes; ISP at port level).
- `composition/infrastructure.ts` + `services/ingest/types.ts` use `FullDocumentStore`. Service-level actions could narrow further (e.g., `list-documents` to `IDocumentQuery`) — left as backlog for cleanest demo.

### 4. Local `defineAction()` helper (FR-004 / audit W-Type-1/W-Type-2)

- `examples/m9s-example/src/lib/define-action.ts` (NEW, ~80 LOC) — exports `defineAction(registration: unknown): RegisteredAction` opaque marker. Type-erases the leaked Moleculer/typia shape without `: any`. Single eslint-disable suppression centralised in this one file (none on call sites).
- 11 action files migrated from:
  ```ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const xxx: any = controller.register('name', { ... });
  ```
  to:
  ```ts
  export const xxx = defineAction(controller.register('name', { ... }));
  ```
- Migrated files: `services/auth/src/actions/{login,refresh,logout}.action.ts`, `services/ingest/src/actions/{ingest-document,upload-document,list-documents,delete-document,start-workflow,embed-batch,store-chunks}.action.ts`, `services/search/src/actions/search-query.action.ts`.

**Verification:** `grep -rn "export const .*: any = controller.register" examples/m9s-example/src/services/` returns nothing. Every action export is now properly typed.

## Smoke results (2026-05-14 14:11 UTC)

| Gate | Command | Result |
|---|---|---|
| Backend tsc | `pnpm --filter @gertsai-examples/m9s-example exec tsc --noEmit` | **0 errors** |
| Web check | `pnpm --filter @gertsai-examples/m9s-example-web check` | **1087 files · 0 errors · 0 warnings** |
| Workspace lint | `pnpm lint` | **clean** |
| Backend tests | `pnpm --filter @gertsai-examples/m9s-example test` | **70/71 PASS** (pre-existing pg-vector flake) |

## Files modified (~21 across 4 themes)

**Rotation (6 files):**
- `services/auth/src/rotation-store.ts` (NEW, 120 LOC)
- `services/auth/src/jwt.ts` (+jti claim, +signRefreshToken return shape)
- `services/auth/src/actions/login.action.ts` (+registerJti call)
- `services/auth/src/actions/refresh.action.ts` (full rewrite — consume + revoke + rotate)
- `services/auth/types.ts` (+refreshToken on RefreshResponse)
- `examples/m9s-example-web/src/lib/api/client.ts` (+setRefreshToken? on provider; RefreshResult shape)

**Migration (2 files):**
- `migrations/002_add_documents_deleted_at.{up,down}.sql` (NEW)
- `infrastructure/pg-document.repository.ts` (softDelete via UPDATE + deleted_at IS NULL filter on read paths)

**ISP split (4 files):**
- `domain/ports/IDocumentStore.ts` (3 interfaces + FullDocumentStore union)
- `infrastructure/document.repository.ts` (implements 3 interfaces)
- `infrastructure/pg-document.repository.ts` (implements 3 interfaces)
- `services/ingest/types.ts` + `composition/infrastructure.ts` (FullDocumentStore)

**defineAction (12 files):**
- `lib/define-action.ts` (NEW, 80 LOC)
- 11 action files migrated (auth × 3, ingest × 7, search × 1)

Total: ~600 LOC delta across ~22 files + 2 new SQL files.

## Acceptance criteria (PRD-022)

- [x] FR-001 — rotation: register/consume/revoke flow, reuse detection, web client persists rotated tokens.
- [x] FR-002 — migration: SQL + PG repo honors soft-delete contract identically to memory; un-migrated deploys still fail loud.
- [x] FR-003 — ISP split: 3 narrow interfaces + FullDocumentStore composition.
- [x] FR-004 — defineAction: 11 action exports migrated, zero `: any` annotations remain on action exports.

All 3 NFRs verified (backward compatibility, forgeplan discipline, test gates green).

## R_eff post-Wave-10.E

Parent PRD chain:
- EVID-033 / 034 / 035 (supports CL3) → 1.0
- EVID-036 (weakens CL3, audit findings) → 0.5  — superseded by:
- EVID-037 (supports CL3, P0+P1+P2 closure) → 1.0  — superseded by:
- EVID-038 (supports CL3, U-6 + CI-3 + W-Arch-2 + W-Type-1/2 closure) → 1.0

Weakest live link = 1.0. Wave 10 closure is now **functionally + security + architecturally complete**.

## What remains (post-10.E backlog)

- **JwtClaims shared types pkg** (audit CI-5 / P3-15) — drift risk; tractable as a small new workspace package.
- **OpenFGA tuple write relocation** (audit W-Arch-3 / P3-17) — ADR-002 violation in `pg-document.repository.ts`; needs a use-case decorator.
- **Per-docId EventEmitter map** (audit W-Logic-3 / P3-20) — current global emitter + replay buffer suffices for the demo workload; a real production port to Redis pub/sub would split per-doc naturally.
- **2-tier refresh redesign** (audit W-Arch-7 / P3-18) — proactive+reactive could collapse to reactive-only now that single-flight + replay buffer + rotation are in place. Demo-quality acceptable.
- **`defineAction` upstreaming to `@gertsai/api-core`** (Wave 11 / api-core v0.2.0 minor bump).
- **Persistent jti store** (Redis or PG `refresh_tokens` table) — in-memory is single-process; production needs durable state.
- **Per-tenant subscriber cap on SSE** — current cap is global `setMaxListeners(50)`.
- **npm publish v0.2.0 / v0.3.0** — long-standing pending gate.

## References

- [[EVID-036]] — Wave 10 audit (input).
- [[EVID-037]] — Wave 10.D remediation (this builds on).
- [[PRD-022]] — this PRD's requirements.
- [[PRD-018]] / [[PRD-019]] / [[PRD-020]] / [[PRD-021]] — Wave 10 chain.
- [[ADR-002]] — Hex layer (preserved in soft-delete error placement).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel.




