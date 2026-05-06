---
depth: standard
id: SPEC-012
kind: spec
last_modified_at: 2026-05-06T19:12:34.156925+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-007
  relation: based_on
status: active
title: Sprint 3.7 — Wave 5 Phase 2 (runtime-context + session-guard + audit-primitives)
---

# SPEC-012: Sprint 3.7 — Wave 5 Phase 2

## Summary

Wave 5 Phase 2 = ship 3 NEW packages — `@gertsai/runtime-context` (Tier 4, F), `@gertsai/session-guard` (Tier 2, F), `@gertsai/audit-primitives` (Tier 2, F). Per PRD-003 G-4 + ADR-007 Decisions A, B, C, D. Estimated 30h dev + 4h orchestration ≈ 1 working week.

Scope strictly bounded — NO Sprint 3.8/3.9 work. Branch `feat/sprint-3-7-wave-5-phase-2` off `feat/sprint-3-6-wave-5-phase-1` (preserves Wave 5 Phase 1 production-grade state).

## Scope

### Track 1: `@gertsai/runtime-context` package (T1, F marker, Tier 4)

Fresh Tier 4 package per ADR-007 Decision A.

- **W-3-7-1**: Create `packages/runtime-context/` skeleton — `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.mts`, `src/index.ts`, `src/__tests__/`, `LICENSE` symlink, `README.md`, `CHANGELOG.md`.
  - Subpath exports: `.`, `./moleculer`, `./package.json`.
  - peerDependencies: `@gertsai/errors: workspace:^`, `@gertsai/session: workspace:^`, `@gertsai/tenant-resolver: workspace:^`, `@gertsai/di: workspace:^`.
  - peerDependenciesMeta: `moleculer: { optional: true }` (only in /moleculer subpath).
  - typesVersions for Node10 fallback.
  - Strategy marker: **F** (fresh).
  - **CRITICAL — first commit**: skeleton with `package.json` + empty `src/index.ts` exports within first 30s of Build phase to unblock peer-dep symlinks.

- **W-3-7-2**: Implement `RequestContext` class — `src/request-context.ts`. Lazy private getters for session/tenantId/correlationId/locale/features/providers. `$setSession`, `$setTenantId`, `$freeze` mutators. Memoization for correlationId UUID generation. Frozen flag throws `ContextFrozenError` on subsequent mutation attempts.

- **W-3-7-3**: Implement `RequestContextInit` interface + types — `src/types.ts`.

- **W-3-7-4**: Implement `AuthContext` interface + factory `requireAuthContext(ctx: RequestContext): AuthContext` — `src/auth-context.ts`. Throws `SessionMissingError` / `TenantContextMissingError` if context not fully initialized.

- **W-3-7-5**: Implement `FeatureContext` — `src/feature-context.ts`:
  - `class DefaultFeatureContext implements FeatureContext`
  - Constructor accepts `FeatureContextInit` (Set<string> + optional flagProvider).
  - `isEnabled(flag): boolean` checks Set then flagProvider; `enabledFlags(): string[]` returns Set contents.

- **W-3-7-6**: Implement `ProviderContext` — `src/provider-context.ts`:
  - `class DefaultProviderContext implements ProviderContext`
  - Constructor accepts `ProviderContextInit` (Map<symbol|string, unknown> + optional resolver).
  - `get<T>(token): T` throws `ProviderNotFoundError` if not bound; `getOptional<T>(token): T | undefined`.
  - `requestContextIdentifier = Symbol.for('@gertsai/runtime-context:RequestContext')` exported for DI integration.

- **W-3-7-7**: Implement 5 dedicated errors — `src/errors.ts`:
  - `SessionMissingError`, `TenantContextMissingError`, `ProviderNotFoundError`, `ContextFrozenError`, `FeatureNotEnabledError`. All extend `@gertsai/errors` subclasses (per ADR-007 Decision A §6).

