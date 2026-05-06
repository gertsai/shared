---
depth: standard
id: ADR-007
kind: adr
last_modified_at: 2026-05-06T19:10:26.959525+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-006
  relation: refines
status: active
title: RuntimeContext design + Wave 5 Phase 2 extraction policy (session-guard, audit-primitives placement)
---

# ADR-007: RuntimeContext design + Wave 5 Phase 2 extraction policy

## Context

Wave 5 Phase 1 (Sprint 3.6, EVID-013) shipped 2 Tier 1 packages — `@gertsai/errors` (Shared Kernel) + `@gertsai/tenant-resolver` (composable strategy chain) — plus additive scoping in `@gertsai/session`. Foundation is in place. Wave 5 Phase 2 (Sprint 3.7) builds **runtime-glue** that combines errors + tenant-resolver + session into per-request context with type-safe lazy access.

Three architectural decisions need fixation BEFORE SPEC-012 implementation kicks off:

1. **`@gertsai/runtime-context` API surface**: какой shape у RequestContext (proxy vs class with lazy getters), как разделяются AuthContext / FeatureContext / ProviderContext, как Moleculer middleware factory строит контекст из ctx.meta + tenant-resolver + session, как достигается type-safety без `as string` коэрсии.

2. **`@gertsai/session-guard` API surface**: какие guards / predicates / errors extract'ить из session-related patterns. Эта библиотека — Tier 2 (depends on session + errors). Что входит: guard predicates (isAuthenticated, hasOperatorType, isInScope), 4 dedicated errors (DataAccessUuidMissingError, OperatorTypeMismatchError, etc.), invariant checks для использования в repository / use-case layer.

3. **`@gertsai/audit-primitives` API surface**: что выделить из entity-audit как "primitive" — generic Timestamp implementations (Date, Firestore-shape), generic UpdateAction enum patterns, helper `now()` / `tsCompare()` functions. NOT to break entity-audit (which depends on session for builder context); audit-primitives is **upstream** (no session dep) — entity-audit will gain a peer-dep on it as part of this sprint via additive refactor.

4. **Wave 5 Phase 2 invariants**: subpath isolation (Moleculer adapter в /moleculer subpath only), backward-compat for entity-audit, Tier 4 placement rationale (runtime-context is Tier 4 — composes Tier 1 + Tier 2 + transport adapters).

Без явного ADR на эти решения — workers Sprint 3.7 будут импровизировать; pattern Sprint 3.6 audit показал ценность фиксации DECISION на каждый ключевой API surface point ДО Build.

## Decision

### Decision A — `@gertsai/runtime-context` design

`@gertsai/runtime-context` (Sprint 3.7) ships **lazy-getter RequestContext** + composable AuthContext / FeatureContext / ProviderContext interfaces + DI-aware factory + `/moleculer` subpath с middleware. Tier 4 placement (composes Tier 1 + Tier 2 + transport).

**Key design choices**:

1. **`RequestContext` — class with lazy private getters**:
   ```typescript
   export class RequestContext {
     private _session?: Session;
     private _tenantId?: string;
     private _correlationId?: string;
     // ... etc

     constructor(private readonly init: RequestContextInit);

     // Lazy getters — compute / read on first access
     get session(): Session;          // throws SessionMissingError if not initialized
     get sessionOptional(): Session | undefined;
     get tenantId(): string;          // throws if not resolved
     get tenantIdOptional(): string | undefined;
     get correlationId(): string;     // generates UUID if not set, then memoizes
     get locale(): string;            // defaults to 'en' if not set
     get features(): FeatureContext;
     get providers(): ProviderContext;

     // Mutation
     $setSession(s: Session): void;
     $freeze(): void;                 // mark immutable; subsequent mutations throw
   }
   ```

2. **`RequestContextInit` shape**:
   ```typescript
   export interface RequestContextInit {
     readonly session?: Session;
     readonly tenantId?: string;
     readonly correlationId?: string;
     readonly locale?: string;
     readonly features?: FeatureContextInit;
     readonly providers?: ProviderContextInit;
     readonly metadata?: Readonly<Record<string, unknown>>;
   }
   ```

3. **`AuthContext` interface** (subset of RequestContext exposed in security-sensitive code paths):
   ```typescript
   export interface AuthContext {
     readonly session: Session;
     readonly tenantId: string;
     getOperatorStrict(): string;
   }
   ```

4. **`FeatureContext` interface** — feature-flag aware lazy access:
   ```typescript
   export interface FeatureContextInit {
     readonly enabled?: ReadonlySet<string>;
     readonly flagProvider?: (flagName: string) => boolean;
   }

   export interface FeatureContext {
     isEnabled(flag: string): boolean;
     enabledFlags(): readonly string[];
   }
   ```

5. **`ProviderContext` interface** — DI-aware lazy access to providers:
   ```typescript
   export interface ProviderContextInit {
     readonly resolver?: <T>(token: symbol | string) => T | undefined;
     readonly bindings?: ReadonlyMap<symbol | string, unknown>;
   }

   export interface ProviderContext {
     get<T>(token: symbol | string): T;             // throws ProviderNotFoundError
     getOptional<T>(token: symbol | string): T | undefined;
   }
   ```

6. **5 errors** (re-exported from `@gertsai/errors` subclasses):
   - `SessionMissingError extends NotFoundError<{ contextField: 'session' }>`
   - `TenantContextMissingError extends UnauthorizedError<{ reason: 'tenant-context-not-resolved' }>`
   - `ProviderNotFoundError extends NotFoundError<{ token: string }>`
   - `ContextFrozenError extends ConflictError<{ contextField: string }>`
   - `FeatureNotEnabledError extends ForbiddenError<{ flag: string }>`

7. **Subpath `/moleculer`** ships:
   - `sessionMiddleware(opts)` factory — Moleculer middleware reads ctx.meta.tenantId/etc, composes RequestContext per-request, attaches to `ctx.locals.requestContext` (or via Symbol-key for type-safety).
   - `tenantMiddleware(resolver)` re-exported from `@gertsai/tenant-resolver/moleculer` for composition convenience.
   - Peer-optional `moleculer` import via `import type` only.

8. **No HTTP framework runtime imports in core**.

