---
depth: standard
id: ADR-006
kind: adr
last_modified_at: 2026-05-06T15:00:18.908154+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-005
  relation: refines
status: active
title: Errors + Tenant Resolver placement, Session additive scoping, Wave 5 extraction policy
---

# ADR-006: Errors + Tenant Resolver placement, Session additive scoping, Wave 5 extraction policy

## Context

Wave 5 (PRD-003) extracts three Tier 1 packages в Sprint 3.6 + 7 P2 polish items. Three architectural decisions need fixation **до** SPEC-011 implementation kicks off:

1. **Errors API surface**: каким будет `@gertsai/errors` — какая иерархия (sealed enum vs open subclasses), как HTTP/gRPC mapping выделяется в subpaths, как сериализуется error для wire transport, как cause propagation обрабатывается.

2. **Tenant resolver design**: каким будет composition pattern (chain-of-responsibility vs strategy-list), как разделяются transport-agnostic strategies от transport-specific adapters (HTTP / Moleculer), как chain reports failure (null vs throw).

3. **Session additive scoping policy**: каким способом добавляются `tenantId/projectId/spaceId` в существующий Session class — additive constructor params vs nested scope object, какие helpers (strict vs optional), как backward-compat preserves для downstream consumers.

4. **Wave 5 extraction policy**: extends ADR-005 Decision B на Wave 5 patterns. Какие принципы для `errors` / `tenant-resolver` / framework adapters / Orchestra HIGH candidates.

Без явного ADR на эти решения — workers Sprint 3.6 будут импровизировать; drift и forbidden imports обеспечены (как обнаружил architect-reviewer F-A-7 audit-pre-sprint-3-2 cycle, и как Sprint 3.5 audit показал в pg-client/storage adapter accidentally importing storage-core listeners signature).

## Decision

### Decision A — `@gertsai/errors` design

`@gertsai/errors` (Sprint 3.6) ships **closed `ErrorKind` enum + `AppError` base + 10 specific subclasses** — backend-agnostic ошибочная иерархия. HTTP/gRPC mapping живёт в **отдельных subpaths** (`/http`, `/grpc`).

**Key design choices**:

1. **Closed enum `ErrorKind`** — 10 values mirror RFC 9457 Problem Details + canonical microservice taxonomy:
   - `VALIDATION` (400 / INVALID_ARGUMENT)
   - `NOT_FOUND` (404 / NOT_FOUND)
   - `UNAUTHORIZED` (401 / UNAUTHENTICATED)
   - `FORBIDDEN` (403 / PERMISSION_DENIED)
   - `CONFLICT` (409 / ABORTED)
   - `RATE_LIMITED` (429 / RESOURCE_EXHAUSTED)
   - `INTERNAL` (500 / INTERNAL)
   - `UPSTREAM_FAILURE` (502 / UNAVAILABLE)
   - `TIMEOUT` (504 / DEADLINE_EXCEEDED)
   - `BAD_GATEWAY` (502 / UNAVAILABLE) — distinct from UPSTREAM_FAILURE: gateway misconfiguration vs transient

2. **`AppError` base class**:
   ```typescript
   abstract class AppError extends Error {
     readonly kind: ErrorKind;
     readonly details: Readonly<Record<string, unknown>>;
     readonly cause?: unknown;
     readonly correlationId?: string;
     toJSON(): SerializedAppError;
   }
   ```