- **W-3-7-8**: Implement `/moleculer` subpath — `src/moleculer/index.ts`:
  - `sessionMiddleware(opts: { resolver, sessionFactory })` factory creating Moleculer middleware.
  - Reads `ctx.meta.tenantId / sessionUuid / correlationId / locale` (defensive — won't throw if absent).
  - Composes RequestContext per-request, attaches to `ctx.locals.requestContext` (per ADR-007 I-15).
  - `getRequestContext(ctx): RequestContext` helper to read from ctx.locals.
  - Re-export `tenantMiddleware` from `@gertsai/tenant-resolver/moleculer` for composition convenience (just `export { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';`).
  - Peer-optional `moleculer` import via `import type` only.

- **W-3-7-9**: Tests (≥20 tests):
  - `request-context.test.ts` — lazy getters; freeze invariant; SessionMissingError throw; correlationId memoization; locale default 'en'.
  - `auth-context.test.ts` — requireAuthContext throws on missing session/tenant; success returns subset.
  - `feature-context.test.ts` — flag set + flagProvider precedence; enabledFlags listing.
  - `provider-context.test.ts` — Map binding + resolver fallback; ProviderNotFoundError on missing; getOptional returns undefined.
  - `errors.test.ts` — all 5 errors instanceof AppError + correct kind/details shape.
  - `moleculer.test.ts` — sessionMiddleware factory composition; ctx.locals attachment; getRequestContext extractor.

- **W-3-7-10**: README — usage examples (RequestContext init / Moleculer middleware / DI integration); cross-link к ADR-007 + PRD-003 + Security section (lazy access pattern).

### Track 2: `@gertsai/session-guard` package (T2, F marker, Tier 2)

Fresh Tier 2 package per ADR-007 Decision B.

- **W-3-7-11**: Create `packages/session-guard/` skeleton — `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.mts`, `src/index.ts`, `src/__tests__/`, `LICENSE` symlink, `README.md`.
  - Single export root only (no subpaths).
  - peerDependencies: `@gertsai/session: workspace:^`, `@gertsai/errors: workspace:^`.
  - Strategy marker: **F**.

- **W-3-7-12**: Implement guard predicates — `src/guards.ts`:
  - `isAuthenticated(session: Session | undefined): session is Session`
  - `hasOperatorType(session: Session, type: OperatorType | OperatorType[]): boolean`
  - `isInTenant(session: Session, tenantId: string): boolean` — uses `session.tenantId` (Sprint 3.6 additive scoping).
  - `isImpersonating(session: Session): boolean` — checks `session.dataAccessUuid !== session.operatorUuid`.

- **W-3-7-13**: Implement 4 dedicated errors — `src/errors.ts`:
  - `DataAccessUuidMissingError extends UnauthorizedError`
  - `OperatorTypeMismatchError extends ForbiddenError`
  - `TenantScopeViolationError extends ForbiddenError`
  - `SessionDestroyedError extends ConflictError`

- **W-3-7-14**: Implement assertion helpers — `src/assertions.ts`:
  - `assertAuthenticated(session): asserts session is Session` — throws `DataAccessUuidMissingError` if undefined (uses TS assertion signature for narrowing).
  - `assertOperatorType(session, ...types): void` — throws `OperatorTypeMismatchError`.
  - `assertSessionInTenant(session, tenantId): void` — throws `TenantScopeViolationError`.
  - `assertNotDestroyed(session): void` — throws `SessionDestroyedError`. Uses Session destroyed flag (existing API).

- **W-3-7-15**: Implement result-shape variants — `src/check.ts`:
  - `checkAuthenticated(session): { ok: true; session } | { ok: false; error }`
  - `checkOperatorType(session, ...types): { ok: true } | { ok: false; error }`
  - `checkSessionInTenant(session, tenantId): { ok: true } | { ok: false; error }`

- **W-3-7-16**: Tests (≥15 tests):
  - `guards.test.ts` — 4 guards × happy/null/edge.
  - `errors.test.ts` — 4 errors instanceof correct AppError parent + kind/details.
  - `assertions.test.ts` — 4 assertions × pass + throw.
  - `check.test.ts` — 3 result-shape variants × ok + error.

- **W-3-7-17**: README — usage examples (guard at API boundary, assertion in repository); cross-link к ADR-007.

### Track 3: `@gertsai/audit-primitives` package (T3, F marker, Tier 2)

Fresh Tier 2 package per ADR-007 Decision C.

- **W-3-7-18**: Create `packages/audit-primitives/` skeleton — `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.mts`, `src/index.ts`, `src/__tests__/`, `LICENSE` symlink, `README.md`.
  - Zero peerDependencies (pure utility layer).
  - Strategy marker: **F**.

- **W-3-7-19**: Implement `Timestamp` interface + types — `src/types.ts`:
  - `Timestamp { seconds: number; nanoseconds: number }` (matches existing entity-audit shape).
  - `AuditMarks { created_at, updated_at, deleted_at? }` — generic mutation marks WITHOUT session-bound builders.

- **W-3-7-20**: Implement `TimestampProvider` + 2 default providers — `src/providers.ts`:
  - `interface TimestampProvider { now(): Timestamp }`
  - `dateTimestampProvider: TimestampProvider` — uses `Date.now()`; converts ms → seconds + nanoseconds.
  - `fixedTimestampProvider(ts: Timestamp): TimestampProvider` — for tests; always returns same ts.

- **W-3-7-21**: Implement conversion helpers — `src/convert.ts`:
  - `timestampToMillis(ts): number`
  - `timestampFromDate(d: Date): Timestamp`
  - `timestampFromMillis(ms: number): Timestamp`
  - `timestampCompare(a, b): -1 | 0 | 1`

- **W-3-7-22**: Tests (≥15 tests):
  - `types.test.ts` — Timestamp/AuditMarks shape conformance.
  - `providers.test.ts` — dateTimestampProvider produces seconds+nanoseconds; fixedTimestampProvider stable.
  - `convert.test.ts` — round-trip Date ↔ Timestamp ↔ ms; timestampCompare exhaustive.

- **W-3-7-23**: README — usage examples (TimestampProvider injection, conversion helpers); cross-link к ADR-007.

### Track 4: Phase B Integration (T4, team-lead solo)

- **W-3-7-24**: `pnpm install` → lockfile updated.
- **W-3-7-25**: `pnpm build` — 31 packages + m9s-example green (was 28 + m9s-example).
- **W-3-7-26**: `pnpm test` — target ≥4573 + new tests (runtime-context ~22 + session-guard ~16 + audit-primitives ~16 = ~54 added → target ≥4627).
- **W-3-7-27**: `pnpm typecheck` — 31 + m9s-example green.
- **W-3-7-28**: `pnpm run lint`, `pnpm run depcruise`, `pnpm publint` — all green.
- **W-3-7-29**: Update `CLAUDE.md` tier table 28 → 31; add 3 rows (1 Tier 4, 2 Tier 2).
- **W-3-7-30**: Create 3 changesets — minor bumps:
  - `.changeset/sprint-3-7-runtime-context.md`
  - `.changeset/sprint-3-7-session-guard.md`
  - `.changeset/sprint-3-7-audit-primitives.md`

### Track 5: Phase C+D Audit + Evidence (T5, team-lead solo)

- **W-3-7-31**: Post-Build fidelity audit — 3 reviewers parallel (runtime-context-fidelity, session-guard-fidelity, audit-primitives-fidelity).
- **W-3-7-32**: Address P0/P1 findings (if any).
- **W-3-7-33**: Create EVID-014 (verdict=supports, CL3, structured measurements).
- **W-3-7-34**: Activate SPEC-012.
- **W-3-7-35**: Single atomic commit `feat(monorepo): Sprint 3.7 — Wave 5 Phase 2`.
- **W-3-7-36**: Hindsight retain Group 39.

## Out of scope

- Sprint 3.8 (4 entity framework adapters parallel) — separate sprint.
- Sprint 3.9 (4 Orchestra HIGH candidates) — separate sprint.
- entity-audit E+ refactor (ADR-007 §C §5 optional) — defer if no value-add to Sprint 3.7 deliverables.
- HTTP framework adapter for runtime-context (Express/Fastify middleware) — Wave 6+.
- TypedToken<T> wrapper for ProviderContext — future enhancement (ADR-007 R-2 mitigation).
- v0.2.0 publish gate — separate explicit user confirmation.

## Strategy markers

| Track | Marker | Meaning |
|-------|--------|---------|
| T1 runtime-context | F | Fresh implementation |
| T2 session-guard | F | Fresh implementation |
| T3 audit-primitives | F | Fresh implementation |

## Data Models

### `@gertsai/runtime-context` types (per ADR-007 §A)

```typescript
export class RequestContext {
  constructor(init: RequestContextInit);
  get session(): Session;
  get sessionOptional(): Session | undefined;
  get tenantId(): string;
  get tenantIdOptional(): string | undefined;
  get correlationId(): string;
  get locale(): string;
  get features(): FeatureContext;
  get providers(): ProviderContext;
  $setSession(s: Session): void;
  $setTenantId(t: string): void;
  $setCorrelationId(c: string): void;
  $freeze(): void;
}

export interface RequestContextInit {
  readonly session?: Session;
  readonly tenantId?: string;
  readonly correlationId?: string;
  readonly locale?: string;
  readonly features?: FeatureContextInit;
  readonly providers?: ProviderContextInit;
}

export interface AuthContext {
  readonly session: Session;
  readonly tenantId: string;
  getOperatorStrict(): string;
}

export interface FeatureContext {
  isEnabled(flag: string): boolean;
  enabledFlags(): readonly string[];
}

export interface ProviderContext {
  get<T>(token: symbol | string): T;
  getOptional<T>(token: symbol | string): T | undefined;
}

export const requestContextIdentifier: symbol;
```

### `@gertsai/session-guard` types (per ADR-007 §B)

```typescript
export function isAuthenticated(session: Session | undefined): session is Session;
export function hasOperatorType(session: Session, type: OperatorType | OperatorType[]): boolean;
export function isInTenant(session: Session, tenantId: string): boolean;
export function isImpersonating(session: Session): boolean;

export function assertAuthenticated(session: Session | undefined): asserts session is Session;
export function assertOperatorType(session: Session, ...types: OperatorType[]): void;
export function assertSessionInTenant(session: Session, tenantId: string): void;
export function assertNotDestroyed(session: Session): void;

export function checkAuthenticated(session: Session | undefined): CheckResult<{ session: Session }>;
export function checkOperatorType(session: Session, ...types: OperatorType[]): CheckResult<{}>;
export function checkSessionInTenant(session: Session, tenantId: string): CheckResult<{}>;

type CheckResult<TOk> = { ok: true } & TOk | { ok: false; error: AppError };
```

### `@gertsai/audit-primitives` types (per ADR-007 §C)

```typescript
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
}

export interface AuditMarks {
  readonly created_at: Timestamp;
  readonly updated_at: Timestamp;
  readonly deleted_at?: Timestamp;
}

export interface TimestampProvider {
  now(): Timestamp;
}

export const dateTimestampProvider: TimestampProvider;
export function fixedTimestampProvider(ts: Timestamp): TimestampProvider;
export function timestampToMillis(ts: Timestamp): number;
export function timestampFromDate(d: Date): Timestamp;
export function timestampFromMillis(ms: number): Timestamp;
export function timestampCompare(a: Timestamp, b: Timestamp): -1 | 0 | 1;
```

## Acceptance Checklist

- [ ] T1 (W-3-7-1..10): `@gertsai/runtime-context` shipped — full skeleton + RequestContext class + AuthContext + FeatureContext + ProviderContext + 5 dedicated errors + /moleculer subpath + ≥20 tests + README.
- [ ] T2 (W-3-7-11..17): `@gertsai/session-guard` shipped — 4 predicates + 4 errors + 4 assertions + 3 check helpers + ≥15 tests + README.
- [ ] T3 (W-3-7-18..23): `@gertsai/audit-primitives` shipped — Timestamp + AuditMarks + TimestampProvider + 4 conversions + ≥15 tests + README.
- [ ] T4 (W-3-7-24..30): full repo verify green; CLAUDE.md tier table 28 → 31; 3 changesets created.
- [ ] T5 (W-3-7-31..36): post-Build audit done; EVID-014 active; SPEC-012 active; commit; Hindsight retain.

## Sprint 3.7 acceptance bundle

1. `@gertsai/runtime-context` published as 0.1.0 candidate (Tier 4).
2. `@gertsai/session-guard` published as 0.1.0 candidate (Tier 2).
3. `@gertsai/audit-primitives` published as 0.1.0 candidate (Tier 2).
4. Test count: 4573 → ≥4627 (~54 added).
5. Package count: 28 → 31.
6. Branch state: 1 atomic commit on `feat/sprint-3-7-wave-5-phase-2`.
7. ADR-007 invariants I-1..I-15 preserved (verified by audit).
8. ADR-006 Wave 5 Phase 1 invariants preserved (Shared Kernel pattern reused).
9. Wave 4 invariants (ADR-005) preserved.
10. Backward compat for `@gertsai/entity-audit` — 100% existing tests pass (E+ refactor optional, default OFF).

## Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | runtime-context-worker uses Moleculer in core (violation I-1) | depcruise rule; pre-Build audit catches; reviewer checklist |
| R-2 | session-guard-worker imports DI/Moleculer (violation I-5) | depcruise; pre-Build audit |
| R-3 | audit-primitives-worker imports session/storage-core (violation I-7) | depcruise; pre-Build audit; package.json strict zero peer-deps |
| R-4 | RequestContext lazy getter init order surprises consumer | tests + README order-of-init contract |
| R-5 | session-guard 4 dedicated errors collide with runtime-context errors | distinct kind values; reviewer cross-check |
| R-6 | Tier 4 placement violates depcruise hex rule | ADR-007 §D §3 + verify depcruise runs clean |
| R-7 | audit-primitives Timestamp shape conflicts with entity-audit's existing Timestamp | identical shape (verified); audit-primitives is upstream extracted |

## File ownership matrix (disjoint guarantee)

| Worker | Owns (read+write) | Reads only |
|--------|-------------------|------------|
| **runtime-context-worker** | `packages/runtime-context/**` (all NEW) | `packages/{errors,session,tenant-resolver,di}/**` (peer deps) |
| **session-guard-worker** | `packages/session-guard/**` (all NEW) | `packages/{errors,session}/**` (peer deps) |
| **audit-primitives-worker** | `packages/audit-primitives/**` (all NEW) | (none — zero deps) |
| **team-lead Phase B** | `CLAUDE.md`, `pnpm-lock.yaml`, `.changeset/sprint-3-7-*.md` (NEW × 3) | all package src |

**Conflict-free guarantee**: 0 shared files between Wave 1 workers.

## Implementation Plan — sequenced для AgentTeams

### Wave 1 (3∥ workers, parallel)

- **runtime-context-worker** (T1, W-3-7-1..10). Subagent: `agents-domain:typescript-pro`.
- **session-guard-worker** (T2, W-3-7-11..17). Subagent: `agents-domain:typescript-pro`.
- **audit-primitives-worker** (T3, W-3-7-18..23). Subagent: `agents-domain:typescript-pro`.

**Mitigation**: All 3 workers may import `@gertsai/errors` immediately (Sprint 3.6 published it). runtime-context also imports `@gertsai/session` + `@gertsai/tenant-resolver` (existing). audit-primitives has 0 peer deps. session-guard imports `@gertsai/session` + `@gertsai/errors`. No symlink race possible.

### Wave 2 (team-lead solo)

- **Phase B verify** (T4, W-3-7-24..30). Sequential. Touches CLAUDE.md, pnpm-lock.yaml, changesets.

### Wave 3 (3∥ reviewers, post-Build)

- **runtime-context-fidelity** reviewer.
- **session-guard-fidelity** reviewer.
- **audit-primitives-fidelity** reviewer.

Each writes findings (P0/P1/P2 + GO/NO-GO). Team-lead synthesizes converging findings (≥2 = mandatory; single-reviewer = P2).

### Wave 4 (team-lead solo)

- **Address P0/P1** (T5, W-3-7-32). If only P2 → KNOWN-ISSUES.
- **EVID-014 + activate + commit + Hindsight** (T5, W-3-7-33..36).

## Affected Files (predicted)

**Wave 1 creates**:
- `packages/runtime-context/**` (NEW — full package)
- `packages/session-guard/**` (NEW — full package)
- `packages/audit-primitives/**` (NEW — full package)

**Wave 2 (team-lead Phase B)**:
- `CLAUDE.md`
- `pnpm-lock.yaml`
- `.changeset/sprint-3-7-{runtime-context,session-guard,audit-primitives}.md` (NEW × 3)

**Wave 4 (team-lead Phase D)**:
- `.forgeplan/evidence/EVID-014-sprint-3-7-shipped.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5) | PRD | based_on |
| ADR-007 (Wave 5 Phase 2 placement) | ADR | based_on |
| ADR-006 (Wave 5 Phase 1 placement — errors+tenant-resolver) | ADR | informs (Shared Kernel pattern reused) |
| ADR-005 (Wave 4 storage architecture) | ADR | informs (Wave 4 invariants preserved) |
| ADR-004 (Foundation libs naming) | ADR | informs (Tier 4 placement rationale) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (subpath patterns for /moleculer) |
| EVID-013 (Sprint 3.6 shipped — Wave 5 Phase 1 baseline) | Evidence | informs (production-grade baseline) |

> **Next step**: SPEC-012 validate + activate → pre-Build audit (5 reviewers parallel) → Build (3 workers parallel) → Phase B verify → Phase C post-Build audit → Phase D EVID-014 + commit + Hindsight.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers delivered findings. Workers MUST follow Amendment 1 over original W-items where they disagree. Cross-reference: ADR-007 Amendment 1 (full rationale + invariants I-16..I-22).

### A1.1 — Wave 1 worker count: 4 (was 3)

NEW: **errors-patch-worker** added as 4th Wave 1 worker per ADR-007 Amendment 1.1.1. Refactors 10 error subclasses in `packages/errors/src/errors/*.ts` to be parametric on `D` with default matching original shape. Strictly additive backward-compat. Errors patch bumps 0.1.0 → 0.1.1. Errors-patch-worker FIRST (3 other workers may import parametric subclasses after errors-patch first commit).

### A1.2 — W-item supersessions (cross-reference ADR-007 Amendment 1)

**W-3-7-2 SUPERSEDED**: RequestContext class. Lazy fields use `private _x?: T` (NOT `_x!: T` definite-assignment). `correlationId` lazy generator uses `crypto.randomUUID()` per ADR-007 I-20. `$freeze()` MUST eager-init lazy fields per I-22 (not just mark immutable — actually evaluate lazy correlationId/locale/features/providers).

**W-3-7-4 SUPERSEDED**: Split into 2 factories per ADR-007 Amendment 1.2.9:
- `requireAuthContext(ctx: RequestContext): AuthContext` — `{ session, tenantId, getOperatorStrict(): string }`. `getOperatorStrict` returns `session.operatorUuid` (acting source).
- `requireAuthContextWithDataAccess(ctx: RequestContext): AuthContext & { dataAccessUuid: string }` — additionally requires `session.dataAccessUuid` set. Throws `DataAccessUuidMissingError` if not.

**W-3-7-6 SUPERSEDED**: ProviderContext signature MUST be `get<T>(token: symbol): T` and `getOptional<T>(token: symbol): T | undefined` per ADR-007 I-17. Reject string at runtime with TypeError. README documents `Symbol.for('@gertsai/<package>:<name>')` convention.

**W-3-7-7 SUPERSEDED**: 5 dedicated errors. After errors-patch lands (Wave 1 first commit), syntax `class SessionMissingError extends NotFoundError<{ contextField: 'session' }> {}` works:

```typescript
export class SessionMissingError extends NotFoundError<{ contextField: 'session' }> {}
export class TenantContextMissingError extends UnauthorizedError<{ reason: 'tenant-context-not-resolved' }> {}
export class ProviderNotFoundError extends NotFoundError<{ token: string }> {}
export class ContextFrozenError extends ConflictError<{ frozen: true }> {}
export class FeatureNotEnabledError extends ForbiddenError<{ flag: string }> {}
```

Each subclass declares `kind` constant from parent's ErrorKind (matches errors-patch parametric refactor — parent classes preserve their `kind` regardless of D specialization).

**W-3-7-8 SUPERSEDED**: `sessionMiddleware(opts)` factory MUST call `$freeze()` on RequestContext as final init step BEFORE invoking downstream handler per ADR-007 I-16. This eliminates TOCTOU between init mutators and request handler.

**W-3-7-12 SUPERSEDED**:
- `isInTenant(session, tenantId)` MUST return `false` if `session.tenantId === undefined` per ADR-007 I-18.
- `isImpersonating(session)` MUST throw `DataAccessUuidMissingError` if either `operatorUuid` or `dataAccessUuid` is empty/undefined per I-19. Returns `true` only if both non-empty AND distinct.

**W-3-7-13 SUPERSEDED**: 5 dedicated errors (was 4) per ADR-007 Amendment 1.1.2:
- `AuthenticationRequiredError extends UnauthorizedError<{ reason: 'session-required' }>` (NEW; thrown by `assertAuthenticated`)
- `DataAccessUuidMissingError extends UnauthorizedError<{ reason: 'data-access-uuid-missing' }>` (thrown by `assertHasDataAccessUuid` and `isImpersonating` per I-19)
- `OperatorTypeMismatchError extends ForbiddenError<{ expected: string[]; actual: string }>`
- `TenantScopeViolationError extends ForbiddenError<{ requested: string; sessionTenant: string }>`
- `SessionDestroyedError extends ConflictError<{ contextField: 'session' }>`

**W-3-7-14 SUPERSEDED**: assertion helpers split per ADR-007 Amendment 1.1.2:
- `assertAuthenticated(session)` throws `AuthenticationRequiredError`. Original "throws DataAccessUuidMissingError" was incorrect — wrong domain.
- `assertHasDataAccessUuid(session)` (NEW) throws `DataAccessUuidMissingError` if `session.dataAccessUuid` undefined/empty.
- `assertOperatorType` / `assertSessionInTenant` / `assertNotDestroyed` unchanged.

**W-3-7-19 / W-3-7-20 SUPERSEDED**: TimestampProvider pattern call-signature, NOT object-with-method per ADR-007 Amendment 1.1.3:

```typescript
export type TimestampProvider = () => Timestamp;

export const dateTimestampProvider: TimestampProvider; // returns Timestamp on each call
export function fixedTimestampProvider(ts: Timestamp): TimestampProvider; // returns frozen-ts function
```

Matches existing entity-audit shape — enables E+ refactor without breakage.

**W-3-7-23.5 NEW** (per ADR-007 Amendment 1.1.4): team-lead Phase B applies E+ refactor to `packages/entity-audit/`:
- Add peer-dep `@gertsai/audit-primitives: workspace:^`.
- Re-export `Timestamp / TimestampProvider / timestampToMillis / timestampFromDate / dateTimestampProvider` from `@gertsai/audit-primitives`.
- Add `@deprecated` JSDoc to entity-audit's own implementations (keep functional for backward compat).

5th changeset: `.changeset/sprint-3-7-entity-audit.md` patch bump (per ADR-007 Amendment 1.3.3 template).

**W-3-7-25 SUPERSEDED** (test count target): test count target updated. errors patch adds ~5 tests (parametric subclass tests). entity-audit E+ adds 0-3 tests (re-export verification). New target: **4573 → ≥4632** (~59 added across 4 workers + errors patch).

**W-3-7-30 SUPERSEDED**: 5 changesets (was 3) per ADR-007 Amendment 1.3.3 templates:
- `.changeset/sprint-3-7-runtime-context.md` (minor + 4 patch syncs)
- `.changeset/sprint-3-7-session-guard.md` (minor + 2 patch syncs)
- `.changeset/sprint-3-7-audit-primitives.md` (minor)
- `.changeset/sprint-3-7-errors-patch.md` (patch — parametric refactor)
- `.changeset/sprint-3-7-entity-audit.md` (patch — E+ re-export)

### A1.3 — File ownership matrix

Updated per ADR-007 Amendment 1.5:

| Worker | Owns |
|--------|------|
| errors-patch-worker | `packages/errors/src/errors/*.ts` (10 files), `packages/errors/CHANGELOG.md` |
| runtime-context-worker | `packages/runtime-context/**` (NEW) |
| session-guard-worker | `packages/session-guard/**` (NEW) |
| audit-primitives-worker | `packages/audit-primitives/**` (NEW) |
| team-lead Phase B | `packages/entity-audit/**` (E+ refactor), CLAUDE.md, lockfile, 5 changesets |

### A1.4 — README template per Amendment 1.3

All 3 NEW packages MUST follow Sprint 3.6 §template (errors README as reference). runtime-context README adds `## Init contract` subsection (lazy-getter order). runtime-context + session-guard README MUST include `## Security` subsection (per Amendment 1.3.1 specifications). audit-primitives Security section optional (pure data layer).

### A1.5 — Out of scope confirmations

- Internal Session $-mutator throw migration → Sprint 3.7.x.
- TypedToken<T> for ProviderContext → Wave 6+.
- HTTP framework adapter → Wave 6+.

### Amendment 1 changelog

Cross-reference ADR-007 Amendment 1 changelog table for full source attributions.