9. **DI integration** via storageProviderIdentifier-style symbol token:
   ```typescript
   export const requestContextIdentifier = Symbol.for('@gertsai/runtime-context:RequestContext');
   ```

### Decision B — `@gertsai/session-guard` design

`@gertsai/session-guard` (Sprint 3.7) ships **guards / predicates / dedicated errors** for session-related invariant checks. Tier 2 (depends on session + errors). NO new fields on Session — strictly external helpers.

**Key design choices**:

1. **Guard predicates** (root export):
   ```typescript
   export function isAuthenticated(session: Session | undefined): session is Session;
   export function hasOperatorType(session: Session, type: OperatorType | OperatorType[]): boolean;
   export function isInTenant(session: Session, tenantId: string): boolean;
   export function isImpersonating(session: Session): boolean;
   ```

2. **4 dedicated errors** (extending `@gertsai/errors`):
   - `DataAccessUuidMissingError extends UnauthorizedError<{ reason: 'data-access-uuid-missing' }>`
   - `OperatorTypeMismatchError extends ForbiddenError<{ expected: string[]; actual: string }>`
   - `TenantScopeViolationError extends ForbiddenError<{ requested: string; sessionTenant: string }>`
   - `SessionDestroyedError extends ConflictError<{ contextField: 'session' }>`

3. **Assertion helpers** (throw on fail):
   ```typescript
   export function assertAuthenticated(session: Session | undefined): asserts session is Session;
   export function assertOperatorType(session: Session, ...types: OperatorType[]): void;
   export function assertSessionInTenant(session: Session, tenantId: string): void;
   export function assertNotDestroyed(session: Session): void;
   ```

4. **Result-shape variants**:
   ```typescript
   export function checkAuthenticated(session: Session | undefined): { ok: true; session: Session } | { ok: false; error: DataAccessUuidMissingError };
   ```

5. **NO Moleculer-specific code** — pure session manipulation. Consumers compose with runtime-context for transport binding.

### Decision C — `@gertsai/audit-primitives` design

`@gertsai/audit-primitives` (Sprint 3.7) ships **generic timestamp + audit primitives** decoupled from entity-audit. Tier 2 (zero internal deps; entity-audit will gain peer-dep on it).

**Key design choices**:

1. **`Timestamp` interface** (already exists in entity-audit; extracted upstream):
   ```typescript
   export interface Timestamp {
     readonly seconds: number;
     readonly nanoseconds: number;
   }
   ```

2. **`TimestampProvider` interface + 2 default providers**:
   ```typescript
   export interface TimestampProvider {
     now(): Timestamp;
   }

   export const dateTimestampProvider: TimestampProvider;       // uses Date.now()
   export const fixedTimestampProvider: (ts: Timestamp) => TimestampProvider; // for tests
   ```

3. **Conversion helpers**:
   ```typescript
   export function timestampToMillis(ts: Timestamp): number;
   export function timestampFromDate(d: Date): Timestamp;
   export function timestampFromMillis(ms: number): Timestamp;
   export function timestampCompare(a: Timestamp, b: Timestamp): -1 | 0 | 1;
   ```

4. **`AuditMarks` interface** — generic mutation marks WITHOUT session-bound builders:
   ```typescript
   export interface AuditMarks {
     readonly created_at: Timestamp;
     readonly updated_at: Timestamp;
     readonly deleted_at?: Timestamp;
   }
   ```

5. **Re-export from entity-audit**:
   - entity-audit MAY re-export from audit-primitives for backward-compat (additive only). entity-audit's existing `MutationMarks` (with `created_by_uuid`) extends `AuditMarks` from audit-primitives.

6. **Backward-compat invariant**: entity-audit's existing public surface preserved. audit-primitives is upstream pure data layer — no session, no DI.

### Decision D — Wave 5 Phase 2 extraction policy (extends ADR-006 Decision D)

Применимо к Sprint 3.7. Дополняет ADR-006 Decision D Wave 5 patterns.

1. **Subpath isolation for runtime adapters**:
   - runtime-context: Moleculer adapter в `/moleculer` subpath, peer-optional dependency.
   - session-guard: NO transport adapters (pure session helpers).
   - audit-primitives: NO transport adapters (pure data layer).

2. **No Moleculer / HTTP framework runtime imports** in `@gertsai/runtime-context` core. Adapters strictly in subpaths, peer-optional.

3. **NEW Tier 4 placement** for runtime-context — composes Tier 1 (errors, session, tenant-resolver, audit-primitives) + Tier 2 (session-guard, di) + transport. First Tier 4 package outside `@gertsai/api-core` family. Documented in CLAUDE.md tier table per ADR-004 I-2.

4. **Strategy markers** (per ADR-004 + ADR-006 §D §4):
   - **F**: Fresh implementation for all 3 new packages.
   - **E+**: Enhancement of existing entity-audit (additive peer-dep on audit-primitives + re-export). Optional — entity-audit can stay independent if no value-add.

5. **Shared Kernel pattern** (ADR-006 §D §6) extends to Wave 5 Phase 2: runtime-context errors are subclasses of `@gertsai/errors` taxonomy — taxonomy stays single source of truth. session-guard errors same.

6. **DI-friendly construction**: RequestContext + ProviderContext are designed for `@gertsai/di` integration (consumers inject providers via DI container). audit-primitives.TimestampProvider also DI-injectable. Sprint 3.7 does NOT modify `@gertsai/di` — it just consumes the existing DI surface.

7. **Reuse Wave 4/5 extraction principles** (ADR-005 Decision B + ADR-006 §D):
   - 1:1 mirror Orchestra patterns + strip backend coupling.
   - Strip framework coupling (NO concrete Moleculer in core).
   - Generic over implementation.
   - Tests lifted 1:1 + replace fixtures with in-memory equivalents.
   - SPDX header on each new file.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| A1 — RequestContext as Proxy<{}> with auto-lazy field generation | Rejected | Loses type-safety; consumers can't navigate types in IDE; Proxy adds complexity for minor LOC savings. |