3. **10 specific subclasses** — `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `RateLimitedError`, `InternalError`, `UpstreamFailureError`, `TimeoutError`, `BadGatewayError`. Each declares its `kind` constant and exposes type-narrowed `details` (e.g. `ValidationError.details: { field: string; constraint: string }`).

4. **Subpath `/http`** ships:
   - `appErrorToHttpResponse(err: AppError): { status: number; body: ProblemDetails }` — RFC 9457 ProblemDetails JSON
   - `httpStatusForKind: Record<ErrorKind, number>` mapping table
   - `parseHttpProblemDetails(body): AppError` reverse mapping (для clients)

5. **Subpath `/grpc`** ships:
   - `appErrorToGrpcStatus(err: AppError): { code: number; message: string; details: unknown }`
   - `grpcStatusForKind: Record<ErrorKind, number>` (uses canonical grpc.status integer codes; we vendor these as constants — NO grpc framework runtime import)

6. **Helpers (root export)**:
   - `isAppError(x: unknown): x is AppError` — type guard
   - `wrapUnknownError(x: unknown, kind?: ErrorKind): AppError` — converts unknown error into `InternalError` preserving cause
   - `getUserMessage(error: AppError, locale?: string): string` — locale-aware user-facing message; default English

7. **Serialization (`SerializedAppError`)**:
   ```typescript
   type SerializedAppError = {
     kind: ErrorKind;
     message: string;
     details: Record<string, unknown>;
     correlationId?: string;
     cause?: SerializedAppError;
   };
   ```

8. **No HTTP framework runtime import in core**. Status codes vendored as `const` numeric literals.

### Decision B — `@gertsai/tenant-resolver` design

`@gertsai/tenant-resolver` (Sprint 3.6) ships **composable chain-of-responsibility**: `TenantResolverStrategy<Source>` interface + `ChainTenantResolver<Source>` orchestrator + 3 built-in HTTP-shaped strategies. Transport adapters live в **отдельных subpaths** (`/moleculer`, `/http`).

**Key design choices**:

1. **`TenantResolverStrategy<Source>` interface** — abstract:
   ```typescript
   interface TenantResolverStrategy<Source> {
     readonly name: string;  // "header" | "subdomain" | "path" | "moleculer-ctx" | etc.
     resolve(source: Source): Promise<TenantResolution | null>;
   }

   type TenantResolution = {
     tenantId: string;
     strategyName: string;  // which strategy resolved
   };
   ```

2. **`ChainTenantResolver<Source>` composer** — runs strategies in order, returns first non-null OR null if none match:
   ```typescript
   class ChainTenantResolver<Source> implements TenantResolverStrategy<Source> {
     constructor(strategies: TenantResolverStrategy<Source>[]);
     resolve(source: Source): Promise<TenantResolution | null>;
   }
   ```

3. **Built-in HTTP-shaped strategies (root export, accept `HttpRequestLike` interface — NOT concrete framework types)**:
   - `HeaderStrategy({ headerName: 'X-Tenant-ID' })` — reads HTTP header
   - `SubdomainStrategy({ baseDomain: 'gertsai.dev' })` — extracts from `tenantA.gertsai.dev`
   - `PathStrategy({ pathPattern: '/t/:tenantId/...' })` — extracts from path

4. **`HttpRequestLike` minimal interface** — duck-type, NOT framework concrete:
   ```typescript
   interface HttpRequestLike {
     readonly headers: Readonly<Record<string, string | string[] | undefined>>;
     readonly url?: string;
     readonly method?: string;
   }
   ```

5. **Subpath `/moleculer`** ships:
   - `MoleculerCtxStrategy` — reads `ctx.meta.tenantId` from Moleculer Context
   - `tenantMiddleware(resolver: ChainTenantResolver<unknown>)` factory — Moleculer middleware that resolves once per request
   - Peer-optional `moleculer` dependency

6. **Subpath `/http`** ships:
   - `nodeHttpAdapter(req: http.IncomingMessage): HttpRequestLike` — converts Node IncomingMessage
   - peer-optional `@types/node` (Node builtin runtime)

7. **Failure semantics** — chain returns `null` if no strategy resolved; helper `resolveTenantStrict(chain, source)` throws `UnauthorizedError` from `@gertsai/errors`. Consumer decides flow:
   ```typescript
   const resolution = await chain.resolve(req);
   if (!resolution) throw new UnauthorizedError({ kind: ErrorKind.UNAUTHORIZED, ... });
   ```

8. **Internal dep on `@gertsai/errors`** — only for `UnauthorizedError` in `resolveTenantStrict` helper. Soft dep (errors lib also has 0 deps).

### Decision C — `@gertsai/session` additive scoping

`@gertsai/session` (existing, Wave 4) gains **3 additive optional fields** + 4 helpers — strictly backward-compatible.

**Key design choices**:

1. **Additive constructor params**:
   ```typescript
   interface SessionInitOptions {
     // ... existing fields preserved
     readonly tenantId?: string;
     readonly projectId?: string;
     readonly spaceId?: string;
   }
   ```

2. **Public read-only getters**:
   ```typescript
   class Session {
     get tenantId(): string | null;
     get projectId(): string | null;
     get spaceId(): string | null;
   }
   ```

3. **Strict / optional helpers**:
   ```typescript
   getTenantStrict(): string;     // throws UnauthorizedError if null
   getTenantOptional(): string | null;
   getProjectStrict(): string;
   getSpaceStrict(): string;
   ```

4. **Soft dep on `@gertsai/errors`** — only for `UnauthorizedError` in `*Strict()` helpers. Soft because peer-optional or transitively required.

5. **Backward compat invariant** — existing Session constructor signature accepts `SessionInitOptions` with new fields **all optional**. Existing test fixtures construct Session WITHOUT new fields → continue to compile and pass.

6. **No nested scope object** — flat fields chosen over `scope: { tenantId, projectId, spaceId }` because:
   - Flat — easier shallow-equal compare for downstream React/Vue change detection
   - Flat — accessor names match Sprint 3.7 RuntimeContext naming (`currentTenant`, `currentProject`)
   - Flat — type-narrow simpler (3 separate `?: string` fields vs nested partial)

### Decision D — Wave 5 extraction policy (extends ADR-005 Decision B)

Применимо к Sprint 3.6-3.9. Дополняет ADR-005 Decision B (Orchestra extraction policy) для Wave 5 patterns.

1. **Subpath isolation for transport adapters**:
   - Errors: HTTP/gRPC mapping в `/http`, `/grpc` subpaths.
   - Tenant resolver: Moleculer/HTTP adapters в `/moleculer`, `/http` subpaths.
   - Runtime context (Sprint 3.7): Moleculer middleware в `/moleculer` subpath.
   - Entity adapters (Sprint 3.8): each framework — own package `@gertsai/entity-{vue,react,solid,svelte}`, peer-dep optional.

2. **No concrete HTTP/gRPC framework imports in core packages** of `@gertsai/errors`. Status codes vendored as numeric constants. Reasoning: consumers who don't run HTTP / don't run gRPC won't pay the runtime cost.

3. **No Moleculer imports in core** of `@gertsai/tenant-resolver` / `@gertsai/runtime-context`. Moleculer adapters strictly in `/moleculer` subpath, peer-optional dependency.

4. **Strategy markers (per ADR-004 I-2 + ADR-005 extension)**:
   - **F+**: Fix on existing — additive only, no breaking changes (Sprint 3.6 polish batch + session scoping).
   - **F**: Fresh implementation, mirroring upstream patterns (errors + tenant-resolver).
   - **E**: Enhancement of existing package — additive only (preserved from Wave 4 ADR-005).
   - **A**: Additive non-breaking adapter extension — preserved from Wave 4 ADR-005.

5. **Session additive scoping = E+ marker** (NEW: enhancement-additive-only).

6. **Polish batch invariant**: each P2 polish item MUST be classified as additive (no breaking) by reviewer. If classified breaking — defer to next minor with explicit changeset entry.

7. **Reuse Orchestra extraction principles** (ADR-005 Decision B) для errors + tenant-resolver:
   - 1:1 mirror patterns + strip backend coupling.
   - Strip framework coupling (NO concrete HTTP/gRPC/Moleculer SDK in core).
   - Generic over implementation (HttpRequestLike duck-type).
   - Tests lifted 1:1 + replace fixtures с in-memory equivalents.
   - SPDX header on each new file.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| A1 — Open ErrorKind (string literal type, extensible) | Rejected | Open enums make exhaustive `switch` typecheck weaker; downstream proliferates custom kinds → mapping tables drift. Closed enum forces consumers to extend via subclassing AppError. |
| A2 — Single God-class AppError with `kind` field, no subclasses | Rejected | Type-narrowed `details` per kind impossible; consumers can't `instanceof ValidationError` for ergonomic catch. |
| **A3 — Closed ErrorKind + AppError base + 10 subclasses + subpath transport mapping** | **Chosen** | Type-safe; ergonomic catch; transport-agnostic core; subpath isolation. |
| B1 — Tenant resolver returns `string` (or throws) instead of `TenantResolution \| null` | Rejected | Loses provenance (which strategy resolved → useful for audit logs). Throwing-by-default forces consumers to wrap try/catch even when fallback chain is intentional. |
| B2 — Class-based strategies vs interface | Rejected | Interface = duck-type ergonomics; consumers can write inline `{ name, resolve }` strategies. |
| **B3 — Interface + ChainResolver + null-on-no-match + helper that throws** | **Chosen** | Composable; provenance preserved; consumer chooses error semantics. |
| C1 — Session scoping via nested `scope: { tenantId, ... }` object | Rejected | Shallow-equal compare harder; deep nested optional types confuse TypeScript narrowing; accessor names diverge from RuntimeContext naming. |
| C2 — Session scoping via mixin or extension class | Rejected | Multiple Session subclasses → DI confusion + serialization drift. Single Session is canonical. |
| **C3 — 3 additive flat optional fields + 4 helpers** | **Chosen** | Backward-compat trivial; flat fields easy to consume; helpers cover strict-vs-optional. |
| D1 — Skip subpath isolation; ship transport adapters in main entry | Rejected | Forces consumers без HTTP / без Moleculer runtime to pay dependency cost. |
| **D2 — Subpath isolation per transport** | **Chosen** | Consumers opt-in to transport dependencies; tree-shake friendly. |

## Consequences

### Positive

- `@gertsai/errors` becomes single source of truth for error taxonomy across all `@gertsai/*` consumers.
- HTTP/gRPC mapping lives in dedicated subpaths — consumers без transport не платят runtime cost.
- Tenant resolver chain is composable + provenance-preserving — audit logs can record which strategy resolved.
- Session additive scoping is backward-compatible — existing 4443 tests pass untouched.
- Sprint 3.7 runtime-context can build on errors+tenant-resolver+session-scoping foundation cleanly.
- Wave 5 invariants (forbidden imports, polish additive-only) prevent the kind of drift we found in Sprint 3.5 pg-client adapter audit.

### Negative (trade-offs)

- 10 error subclasses in src adds ~400 LOC; consumers who use only `AppError` base never instantiate subclasses. Mitigation: tree-shake friendly (each subclass own export).
- Subpath imports mean consumers must remember `from '@gertsai/errors/http'` instead of root. Mitigation: README + JSDoc + typesVersions.
- Session additive scoping increases Session constructor surface — accept this; alternative (nested scope) worse.
- Polish batch (P2) executed as Sprint 3.6 work item adds scope; mitigation: strictly additive classification + reviewer gate.

### Risks

- **R-1**: ErrorKind enum proves insufficient — consumers want extensibility. Mitigation: subclass `AppError` directly with custom `kind: 'CUSTOM_X'` (string literal allowed via discriminated union extension).
- **R-2**: HttpRequestLike duck-type misses framework-specific edge cases (e.g. lowercase header normalization in Express vs Node). Mitigation: each Strategy's `resolve` defensively normalizes; document in README.
- **R-3**: ChainResolver async iteration adds latency vs sync. Mitigation: most strategies are sync (header/subdomain/path); async only for JWT-decoding (consumer-implemented).
- **R-4**: Session additive fields conflict с future Sprint 3.7 RuntimeContext fields (drift). Mitigation: this ADR fixes flat naming convention; Sprint 3.7 RuntimeContext mirrors.
- **R-5**: Polish batch sneaks in breaking change. Mitigation: each polish item changeset-versioned + reviewer "additive only" attestation.

## Invariants

I-1: `@gertsai/errors` core (root export) MUST NOT import HTTP framework runtime (`express`, `fastify`, `koa`, `hono`) or gRPC framework runtime (`@grpc/grpc-js`, `nice-grpc`). Status codes vendored as numeric constants.

I-2: `@gertsai/errors/http` subpath MAY import `@types/node` and HTTP framework types via `import type` only (zero runtime cost).

I-3: `@gertsai/errors/grpc` subpath MAY import gRPC status code types but MUST NOT import gRPC server/client runtime.

I-4: `@gertsai/tenant-resolver` core (root export) MUST NOT import Moleculer (`moleculer` / `moleculer-web`) or any concrete HTTP framework runtime.

I-5: `@gertsai/tenant-resolver/moleculer` subpath MAY import `moleculer` as peer-optional dependency.

I-6: `@gertsai/session` existing public API surface (constructor signature, public methods, getters) MUST be preserved. Sprint 3.6 changes are strictly additive optional fields + new helpers.

I-7: Each P2 polish item MUST be classified additive (non-breaking) by reviewer; if classified breaking — defer.

I-8: Sprint 3.6 commits MUST preserve Wave 4 invariants (ADR-005 I-1..I-7) intact. Cross-package modifications (e.g. polish-worker touching entity-storage README) MUST NOT change runtime behavior of Wave 4 packages.

I-9: All new `.ts` files in Sprint 3.6 MUST start with `// SPDX-License-Identifier: Apache-2.0` per ADR-005 I-5.

I-10: Per-package strategy markers (F / F+ / E+ / A) MUST appear в SPEC-011 prior to Build phase per ADR-004 I-2 + this ADR Decision D §4.

I-11: `ChainTenantResolver.resolve` returns `null` on no-match (not throws). Throwing variant available via `resolveTenantStrict(chain, source)` helper using `UnauthorizedError` from `@gertsai/errors`.

I-12: HTTP/gRPC status code mapping MUST be in `Record<ErrorKind, number>` constants — exhaustive (every ErrorKind has mapping). TypeScript exhaustiveness check enforces.

I-13: `AppError.toJSON()` MUST guard against cyclic / unbounded `cause` chains: max depth = 5; cycle detection via `WeakSet<AppError>`. On cycle / depth-exceed → emit truncated SerializedAppError with `cause: { __truncated: true, reason }` marker.

I-14: `appErrorToHttpResponse()` and `appErrorToGrpcStatus()` MUST apply default redaction list to `details` field BEFORE wire serialization: `password`, `token`, `secret`, `apiKey`, `api_key`, `authorization`, `cookie`, `set-cookie`, `pwd`, `passwd`, `private_key`, `privateKey`, `connection_string`, `connectionString`. Internal `toJSON()` (used for logs) does NOT redact — separate concerns.

I-15: `HeaderStrategy` constructor MUST accept `trustProxy: boolean` (default `false`). When `false`, constructor throws `Error('HeaderStrategy requires trustProxy: true — header MUST be set/stripped by trusted reverse proxy. See SECURITY.md')`. README MUST include "Security" section documenting trusted-proxy contract.

I-16: `getProjectStrict()` and `getSpaceStrict()` on Session MUST throw `ValidationError` (not `UnauthorizedError`). Only `getTenantStrict()` throws `UnauthorizedError` (multi-tenancy = authentication boundary). Project/space scope absence = invalid input, not unauthenticated.

I-17: Session scope fields (`tenantId`, `projectId`, `spaceId`) are **flat tags, no enforced hierarchy**. ADR explicitly does NOT enforce `space ⊂ project ⊂ tenant`. Rationale: orphan-scope states (e.g. `spaceId` set without `projectId`) are valid for cross-cutting use cases (system spaces, project-less workspaces). Hierarchy enforcement, if needed, lives in Sprint 3.7 RuntimeContext middleware (consumer opt-in).

I-18: `ChainTenantResolver` constructor MUST accept `mode?: 'strict' | 'optional'` parameter, default `'strict'`. In strict mode, `resolve()` throws `UnauthorizedError` if all strategies return null (eliminates fail-open default). Optional mode preserves current null-returning semantics for non-tenant-isolated routes (health checks, public docs).

## Evidence Requirements

- **E-1**: SPEC-011 (Sprint 3.6) активирован с per-package strategy markers (F / F+ / E+) + cross-reference на ADR-006 + per-track AC.
- **E-2**: `pnpm pack --dry-run` для каждого нового Wave 5 package — 0 leak.
- **E-3**: `grep -rE 'express|fastify|koa|hono|grpc-js|moleculer' packages/{errors,tenant-resolver}/src` returns 0 matches in core. Subpath `/moleculer` allows `moleculer` import via peer-optional.
- **E-4**: `@gertsai/session` regression suite — 100% existing tests pass after additive scoping merge.
- **E-5**: `@gertsai/errors` test coverage — exhaustive `ErrorKind` mapping tests (HTTP and gRPC).
- **E-6**: `@gertsai/tenant-resolver` test coverage — 3 built-in strategies × happy/null/edge + ChainResolver composition + Moleculer adapter.
- **E-7**: 7 P2 polish items closed — checklist в EVID-013.
- **E-8**: Sprint 3.6 atomic commit on `feat/sprint-3-6-wave-5-phase-1` branch.

## Implementation Plan

### Phase 0: Pre-conditions
- [ ] **0.1** PRD-003 active.
- [ ] **0.2** ADR-006 active.

### Phase 1: SPEC-011 + Pre-Build audit (Sprint 3.6)
- [ ] **1.1** SPEC-011 draft с W-3-6-1..W-3-6-N items + per-package strategy markers (F / F+ / E+).
- [ ] **1.2** Pre-Build audit (5 reviewers parallel) — architect / security / ddd / typescript-pro / docs.
- [ ] **1.3** Address P0/P1 audit findings (if any).
- [ ] **1.4** SPEC-011 validate + activate.

### Phase 2: Sprint 3.6 Build (4 parallel workers + team-lead)
- [ ] **2.1** AgentTeams Wave 1: 4 workers (errors / tenant-resolver / session-additive / polish).
- [ ] **2.2** Team-lead Phase B: integrated verify (install/build/test/typecheck/lint/publint/depcruise/attw).
- [ ] **2.3** CLAUDE.md tier table 26 → 28; changesets for new packages; @gertsai/session minor bump.

### Phase 3: Post-Build audit + Activate
- [ ] **3.1** Post-Build fidelity audit (3 reviewers parallel — errors / tenant-resolver / session-scoping).
- [ ] **3.2** Address P0/P1 findings (if any).
- [ ] **3.3** EVID-013 active с structured measurements.
- [ ] **3.4** SPEC-011 active.
- [ ] **3.5** Single atomic commit.
- [ ] **3.6** Hindsight retain.

### Phase 4: Sprint 3.7 (Wave 5 Phase 2)
- [ ] **4.1** SPEC-012 (Sprint 3.7 — runtime-context, session-guard, audit-primitives).
- [ ] **4.2** Build + verify + audit + EVID-014.

### Phase 5: Sprint 3.8 (Wave 5 Phase 3)
- [ ] **5.1** SPEC-013 (Sprint 3.8 — 4 entity framework adapters parallel).
- [ ] **5.2** Build + verify + audit + EVID-015.

### Phase 6: Sprint 3.9 (Wave 5 Phase 4)
- [ ] **6.1** SPEC-014 (Sprint 3.9 — 4 Orchestra HIGH candidates).
- [ ] **6.2** Build + verify + audit + EVID-016.

## Affected Files (predicted, Sprint 3.6 only)

- `packages/errors/**` (NEW)
- `packages/tenant-resolver/**` (NEW)
- `packages/session/src/**` (additive: 3 fields + 4 helpers)
- `packages/session/__tests__/scoping.test.ts` (NEW additive tests)
- `packages/entity-storage/src/in-memory.provider.ts` (P2 EG-1: default generic)
- `packages/entity-storage/src/base-entity.storage.service.ts` (P2 EG-2: upsert helper)
- `packages/entity-storage/package.json` (P2 EG-4: peer-dep optional flag removal)
- `packages/entity-storage/README.md` (P2 EG-4: Phase A/B language cleanup)
- `examples/m9s-example/tests/audit-propagation.test.ts` (P2 ID-MF-2: remove `as any` casts)
- `README.md` (P2 ID-MF-1: 13 → 28 packages count fix)
- `CLAUDE.md` (tier table update 26 → 28)
- `pnpm-lock.yaml` (regenerated)
- `.changeset/sprint-3-6-errors.md` (NEW — minor bump errors)
- `.changeset/sprint-3-6-tenant-resolver.md` (NEW — minor bump tenant-resolver)
- `.changeset/sprint-3-6-session-scoping.md` (NEW — minor bump session)
- `.changeset/sprint-3-6-polish.md` (NEW — patch bump entity-storage)
- `.forgeplan/evidence/EVID-013-sprint-3-6-shipped.md` (NEW)

## Admissibility

NOT admissible под этим ADR:

- NOT: Импортировать HTTP framework runtime (express/fastify/koa/hono) в `@gertsai/errors` core.
- NOT: Импортировать gRPC framework runtime в `@gertsai/errors` core.
- NOT: Импортировать Moleculer в `@gertsai/tenant-resolver` core.
- NOT: Менять existing `@gertsai/session` constructor signature (breaking).
- NOT: Менять existing `@gertsai/session` public method signatures (breaking).
- NOT: Полу-extract концептов — каждый Wave 5 package либо ships полностью, либо deferred.
- NOT: Skip SPDX headers / Wave 5 attribution в файлах с ≥50% lifted code (per ADR-005 I-5).
- NOT: Polish batch P2 items, классифицированные breaking.
- NOT: Open enum `ErrorKind` (Decision A1 rejected).
- NOT: Throwing-by-default `ChainTenantResolver.resolve` (Decision B1 rejected; null-on-no-match chosen).
- NOT: Nested `scope: {}` object on Session (Decision C1 rejected; flat fields chosen).

## Rollback Plan

**Triggers**:
- Sprint 3.6 Phase A reveals `@gertsai/errors` ErrorKind taxonomy insufficient — миссинг kind found late → amendment вместо rollback.
- Sprint 3.6 Phase A reveals `ChainTenantResolver` async API too costly → switch to sync-first chain in patch.
- Sprint 3.6 Phase B reveals `Session` additive fields breaking downstream test — revert session changes; Sprint 3.7 RuntimeContext adopts standalone scoping.
- Polish batch reveals breaking change classification error → revert that specific polish item; Sprint 3.7 reclassifies.

**Steps**:
1. Open ADR-006 amendment с motivation.
2. Если errors taxonomy insufficient: extend ErrorKind enum (additive).
3. Если ChainResolver async too costly: ship sync `ChainTenantResolverSync` parallel; deprecate async chain.
4. Если Session additive breaks: `git revert` session-additive-worker commit; Sprint 3.7 brings standalone scoping.
5. Если polish item breaks: `git revert` that worker's commit; reclassify.

**Blast Radius**: low. Wave 5 packages еще unpublished во время потенциального rollback. Session is unpublished too (Wave 4 not yet on npm). After publish — semver minor break possible.

## Affected Files

| File | Baseline Hash |
|------|---------------|
| packages/{errors,tenant-resolver}/** | (NEW — no baseline) |
| packages/session/src/** | post-Sprint 3.5.2 (commit `070215b`) |
| packages/entity-storage/src/** | post-Sprint 3.5.2 |
| examples/m9s-example/** | post-Sprint 3.5.2.1 |
| README.md, CLAUDE.md | post-Sprint 3.5.2 |

## AI Guidance

> Правила для AI-агентов при работе с ADR-006 + SPEC-011:

- **errors-worker**: при extraction error class → проверь grep на forbidden imports PRIOR to copy (express/fastify/koa/hono/grpc-js). Если pattern требует — поднимай вопрос → может ли быть generic'd через subpath.
- **tenant-resolver-worker**: НЕ импортируй Moleculer в core. Subpath `/moleculer` only. HttpRequestLike duck-type для built-in strategies.
- **session-additive-worker**: STRICTLY additive. НЕ менять существующие constructor params, НЕ переименовывать существующие public методы. Только добавлять.
- **polish-worker**: каждый P2 item — additive. Если classified breaking → STOP, raise to user.
- При conflict с ADR-006 invariants: STOP, raise to user, suggest amendment vs new ADR.
- Tests: используй InMemory fixtures (Wave 4); не завись от network.
- При создании нового файла: SPDX header + (если ≥50% lifted from upstream) Orchestra/upstream attribution comment.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5 — Errors + Runtime Context + Framework Adapters) | PRD | based_on |
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | informs (Wave 4 foundation) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | refines (Wave 5 extraction policy extends Decision B; new strategy markers F+, E+) |
| ADR-004 (Foundation libs naming + extraction strategy) | ADR | refines (per-package strategy markers extension) |
| ADR-003 (Platform Runtime Boundaries) | ADR | refines (subpath patterns for /http, /grpc, /moleculer in errors + tenant-resolver) |
| ADR-002 (Hex layer enforcement) | ADR | informs |
| EVID-012 (Sprint 3.5.2 m9s-example Wave 4 migration) | Evidence | informs (Wave 4 production-grade baseline) |

> **Next step**: Activate PRD-003 → Activate ADR-006 → SPEC-011 (Sprint 3.6 Shape) → pre-Build audit → Build → post-Build audit → EVID-013 → Activate.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers (architect, security, ddd, typescript, docs) delivered convergent + substantive findings. The following amendments **supersede** the original Decisions where they conflict. Workers in Sprint 3.6 Build phase MUST follow Amendment 1 over original text where they disagree.

### A1.1 — Convergent fixes (≥2 reviewers)

**A1.1.1 — `ErrorKind` MUST NOT use `const enum`** (architect P1-A1 + typescript P0-1).

`tsconfig.base.json` ships `isolatedModules: true` (Sprint 3.0 baseline). `const enum` is incompatible with `isolatedModules` — TS errors `TS1208/TS18055`. tsup dual ESM+CJS build will fail.

**Replace** Decision A.1:

```typescript
// SUPERSEDES original Decision A.1 const enum
export const ErrorKind = {
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  UPSTREAM_FAILURE: 'UPSTREAM_FAILURE',
  TIMEOUT: 'TIMEOUT',
  BAD_GATEWAY: 'BAD_GATEWAY',
} as const;

export type ErrorKind = (typeof ErrorKind)[keyof typeof ErrorKind];
```

Rationale: `as const` object pattern is modern TS best practice — tree-shake friendly, no emit hazards, works through tsup dual ESM+CJS. Type derived from values via index access.

**A1.1.2 — `AppError.toJSON` MUST guard cause cycles + apply redaction** (architect P1-A2 + typescript P0-3 + security P0-2 + security P0-3 + security P1-7).

See new invariants **I-13** (cycle/depth guard) + **I-14** (redaction list). Non-AppError causes (native `Error`, `unknown`) are wrapped via `wrapUnknownError(x)` before serialization. Cause depth limit = 5; cycle detection via `WeakSet<AppError>`; on cycle/overflow → `cause: { __truncated: true, reason }` marker.

Two serialization paths:
- **`AppError.toJSON()`** = full (internal, used for structured logs).
- **`appErrorToHttpResponse()` + `appErrorToGrpcStatus()`** = wire-redacted (uses redaction list per I-14, returns RFC 9457 ProblemDetails / gRPC status).

**A1.1.3 — `@gertsai/errors` is Shared Kernel for the `@gertsai/*` ecosystem** (architect P0-A1 + ddd P1-DDD-3).

PRD-003 Tier 1 classification of `@gertsai/tenant-resolver` (with internal dep on `@gertsai/errors`) and Session peer-dep on errors are NOT tier-purity violations: `@gertsai/errors` operates as a **Shared Kernel** (DDD pattern) — a small, stable, universally-imported module that all bounded contexts may depend on without breaking layering.

Add to Decision D §6:

> **Shared Kernel pattern**: `@gertsai/errors` is the canonical Shared Kernel for `@gertsai/*` ecosystem. Tier 1 packages MAY depend on `@gertsai/errors` because:
> 1. `@gertsai/errors` itself has zero internal deps (Tier 1 pure).
> 2. Error taxonomy is universally needed across all layers; pulling it down to Tier 1 prevents N copies.
> 3. RFC 9457 / gRPC status mapping is inherently cross-cutting.
>
> Other Tier 1 packages MUST NOT cross-link except to `@gertsai/errors`. Future Shared Kernel candidates must be ratified by ADR amendment.

### A1.2 — Substantive single-reviewer fixes (will address)

**A1.2.1 — Session getter return type: `string | undefined`, not `string | null`** (typescript P0-2).

Existing `@gertsai/session` getter pattern is non-nullable (`get operatorUuid(): string`). Mixing null/undefined creates downstream consumer drift. Use `string | undefined` (TS idiomatic for optional fields, no coercion from `_tenantId?: string` constructor field).

**Replace** Decision C.2:

```typescript
get tenantId(): string | undefined;
get projectId(): string | undefined;
get spaceId(): string | undefined;
```

**Remove** `getTenantOptional()` / `getProjectOptional()` / `getSpaceOptional()` helpers (redundant with getters). Keep only `*Strict()` helpers (3 methods: `getTenantStrict / getProjectStrict / getSpaceStrict`).

**A1.2.2 — `AppError` MUST be generic on details** (typescript P1-2).

Original Decision A.2 declared `details: Readonly<Record<string, unknown>>` — too loose. Type-narrowed details requires generic on base.

**Replace** Decision A.2:

```typescript
export abstract class AppError<D extends Record<string, unknown> = Record<string, unknown>> extends Error {
  abstract readonly kind: ErrorKind;
  readonly details: Readonly<D>;
  readonly correlationId?: string;
  readonly cause?: unknown;
  constructor(opts: {
    message: string;
    details?: D;
    cause?: unknown;
    correlationId?: string;
  });
  toJSON(): SerializedAppError;
}

export class ValidationError extends AppError<{ field: string; constraint: string; value?: unknown }> {
  readonly kind = ErrorKind.VALIDATION;
}
// ... 9 more subclasses each with typed D
```

Each subclass declares its `D` shape explicitly. Consumers can extend (`class MyValidationError extends AppError<{ field: string; reason: 'too_long' }>`).

**A1.2.3 — `getProjectStrict()` / `getSpaceStrict()` throw `ValidationError`, not `UnauthorizedError`** (ddd P1-DDD-2).

See new invariant **I-16**. Original Decision C.3 conflated identity boundary (tenant = 401) with input validation (project/space = 400/422). Only `getTenantStrict()` throws `UnauthorizedError`.

**A1.2.4 — Session scope = flat tags, no enforced hierarchy** (ddd P1-DDD-1).

See new invariant **I-17**. Original Decision C did not specify hierarchy; this Amendment fixes "flat tags, no enforced `space ⊂ project ⊂ tenant`". Future Sprint 3.7 RuntimeContext middleware can opt-in to hierarchy enforcement.

**A1.2.5 — `HeaderStrategy` requires `trustProxy: true` opt-in** (security P0-1).

See new invariant **I-15**. Default-fail-secure: constructor throws if `trustProxy` not explicitly `true`. Forces consumer awareness of trusted-proxy contract before deployment.

**A1.2.6 — `ChainTenantResolver` defaults to `mode: 'strict'`** (security P1-5).

See new invariant **I-18**. Multi-tenancy default is now fail-closed: chain throws `UnauthorizedError` if all strategies return null. Optional mode requires explicit opt-in (`new ChainTenantResolver(strategies, { mode: 'optional' })`).

**A1.2.7 — W-3-6-25 (peer-dep optional flag removal) is a minor bump** (architect P0-A2).

Removing `peerDependenciesMeta.@gertsai/storage-core.optional: true` flips peer status from optional → mandatory. This is a SemVer minor (changes consumer install behavior). **Replace** SPEC-011 W-3-6-36 polish changeset bump from `patch` → `minor` for `@gertsai/entity-storage`. Add explicit "BREAKING for consumers without storage-core" note to changeset description.

**A1.2.8 — `ProblemDetails.type` MUST use bucket types, not raw `kind`** (security P1-6).

To prevent infrastructure topology leak (`UPSTREAM_FAILURE` vs `BAD_GATEWAY` differentiation), public-facing ProblemDetails uses **bucket types**:

| ErrorKind | ProblemDetails.type (public) | Bucket |
|-----------|------------------------------|--------|
| VALIDATION | `urn:gertsai:errors:validation` | client-error |
| NOT_FOUND | `urn:gertsai:errors:not-found` | client-error |
| UNAUTHORIZED | `urn:gertsai:errors:unauthenticated` | client-error |
| FORBIDDEN | `urn:gertsai:errors:permission` | client-error |
| CONFLICT | `urn:gertsai:errors:conflict` | client-error |
| RATE_LIMITED | `urn:gertsai:errors:rate-limit` | client-error |
| INTERNAL | `urn:gertsai:errors:server` | server-error |
| UPSTREAM_FAILURE | `urn:gertsai:errors:server` | server-error (collapsed!) |
| TIMEOUT | `urn:gertsai:errors:timeout` | server-error |
| BAD_GATEWAY | `urn:gertsai:errors:server` | server-error (collapsed!) |

Internal `kind` field stays in structured logs (debug + topology insight for ops). Wire payload only carries bucket-level type URI.

### A1.3 — Documentation conventions

Per docs P1-1..P1-4:

- **README template**: All Wave 5 packages follow `packages/session/README.md` style (flat sections, no badges hero-style). Mandatory sections: `## Install`, `## Quickstart`, `## Subpath imports`, `## API`, `## Cross-references`, `## Security` (for tenant-resolver + errors-with-cause), `## License`.
- **Locale catalog API** (Decision A.6 augmentation):
  ```typescript
  export function registerErrorLocale(
    locale: string,
    catalog: Partial<Record<ErrorKind, string>>,
  ): void;
  export function getUserMessage(error: AppError, locale?: string): string;
  ```
  Catalogs MUST be static / build-time only (security P2-2; format-string injection risk).
- **Changeset descriptions**: SPEC-011 W-3-6-36 amended with templates (see SPEC-011 Amendment 1).
- **CLAUDE.md update format**: SPEC-011 W-3-6-35 amended with concrete tier-table snippet + F+/E+ marker definitions.

### A1.4 — Test fixtures (security adversarial)

Per security P0-1, P0-2, P1-1, P1-2, P1-7 — extend SPEC-011 W-3-6-7 (errors tests) and W-3-6-16 (tenant-resolver tests):

- `header-spoof.test.ts` — HeaderStrategy without `trustProxy: true` throws on construct.
- `path-traversal.test.ts` — PathStrategy rejects `/t/foo%2F../victim/...` after URL normalization.
- `subdomain-strict-suffix.test.ts` — SubdomainStrategy rejects `attacker.evil.gertsai.dev.attacker.com`.
- `cause-cycle.test.ts` — toJSON does not infinite-loop on `a.cause = b; b.cause = a`.
- `cause-deep.test.ts` — toJSON truncates at depth 5.
- `details-redaction.test.ts` — `appErrorToHttpResponse(new InternalError({ details: { password: 'x' } }))` strips `password` from body.

### A1.5 — Build worker sequencing (architect P1-A3)

To eliminate worker race on session/tenant-resolver peer-dep on errors:

- **errors-worker**: first commit = `packages/errors/package.json` + `src/index.ts` skeleton (empty exports). Within first 30s of Build phase. Marks symlink target available.
- **tenant-resolver-worker** + **session-additive-worker**: may import `@gertsai/errors` immediately (workspace symlink resolves via `pnpm install` in Phase B). If TS errors arise during worker phase due to symlink-race — fallback to local stub class `class UnauthorizedError extends Error {}` with TODO comment; team-lead Phase B replaces with proper import.

### Amendment 1 changelog

| ID | Source | Severity | Status |
|----|--------|----------|--------|
| A1.1.1 | architect P1-A1 + typescript P0-1 | Convergent P0 | Applied (replaces Dec A.1) |
| A1.1.2 | architect P1-A2 + typescript P0-3 + security P0-2/P0-3/P1-7 | Convergent P0 | Applied (I-13, I-14, replaces Dec A.7) |
| A1.1.3 | architect P0-A1 + ddd P1-DDD-3 | Convergent P1 | Applied (Dec D §6 added) |
| A1.2.1 | typescript P0-2 | Substantive single | Applied (replaces Dec C.2) |
| A1.2.2 | typescript P1-2 | Substantive single | Applied (replaces Dec A.2) |
| A1.2.3 | ddd P1-DDD-2 | Substantive single | Applied (I-16) |
| A1.2.4 | ddd P1-DDD-1 | Substantive single | Applied (I-17) |
| A1.2.5 | security P0-1 | Substantive single | Applied (I-15) |
| A1.2.6 | security P1-5 | Substantive single | Applied (I-18) |
| A1.2.7 | architect P0-A2 | Substantive single | Applied (SPEC-011 amendment) |
| A1.2.8 | security P1-6 | Substantive single | Applied (Dec A.4 augmentation) |
| A1.3 | docs P1-1..P1-4 | Substantive | Applied |
| A1.4 | security P0-1/P0-2/P1-1/P1-2/P1-7 | Substantive | Applied (test fixtures) |
| A1.5 | architect P1-A3 | Substantive single | Applied (Build sequencing) |
| P2 polish | various | Single P2 | Deferred to KNOWN-ISSUES or Sprint 3.6.1 |

### P2 deferred / accepted as polish

- Architect P2: ChainTenantResolverSync future option (Sprint 3.7+).
- DDD P2 (Value Object equality, upsert layering, scope-changed event): JSDoc notes only.
- Typescript P2 (typesVersions canonical reference, correlationId propagation, import type for Node http, status code as const): worker discretion.
- Security P2 (P2 polish symbol-for, locale catalog static-only): documented in security section of README.
- Docs P2 (subpath imports section, migration note, polish wording, m9s-example mention): worker discretion within README template.