| A2 — RequestContext as plain interface (no class) | Rejected | Lazy getter semantics + freeze invariant + memoization need class state. Interface alone is shape-only. |
| **A3 — RequestContext class with lazy private getters + freeze** | **Chosen** | Type-safe; clean DX; freeze guarantees immutability post-init. |
| B1 — session-guard as static module of session package | Rejected | Couples invariant checks to Session class; consumers can't extend without forking session. |
| B2 — session-guard with NO dedicated errors (reuse @gertsai/errors directly) | Rejected | Loses semantic clarity at catch-site (consumers want `instanceof DataAccessUuidMissingError`, not `instanceof UnauthorizedError && err.details.reason === 'data-access-uuid-missing'`). |
| **B3 — session-guard external + 4 dedicated errors extending @gertsai/errors** | **Chosen** | Clean DX; errors are subclasses (taxonomy preserved); guards are pure functions (testable, composable). |
| C1 — audit-primitives merge into entity-audit (no extraction) | Rejected | Tier-3 entity-audit drags session dependency into pure data layer (Timestamp). Some consumers want only Timestamp without session. |
| C2 — audit-primitives full re-export of entity-audit | Rejected | Just renames; doesn't decouple session dep. |
| **C3 — audit-primitives upstream pure data layer; entity-audit gains peer-dep additive** | **Chosen** | Decouples session from Timestamp utilities; backward-compat preserved; future Postgres CDC adapter can use audit-primitives without session. |
| D1 — Skip subpath isolation for runtime-context Moleculer | Rejected | Forces consumers без Moleculer to pay runtime cost. ADR-006 pattern reuse. |
| **D2 — Subpath isolation per transport** | **Chosen** | Pattern continuity; consumers opt-in. |

## Consequences

### Positive

- `@gertsai/runtime-context` becomes single composition point для request-scoped context across Moleculer / HTTP / future transports.
- Lazy getters allow type-safe access без runtime cost для unused fields.
- session-guard centralizes invariant checks; downstream consumers stop reinventing `if (!session.dataAccessUuid) throw ...` at every call-site.
- audit-primitives decouples Timestamp utilities from session — pure data layer reusable in CDC bridges, replication tools, etc.
- 4 dedicated errors per session-guard improve debug ergonomics vs generic `UnauthorizedError`.
- DI-aware ProviderContext unblocks Sprint 3.8 framework adapters (each adapter resolves via ProviderContext in their lifecycle).

### Negative (trade-offs)

- 3 new packages add ~1500-2000 LOC to monorepo. Manageable; pattern Sprint 3.6 demonstrated workspace handles 28+ packages cleanly.
- runtime-context Tier 4 placement is first non-api-core Tier 4 — workers must understand tier semantics. ADR-007 §D §3 documents.
- audit-primitives optional re-export from entity-audit creates 2 import paths for Timestamp (audit-primitives root or entity-audit re-export). Mitigation: README cross-link; entity-audit JSDoc steers new code to audit-primitives.
- session-guard 4 dedicated errors increase surface; alternative (no dedicated errors) was rejected for DX.

### Risks

- **R-1**: Lazy getters introduce hidden order-of-init bugs (e.g. `ctx.session` accessed before `ctx.$setSession(s)`). Mitigation: throw `SessionMissingError` on undefined access; eager-init test fixture; `freeze()` after init.
- **R-2**: ProviderContext.get<T>() type-erasure — runtime token resolution returns `unknown`. Mitigation: typed token wrapper `defineToken<T>(name): TypedToken<T>` (future enhancement); for now, consumers cast at consumption site.
- **R-3**: session-guard hasOperatorType / assertOperatorType assume OperatorType is union string — what if Session impersonation sets wrong operator? Mitigation: tests cover impersonation flow; assertOperatorType only validates current operator (post-impersonation source-of-truth).
- **R-4**: audit-primitives Timestamp interface (seconds + nanoseconds) is Firestore-influenced. SQL adapters store as `TIMESTAMPTZ`. Mitigation: `timestampToMillis` + adapter-side conversion; documented edge cases.
- **R-5**: entity-audit additive E+ marker on peer-dep audit-primitives — could break downstream if peer-dep mismatch. Mitigation: `peer-dep workspace:^` matches; audit-primitives stays at 0.1.0 lockstep with entity-audit version.

## Invariants

I-1: `@gertsai/runtime-context` core (root export) MUST NOT import HTTP framework runtime (express/fastify/koa/hono) or Moleculer (`moleculer` / `moleculer-web`). Status codes vendored from `@gertsai/errors` for transport mapping.

I-2: `@gertsai/runtime-context/moleculer` subpath MAY import `moleculer` as peer-optional dependency via `import type` only at module level; runtime usage only after consumer explicitly imports.

I-3: `RequestContext` MUST throw appropriate `@gertsai/errors` subclasses (or runtime-context dedicated subclasses) on invalid access. NO returning of generic Error.

I-4: `RequestContext.$freeze()` MUST make subsequent mutations throw `ContextFrozenError`. Once frozen, getters work; mutators throw.

I-5: `@gertsai/session-guard` core (root export) MUST NOT import Moleculer / HTTP framework / DI framework. Pure session manipulation only.

I-6: `@gertsai/session-guard` errors MUST be subclasses of `@gertsai/errors` AppError taxonomy (preserves Shared Kernel per ADR-006 §D §6).

I-7: `@gertsai/audit-primitives` MUST NOT import session, di, storage-core, or any other internal `@gertsai/*` package. Pure data + utility layer.

I-8: `@gertsai/entity-audit` existing public API surface MUST be preserved. Sprint 3.7 changes are optional E+ refactor — additive peer-dep on audit-primitives + re-exports. NO breaking.

I-9: Tier 4 placement of runtime-context MUST be documented in CLAUDE.md tier table per ADR-004 I-2.

I-10: All new `.ts` files in Sprint 3.7 MUST start with `// SPDX-License-Identifier: Apache-2.0` per ADR-005 I-5 + ADR-006 I-9.

I-11: Per-package strategy markers (F / E+) MUST appear in SPEC-012 prior to Build phase.

I-12: `@gertsai/runtime-context.RequestContext` operator-related getters MUST honor `@gertsai/session.dataAccessUuid` semantics (i.e., AI agent acting on behalf — `dataAccessUuid` MAY differ from `operatorUuid`). Lazy getters defer to Session getters.

I-13: `@gertsai/session-guard.assertOperatorType` MUST validate current `session.operatorType` (post-impersonation source-of-truth), NOT pre-impersonation snapshot.

I-14: `@gertsai/audit-primitives.Timestamp` MUST be backend-agnostic — `seconds` + `nanoseconds` shape works for Firestore Timestamp, SQL TIMESTAMPTZ (via conversion), in-memory Date (via conversion). Adapter-side conversion documented.

I-15: `@gertsai/runtime-context/moleculer.sessionMiddleware` MUST attach RequestContext to `ctx.locals` (NOT `ctx.meta`) per Moleculer convention (locals = per-request-scope; meta = serialized cross-broker).

## Evidence Requirements

- **E-1**: SPEC-012 (Sprint 3.7) активирован с per-package strategy markers (F / F / F + E+ if entity-audit refactor included) + cross-reference на ADR-007.
- **E-2**: `pnpm pack --dry-run` для каждого нового Wave 5 Phase 2 package — 0 leak.
- **E-3**: `grep -rE 'express|fastify|koa|hono|moleculer' packages/{runtime-context,session-guard,audit-primitives}/src` returns 0 matches in core; `/moleculer` subpath allows `moleculer` via `import type`.
- **E-4**: `@gertsai/entity-audit` regression suite — 100% existing tests pass after optional E+ refactor (or entity-audit untouched).
- **E-5**: `@gertsai/runtime-context` test coverage — RequestContext lazy getters / freeze / 5 dedicated errors; AuthContext / FeatureContext / ProviderContext composition; sessionMiddleware factory.
- **E-6**: `@gertsai/session-guard` test coverage — 4 guards × happy/null/edge + 4 dedicated errors + assertion helpers + result-shape variants.
- **E-7**: `@gertsai/audit-primitives` test coverage — TimestampProvider × 2 implementations + 4 conversion helpers + AuditMarks shape.
- **E-8**: Sprint 3.7 atomic commit on `feat/sprint-3-7-wave-5-phase-2` branch.

## Implementation Plan

### Phase 0: Pre-conditions
- [ ] **0.1** PRD-003 active (Sprint 3.6 EVID-013 closed).
- [ ] **0.2** ADR-007 active.

### Phase 1: SPEC-012 + Pre-Build audit (Sprint 3.7)
- [ ] **1.1** SPEC-012 draft с W-3-7-1..N items + per-package strategy markers (F / F / F).
- [ ] **1.2** Pre-Build audit (5 reviewers parallel) — architect / security / ddd / typescript-pro / docs.
- [ ] **1.3** Address P0/P1 audit findings via Amendment 1.
- [ ] **1.4** SPEC-012 validate + activate.

### Phase 2: Sprint 3.7 Build (3 parallel workers + team-lead)
- [ ] **2.1** AgentTeams Wave 1: 3 workers (runtime-context / session-guard / audit-primitives).
- [ ] **2.2** Team-lead Phase B: integrated verify.
- [ ] **2.3** CLAUDE.md tier table 28 → 31; 3 changesets.

### Phase 3: Post-Build audit + Activate
- [ ] **3.1** Post-Build fidelity audit (3 reviewers parallel).
- [ ] **3.2** Address P0/P1 findings (if any).
- [ ] **3.3** EVID-014 active с structured measurements.
- [ ] **3.4** SPEC-012 active.
- [ ] **3.5** Single atomic commit.
- [ ] **3.6** Hindsight retain Group 39.

## Affected Files (predicted, Sprint 3.7 only)

- `packages/runtime-context/**` (NEW Tier 4)
- `packages/session-guard/**` (NEW Tier 2)
- `packages/audit-primitives/**` (NEW Tier 2)
- `packages/entity-audit/**` (optional E+ — peer-dep audit-primitives + re-exports; non-breaking)
- `CLAUDE.md` (tier table update 28 → 31; new Tier 4 row)
- `pnpm-lock.yaml`
- `.changeset/sprint-3-7-runtime-context.md` (NEW — minor bump)
- `.changeset/sprint-3-7-session-guard.md` (NEW — minor bump)
- `.changeset/sprint-3-7-audit-primitives.md` (NEW — minor bump)
- `.changeset/sprint-3-7-entity-audit.md` (NEW — patch bump if E+ refactor; skip if untouched)
- `.forgeplan/evidence/EVID-014-sprint-3-7-shipped.md` (NEW)

## Admissibility

NOT admissible под этим ADR:

- NOT: Импортировать Moleculer / HTTP framework runtime в `@gertsai/runtime-context` core.
- NOT: Импортировать Moleculer / HTTP / DI framework в `@gertsai/session-guard`.
- NOT: Импортировать session / di / storage-core / any internal in `@gertsai/audit-primitives`.
- NOT: Менять existing `@gertsai/entity-audit` public API surface (breaking).
- NOT: Returning generic Error from RequestContext / session-guard — MUST use AppError subclass.
- NOT: Skip Tier 4 placement documentation in CLAUDE.md.
- NOT: Use `ctx.meta.requestContext` for Moleculer middleware attachment — MUST use `ctx.locals` per I-15.
- NOT: RequestContext direct mutation post-`$freeze()`.

## Rollback Plan

**Triggers**:
- Sprint 3.7 Phase A reveals lazy-getter API too costly (excessive throws on init order) → switch to plain object factory + freeze; deprecate class-based.
- Phase A reveals session-guard 4 dedicated errors confuse consumers (vs generic) → demote to plain assertion functions returning AppError directly.
- Phase A reveals audit-primitives extraction breaks entity-audit downstream → revert peer-dep refactor; audit-primitives stays standalone with no entity-audit interaction.
- Phase B reveals depcruise rule conflict (Tier 4 → Tier 1 dep direction) → review ADR-002 hex enforcement; possibly defer to ADR-007.1 amendment.

**Steps**:
1. Open ADR-007 amendment.
2. Если runtime-context API rolled back: swap class for factory; ship 0.1.x patch.
3. Если session-guard errors rolled back: deprecate dedicated errors; switch to AppError direct.
4. Если audit-primitives entity-audit interaction breaks: `git revert` entity-audit changes; audit-primitives stays standalone.
5. Если depcruise conflict: amend ADR-002 hex rules to permit Tier 4 → Tier 1.

**Blast Radius**: low. Wave 5 Phase 2 packages еще unpublished во время потенциального rollback. After publish — semver minor break possible.

## Affected Files

| File | Baseline Hash |
|------|---------------|
| packages/{runtime-context,session-guard,audit-primitives}/** | (NEW — no baseline) |
| packages/entity-audit/** | post-Sprint 3.4 (optional E+ in Sprint 3.7) |
| CLAUDE.md | post-Sprint 3.6 (commit `6debc97`) |

## AI Guidance

> Правила для AI-агентов при работе с ADR-007 + SPEC-012:

- **runtime-context-worker**: НЕ импортируй Moleculer в core. Subpath `/moleculer` only. Lazy getters throw `@gertsai/errors` subclasses on invalid access.
- **session-guard-worker**: STRICTLY external — НЕ менять existing Session API. 4 dedicated errors extend `@gertsai/errors` taxonomy. Assertion helpers throw, predicate functions return boolean.
- **audit-primitives-worker**: ZERO internal deps. Pure utility + interface layer. NO session, NO storage-core. Existing entity-audit `MutationMarks` is reference for the new `AuditMarks` interface (latter is subset / generic version).
- При conflict с ADR-007 invariants: STOP, raise to user, suggest amendment vs new ADR.
- Tests: используй InMemory fixtures (Wave 4); не завись от network.
- При создании нового файла: SPDX header.
- Subpath imports: pattern Sprint 3.0.1 F-4 + Sprint 3.6 errors/tenant-resolver template.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5 — Errors + Runtime Context + Framework Adapters) | PRD | based_on |
| ADR-006 (Wave 5 Phase 1 — errors + tenant-resolver placement) | ADR | refines (Wave 5 Phase 2 extends Decision D — subpath isolation, Shared Kernel reuse) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | informs (Wave 4 invariants preserved) |
| ADR-004 (Foundation libs naming + extraction strategy) | ADR | refines (Tier 4 placement rationale) |
| ADR-003 (Platform Runtime Boundaries) | ADR | refines (subpath patterns for /moleculer in runtime-context) |
| ADR-002 (Hex layer enforcement) | ADR | informs (Tier 4 → Tier 1 dep direction permitted) |
| EVID-013 (Sprint 3.6 shipped — Wave 5 Phase 1 baseline) | Evidence | based_on (Wave 5 Phase 1 production-grade baseline) |

> **Next step**: Activate ADR-007 → SPEC-012 (Sprint 3.7 Shape) → pre-Build audit → Build → post-Build audit → EVID-014 → Activate.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers (architect, security, ddd, typescript, docs) delivered convergent + substantive findings. The following amendments **supersede** the original Decisions where they conflict. Workers in Sprint 3.7 Build phase MUST follow Amendment 1 over original text where they disagree.

### A1.1 — Convergent / impl-blocking fixes

**A1.1.1 — `@gertsai/errors` subclasses MUST become parametric** (typescript P0-1 + ddd P1-2 [different angle]).

Sprint 3.6 shipped errors with **fixed** generic D on subclasses (e.g. `class NotFoundError extends AppError<{ resourceType: string; resourceId: string }>`). Sprint 3.7 dedicated errors syntax `extends NotFoundError<{ contextField: 'session' }>` does NOT compile (TS2315 — "type is not generic").

**Fix (in-flight Sprint 3.7 errors patch — additive backward-compat)**:

Refactor 10 error subclasses in `packages/errors/src/errors/*.ts` to be parametric with default D matching current shape:

```typescript
// packages/errors/src/errors/not-found.ts (after patch)
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class NotFoundError<
  D extends Record<string, unknown> = { resourceType: string; resourceId: string },
> extends AppError<D> {
  readonly kind = ErrorKind.NOT_FOUND;
}
```

All 10 subclasses follow same pattern. Default `D` preserves Sprint 3.6 shape — existing call sites compile unchanged. Sprint 3.7 dedicated errors specialize:

```typescript
class SessionMissingError extends NotFoundError<{ contextField: 'session' }> {}
class TenantContextMissingError extends UnauthorizedError<{ reason: 'tenant-context-not-resolved' }> {}
// ... etc 7 more
```

**Bumps**: `@gertsai/errors` patch 0.1.0 → 0.1.1 (additive — default D preserves backward compat). 4th changeset added to Sprint 3.7 bundle. Add `errors-patch-worker` as 4th Wave 1 worker in SPEC-012.

**A1.1.2 — `assertAuthenticated` MUST throw `AuthenticationRequiredError`, NOT `DataAccessUuidMissingError`** (ddd P1-2).

`DataAccessUuidMissingError` is for **scoping** failures (AI agent on behalf of user, no data access UUID set). `assertAuthenticated` checks **identity** (Session exists at all). Different domain.

**Fix**: rename / split. `@gertsai/session-guard` introduces:
- `AuthenticationRequiredError extends UnauthorizedError<{ reason: 'session-required' }>` — thrown by `assertAuthenticated`.
- `DataAccessUuidMissingError extends UnauthorizedError<{ reason: 'data-access-uuid-missing' }>` — thrown by **separate** `assertHasDataAccessUuid` helper (added per A1.1.2).

Update SPEC-012 W-3-7-13 to add 5 errors (was 4): + `AuthenticationRequiredError`. W-3-7-14 split: `assertAuthenticated` (throws AuthenticationRequiredError) and new `assertHasDataAccessUuid` (throws DataAccessUuidMissingError).

**A1.1.3 — `TimestampProvider` shape MUST be call-signature, not object-with-method** (architect P1-1).

Existing `packages/entity-audit/src/timestamp.ts:14`: `export type TimestampProvider = () => Timestamp` — call-signature function alias.

ADR-007 §C §2 + SPEC-012 W-3-7-20 originally specified `interface TimestampProvider { now(): Timestamp }` (object-with-method). Shape collision blocks E+ refactor (entity-audit re-export from audit-primitives).

**Fix**: `audit-primitives` ships call-signature pattern (matches entity-audit):

```typescript
export type TimestampProvider = () => Timestamp;

export const dateTimestampProvider: TimestampProvider; // returns Timestamp on each call
export function fixedTimestampProvider(ts: Timestamp): TimestampProvider; // returns frozen-ts function
```

Update SPEC-012 §"Data Models" → `audit-primitives` block.

**A1.1.4 — `audit-primitives` E+ entity-audit re-export elevated from optional to MANDATORY** (architect P1-2 + ddd P1-3).

Reason: entity-audit already exports `timestampToMillis` / `timestampFromDate` with identical signatures. Without E+ refactor, two copies live in monorepo with structural-equivalent but nominally-distinct types — drift risk.

**Fix**: Sprint 3.7 entity-audit gains additive peer-dep on `@gertsai/audit-primitives`; entity-audit re-exports `Timestamp` / `TimestampProvider` / `timestampToMillis` / `timestampFromDate` / `dateTimestampProvider` from audit-primitives. Existing entity-audit own implementations DEPRECATED via JSDoc but kept for backward compat (no removal until v0.2.x).

5th changeset added to Sprint 3.7 bundle: `@gertsai/entity-audit` patch (E+ refactor). entity-audit owner — team-lead Phase B (audit-primitives-worker creates audit-primitives; team-lead orchestrates entity-audit re-export to keep file-ownership boundary clean).

### A1.2 — Substantive single-reviewer fixes (will address)

**A1.2.1 — `sessionMiddleware` MUST auto-`$freeze()` post-init** (security P0-1, TOCTOU CWE-367).

Original I-4: freeze invariant exists but timing unspecified. Without auto-freeze in middleware, request handler can mutate context mid-flight → race conditions.

**Fix**: NEW invariant **I-16**:

> I-16: `@gertsai/runtime-context/moleculer.sessionMiddleware` MUST call `$freeze()` on RequestContext AFTER all init (session attach, tenantId set, correlationId set, locale, features, providers) and BEFORE invoking downstream handler. Subsequent mutation attempts throw `ContextFrozenError`.

W-3-7-8 amended: `sessionMiddleware` calls `$freeze()` as final init step.

**A1.2.2 — `ProviderContext.get<T>(token)` MUST restrict token to `symbol`** (security P0-2, CWE-843 type confusion).

Original `get<T>(token: symbol | string)` allows user-controlled string token → wrong-type provider lookup → privilege escalation in DI-driven auth flow.

**Fix**: NEW invariant **I-17**:

> I-17: `ProviderContext.get<T>(token)` and `getOptional<T>(token)` MUST accept ONLY `symbol` tokens. Strings rejected at runtime with TypeError. Consumers requiring string-keyed providers MUST wrap via `Symbol.for(name)` at call site (compile-time-known names only). README documents convention.

W-3-7-6 amended: signature changes to `get<T>(token: symbol): T`.

**A1.2.3 — `isInTenant` MUST require non-undefined session.tenantId** (security P0-3, CWE-285 silent bypass).

Original: `isInTenant(session, tenantId)` uses strict equality. Both undefined → returns true → cross-tenant leak.

**Fix**: NEW invariant **I-18**:

> I-18: `@gertsai/session-guard.isInTenant(session, tenantId)` MUST return `false` if `session.tenantId === undefined` regardless of `tenantId` argument. Same applies to `assertSessionInTenant` (throws TenantScopeViolationError) and `checkSessionInTenant`.

W-3-7-12 / W-3-7-14 / W-3-7-15 amended: explicit undefined-guard.

**A1.2.4 — `isImpersonating` MUST check both UUIDs are non-empty strings** (security P0-4).

Original: `dataAccessUuid !== operatorUuid`. Both empty → returns false → audit miss.

**Fix**: NEW invariant **I-19**:

> I-19: `@gertsai/session-guard.isImpersonating(session)` MUST throw `DataAccessUuidMissingError` (existing error) if either `session.operatorUuid` OR `session.dataAccessUuid` is empty/undefined. Returns `true` only if both non-empty AND distinct.

W-3-7-12 amended: explicit empty-string + undefined guard.

**A1.2.5 — `correlationId` lazy generation MUST use `crypto.randomUUID()`** (security P1-1, CWE-330).

Sprint 3.7 RequestContext lazy-generates correlationId on first access. Source must be cryptographic.

**Fix**: NEW invariant **I-20**:

> I-20: `RequestContext.correlationId` lazy generator MUST use `crypto.randomUUID()` (Node ≥22 LTS guaranteed). NOT `Math.random()`-based UUIDs.

W-3-7-2 amended.

**A1.2.6 — `dedicated errors MUST mark `safeForTransport`** (security P1-3, CWE-209 leak).

ProviderNotFoundError details has internal token names; OperatorTypeMismatchError has internal type strings. Without redaction these leak via HTTP response.

**Fix**: NEW invariant **I-21**:

> I-21: All 5 dedicated errors in runtime-context + 5 in session-guard (after A1.1.2 split — was 4) MUST reuse `@gertsai/errors/http.appErrorToHttpResponse` redaction (Sprint 3.6 REDACTION_KEYS list applies). Additionally, errors with sensitive `details` (token names, operator types) MAY override `details` redaction by including a `redactedFields: readonly string[]` static property.

W-3-7-7 / W-3-7-13 amended: errors export safeForTransport metadata if needed.

**A1.2.7 — `$freeze()` MUST eager-init lazy fields** (ddd P1-1).

Original: $freeze marks immutable, but lazy `correlationId` getter mutates state on first access AFTER freeze → either silent inconsistency or ContextFrozenError throw.

**Fix**: NEW invariant **I-22**:

> I-22: `RequestContext.$freeze()` MUST eager-init all lazy fields (correlationId UUID generation; locale default 'en' if not set; FeatureContext / ProviderContext default constructions if init objects provided). After eager-init, getter access is pure read; mutators throw ContextFrozenError.

W-3-7-2 amended: $freeze() implementation eager-evaluates correlationId/locale/features/providers.

**A1.2.8 — `Session.destroyed` flag inconsistency** (architect P1-3).

Internal Session `$switchOperator` / `$setDataAccessUuid` throw bare `new Error('Session destroyed')`, NOT `SessionDestroyedError` from session-guard.

**Fix**: documented divergence in session-guard README. Migration of internal Session throws to AppError-subclass deferred to Sprint 3.7.x patch (out of scope here). NOT a Sprint 3.7 blocker.

**A1.2.9 — `AuthContext.getOperatorStrict` JSDoc clarification** (ddd P2 promoted to action).

`getOperatorStrict()` returns `session.operatorUuid` (acting source). `dataAccessUuid` accessed via separate factory `requireAuthContextWithDataAccess(ctx)` returning `AuthContext & { dataAccessUuid: string }`. README documents distinction.

W-3-7-4 amended: split into `requireAuthContext` + `requireAuthContextWithDataAccess`.

### A1.3 — Documentation conventions (docs P1-1..P1-4)

**A1.3.1 — README template fixation**:

All 3 Sprint 3.7 packages MUST follow Sprint 3.6 §template (per ADR-006 §A1.3):
- `## Install`
- `## Quickstart`
- `## Subpath imports` (runtime-context only — has `/moleculer`)
- `## API` (table or definition list)
- `## Init contract` (runtime-context only — order-of-init: setSession before reading session; freeze finalization; lazy correlationId)
- `## Security` (runtime-context: lazy throws + freeze + ProviderContext token discipline + ctx.locals invariant; session-guard: assertion-vs-check semantics + dataAccessUuid post-impersonation invariant + tenant scope; audit-primitives: skip — pure data layer)
- `## Cross-references` (links to ADR-007 + PRD-003)
- `## License`

Reference template: `packages/errors/README.md`.

**A1.3.2 — Locale catalog API not applicable to Sprint 3.7** (no locale-aware errors in this sprint).

**A1.3.3 — Changeset description templates**:

`.changeset/sprint-3-7-runtime-context.md`:
```markdown
---
'@gertsai/runtime-context': minor
'@gertsai/errors': patch
'@gertsai/session': patch
'@gertsai/tenant-resolver': patch
'@gertsai/di': patch
---

Initial release. Per-request composition root with lazy getters and freeze invariant.

- `RequestContext` class with lazy private getters for session/tenantId/correlationId/locale/features/providers; `$setSession`/`$setTenantId`/`$setCorrelationId` mutators; `$freeze()` finalization.
- `AuthContext` (security projection) + `requireAuthContext(ctx)` / `requireAuthContextWithDataAccess(ctx)` factories.
- `FeatureContext` (flag-aware) + `ProviderContext` (DI-aware) sub-aggregates.
- 5 dedicated errors extending `@gertsai/errors` taxonomy.
- `/moleculer` subpath: `sessionMiddleware(opts)` factory composing RequestContext per-request, attached to `ctx.locals.requestContext`, **auto-`$freeze()`-ed before downstream handler** (per ADR-007 I-16).
- ProviderContext.get<T>(token) requires `symbol` tokens (rejects strings — type-confusion protection per ADR-007 I-17).
- Lazy `correlationId` uses `crypto.randomUUID()` (per ADR-007 I-20).

Patch bumps on errors/session/tenant-resolver/di — version sync for workspace ref bump (no source change).
```

`.changeset/sprint-3-7-session-guard.md`:
```markdown
---
'@gertsai/session-guard': minor
'@gertsai/errors': patch
'@gertsai/session': patch
---

Initial release. External invariant guards / predicates / dedicated errors for `@gertsai/session`.

- 4 predicates: `isAuthenticated`, `hasOperatorType`, `isInTenant`, `isImpersonating`.
- 4 assertion helpers (using TS `asserts` signature for narrowing): `assertAuthenticated`, `assertOperatorType`, `assertSessionInTenant`, `assertNotDestroyed` + 1 added per Amendment 1.1.2: `assertHasDataAccessUuid`.
- 3 result-shape variants: `checkAuthenticated`, `checkOperatorType`, `checkSessionInTenant`.
- 5 dedicated errors extending `@gertsai/errors` taxonomy: `AuthenticationRequiredError` (per Amendment 1.1.2 — replaces session-undefined throw of DataAccessUuidMissingError), `DataAccessUuidMissingError` (separate semantic — scoping fail), `OperatorTypeMismatchError`, `TenantScopeViolationError`, `SessionDestroyedError`.
- `isInTenant` returns `false` if `session.tenantId === undefined` (per ADR-007 I-18).
- `isImpersonating` throws `DataAccessUuidMissingError` if either UUID empty/undefined (per ADR-007 I-19).
```

`.changeset/sprint-3-7-audit-primitives.md`:
```markdown
---
'@gertsai/audit-primitives': minor
---

Initial release. Pure data layer for backend-agnostic audit primitives.

- `Timestamp` interface ({ seconds, nanoseconds }) — backend-agnostic structure shared with entity-audit.
- `AuditMarks` interface — generic mutation marks (created_at / updated_at / deleted_at) WITHOUT session-bound builders.
- `TimestampProvider` type alias = `() => Timestamp` (call-signature, matches entity-audit per Amendment 1.1.3).
- 2 default providers: `dateTimestampProvider` (uses Date.now), `fixedTimestampProvider(ts)` (test fixture).
- 4 conversion helpers: `timestampToMillis`, `timestampFromDate`, `timestampFromMillis`, `timestampCompare`.

Zero internal `@gertsai/*` peer-deps. Pure utility + interface layer.
```

`.changeset/sprint-3-7-errors-patch.md` (NEW — 4th changeset per Amendment 1.1.1):
```markdown
---
'@gertsai/errors': patch
---

Sprint 3.7 in-flight refactor: 10 error subclasses become parametric on `D` with default matching original shape.

**Strictly additive backward-compat**: existing call sites continue to compile unchanged because default `D` preserves Sprint 3.6 shapes:
- `class NotFoundError<D = { resourceType: string; resourceId: string }> extends AppError<D>`
- `class UnauthorizedError<D = { reason?: string }> extends AppError<D>`
- ... etc 8 more.

Sprint 3.7 dedicated errors (in `@gertsai/runtime-context` and `@gertsai/session-guard`) consume parametric form: `class SessionMissingError extends NotFoundError<{ contextField: 'session' }>`.
```

`.changeset/sprint-3-7-entity-audit.md` (NEW — 5th changeset per Amendment 1.1.4):
```markdown
---
'@gertsai/entity-audit': patch
---

Sprint 3.7 E+ refactor: re-export Timestamp / TimestampProvider / timestampToMillis / timestampFromDate / dateTimestampProvider from new `@gertsai/audit-primitives` package.

Strictly additive — entity-audit's existing exports preserved (own implementations marked DEPRECATED via JSDoc but functional). Consumers MAY migrate to direct `@gertsai/audit-primitives` import; entity-audit continues as Entity-augmented audit layer (session-bound MutationMarks + builder functions).

New peer-dep: `@gertsai/audit-primitives: workspace:^`.
```

**A1.3.4 — CLAUDE.md tier-table snippet** (3 NEW rows + 1 enhanced row):

After Tier 2 `@gertsai/query-dsl`, insert:

```
| **2** | **`@gertsai/session-guard`** | session, errors (peers) | **Sprint 3.7 W-3-7-11..17 (F fresh)** | External invariant guards (4 predicates / 5 assertions / 3 check-results) + 5 dedicated errors over @gertsai/session per ADR-007 I-18, I-19 |
| **2** | **`@gertsai/audit-primitives`** | — | **Sprint 3.7 W-3-7-18..23 (F fresh)** | Pure data layer — Timestamp / AuditMarks + TimestampProvider call-signature + 4 conversion helpers; zero internal deps; entity-audit re-exports per ADR-007 I-8 |
```

After Tier 3 `@gertsai/entity-storage` (or insert NEW Tier 4 section after Tier 3), insert NEW Tier 4 row (note: existing Tier 4 only has api-core; this becomes second Tier 4):

```
| **4** | **`@gertsai/runtime-context`** | errors, session, tenant-resolver, di (peers); audit-primitives (peer) | **Sprint 3.7 W-3-7-1..10 (F fresh)** | Per-request composition root; RequestContext + AuthContext + FeatureContext + ProviderContext; `/moleculer` subpath с auto-freeze sessionMiddleware per ADR-007 I-16; ProviderContext symbol-only tokens per I-17 |
```

Update `@gertsai/entity-audit` row Internal deps: add `audit-primitives (peer)`. Update Source: append `+ Sprint 3.7 (E+ re-export from audit-primitives)`.

Update tier table package count "28 deliverables" → "31 deliverables" (3 new + 1 enhanced; di already enhanced counted from Wave 4).

### A1.4 — Build worker sequencing

Sprint 3.7 Wave 1 has **4 workers** (was 3 — added errors-patch-worker per Amendment 1.1.1):

- **errors-patch-worker** FIRST (Wave 1 starts here): refactor 10 subclasses parametric. Estimated 30 minutes. Within first 5 minutes commits parametric refactor commit (additive + default D). After this, runtime-context-worker and session-guard-worker can use `extends NotFoundError<{...}>` syntax.
- **runtime-context-worker** + **session-guard-worker** + **audit-primitives-worker** start AFTER errors-patch-worker first commit. May import `@gertsai/errors` parametric subclasses immediately.

If errors-patch-worker delays, downstream workers fall back to local stubs per Amendment 1.4 (Sprint 3.6 pattern).

### A1.5 — File ownership matrix update

| Worker | Owns | Reads only |
|--------|------|------------|
| **errors-patch-worker** | `packages/errors/src/errors/*.ts` (parametric refactor x10), `packages/errors/CHANGELOG.md` | (everything else read-only) |
| **runtime-context-worker** | `packages/runtime-context/**` (NEW) | errors, session, tenant-resolver, di, audit-primitives |
| **session-guard-worker** | `packages/session-guard/**` (NEW) | errors, session |
| **audit-primitives-worker** | `packages/audit-primitives/**` (NEW) | (none — zero deps) |
| **team-lead Phase B** | `packages/entity-audit/**` (E+ refactor — re-exports), CLAUDE.md, pnpm-lock.yaml, `.changeset/sprint-3-7-*.md` (NEW × 5) | all package src |

team-lead Phase B owns entity-audit E+ refactor to keep worker boundary disjoint.

### A1.6 — Out of scope additions

- Internal Session $-mutator throw migration to SessionDestroyedError — Sprint 3.7.x.
- TypedToken<T> wrapper for ProviderContext — Wave 6+.
- HTTP framework adapter for runtime-context — Wave 6+.

### Amendment 1 changelog

| ID | Source | Severity | Status |
|----|--------|----------|--------|
| A1.1.1 | typescript P0-1 + ddd P1-2 + architect P1-1 (convergent) | Convergent P0 | Applied (errors patch + 4th changeset) |
| A1.1.2 | ddd P1-2 | Substantive single | Applied (AuthenticationRequiredError split) |
| A1.1.3 | architect P1-1 | Substantive single | Applied (TimestampProvider call-signature) |
| A1.1.4 | architect P1-2 + ddd P1-3 (convergent) | Convergent P1 | Applied (E+ entity-audit mandatory + 5th changeset) |
| A1.2.1 | security P0-1 | Substantive | Applied (I-16 — auto-freeze in middleware) |
| A1.2.2 | security P0-2 | Substantive | Applied (I-17 — symbol-only tokens) |
| A1.2.3 | security P0-3 | Substantive | Applied (I-18 — undefined-tenant guard) |
| A1.2.4 | security P0-4 | Substantive | Applied (I-19 — non-empty UUIDs) |
| A1.2.5 | security P1-1 | Substantive | Applied (I-20 — crypto.randomUUID) |
| A1.2.6 | security P1-3 | Substantive | Applied (I-21 — safeForTransport) |
| A1.2.7 | ddd P1-1 | Substantive | Applied (I-22 — eager-init in $freeze) |
| A1.2.8 | architect P1-3 | Substantive | Documented divergence; Sprint 3.7.x deferred |
| A1.2.9 | ddd P2 promoted | Polish promoted | Applied (split AuthContext factories) |
| A1.3 | docs P1-1..P1-4 | Substantive | Applied (README template + Security per-package + 5 changeset templates + 3 CLAUDE.md rows) |
| A1.4 | architect P1-A3 (Sprint 3.6 pattern) | Substantive | Applied (4-worker Wave 1 with errors-patch FIRST) |
| A1.5 | spec | Substantive | Applied (file ownership matrix update) |
| P2 polish (multi-reviewer) | various | P2 | Worker discretion within README/JSDoc; some deferred to KNOWN-ISSUES |







