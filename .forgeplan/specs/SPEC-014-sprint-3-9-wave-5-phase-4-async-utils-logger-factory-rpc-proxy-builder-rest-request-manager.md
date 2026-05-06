---
depth: standard
id: SPEC-014
kind: spec
last_modified_at: 2026-05-06T20:43:30.531728+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-009
  relation: based_on
status: active
title: Sprint 3.9 — Wave 5 Phase 4 (async-utils + logger-factory + rpc-proxy-builder + rest-request-manager)
---

# SPEC-014: Sprint 3.9 — Wave 5 Phase 4 (final)

## Summary

Wave 5 Phase 4 = ship 4 NEW packages — `@gertsai/async-utils` (Tier 1 F), `@gertsai/logger-factory` (Tier 1 F), `@gertsai/rpc-proxy-builder` (Tier 3 F), `@gertsai/rest-request-manager` (Tier 2 F). Per PRD-003 G-6 + ADR-009 Decisions A/B/C/D/E. Estimated ~28h dev + 4h orchestration.

**Wave 5 fully complete after this sprint** — 13 packages total (2 Phase 1 + 3 Phase 2 + 4 Phase 3 + 4 Phase 4).

Branch `feat/sprint-3-9-wave-5-phase-4` off `feat/sprint-3-8-wave-5-phase-3`.

## Scope

### Track 1: `@gertsai/async-utils` (T1, F, Tier 1, ZERO deps)

- **W-3-9-1**: Create `packages/async-utils/` skeleton — package.json (zero peerDeps), tsconfig, tsup.config.ts (single entry, no external needed), vitest.config.mts, src/index.ts, LICENSE symlink, README.md, CHANGELOG.md.
- **W-3-9-2**: Implement `sleep(ms): Promise<void>` — `src/sleep.ts`.
- **W-3-9-3**: Implement `withTimeout<T>(action, timeoutMs, message?)` — `src/with-timeout.ts`. Uses internal AbortController; throws standard `Error` (NOT TimeoutError per ADR-009 I-2).
- **W-3-9-4**: Implement `defer<T>(): Deferred<T>` — `src/deferred.ts`.
- **W-3-9-5**: Implement `debounce(fn, waitMs)` + `throttle(fn, limitMs)` — `src/debounce.ts`, `src/throttle.ts`. Both expose `cancel()`; debounce additionally `flush()`.
- **W-3-9-6**: Implement `retry<T>(action, opts?)` — `src/retry.ts`. Exponential backoff with configurable jitter (none/full/equal). Honors `signal: AbortSignal` if passed.
- **W-3-9-7**: Implement `makeCancellable(): CancellableSignal` — `src/cancellable.ts`. AbortController helper.
- **W-3-9-8**: `src/index.ts` — barrel re-exports.
- **W-3-9-9**: Tests (≥18):
  - sleep (1), withTimeout (3 — happy/timeout/abort), defer (2), debounce (3 — wait/cancel/flush), throttle (2 — limit/cancel), retry (5 — happy/exhaust/jitter modes/abort/non-retryable), cancellable (2).
- **W-3-9-10**: README per Sprint 3.6 §template (no Subpath section). Security/Caveats: AbortController cleanup, debounce timer cleanup on cancel, retry no-jitter risks.

### Track 2: `@gertsai/logger-factory` (T2, F, Tier 1)

- **W-3-9-11**: Create `packages/logger-factory/` skeleton — exports `.`, `./pino`, `./winston`, `./package.json`. typesVersions for subpaths.
  - peerDependencies: `@gertsai/errors: workspace:^`.
  - peerDependenciesMeta: `pino: { optional: true }`, `winston: { optional: true }`.
  - tsup external: `['@gertsai/errors', 'pino', 'winston']`.
- **W-3-9-12**: Implement `createLogger(opts?): Logger` + `consoleBackend` — `src/logger.ts`, `src/console-backend.ts`. Levels: trace/debug/info/warn/error/fatal. `child(ctx)` pattern. `setLevel`/`getLevel`. Apply redaction at backend call site (REDACTION_KEYS from `@gertsai/errors`).
- **W-3-9-13**: Implement `/pino` subpath — `src/pino/index.ts`. `createPinoBackend(pinoInstance)` adapter. Lazy `createRequire('pino')`.
- **W-3-9-14**: Implement `/winston` subpath — `src/winston/index.ts`. `createWinstonBackend(winstonInstance)` adapter. Lazy `createRequire('winston')`.
- **W-3-9-15**: Tests (≥15):
  - logger conformance (6 levels, child, setLevel, redaction): 8 tests.
  - consoleBackend (mocked): 2 tests.
  - pino subpath: 2 tests (peer-dep gate + adapter).
  - winston subpath: 2 tests (peer-dep gate + adapter).
  - redaction adversarial: 1 test (nested keys, case-insensitive).
- **W-3-9-16**: README per template + Subpath imports section (Install /pino /winston).

### Track 3: `@gertsai/rpc-proxy-builder` (T3, F, Tier 3)

- **W-3-9-17**: Create `packages/rpc-proxy-builder/` skeleton — single export root.
  - peerDependencies: `@gertsai/api-core: workspace:^`.
  - tsup external: `['@gertsai/api-core']`.
- **W-3-9-18**: Implement `createRpcProxy<TActionMap>(transport, actions)` — `src/proxy.ts`.
  - `RpcTransport` interface.
  - `RpcCallOptions` interface.
  - `RpcProxy<TActionMap>` mapped type.
  - Module-private `Symbol('rpc-proxy')` brand per ADR-009 I-7.
  - Proxy `get` trap returns `(input, options?) => transport.call(actionName, input, options)`.
  - Cache: WeakMap<TActionMap, RpcProxy<TActionMap>> for idempotent build.
- **W-3-9-19**: `src/types.ts` + `src/index.ts` — type-only `import type { ActionDefinition } from '@gertsai/api-core'`.
- **W-3-9-20**: Tests (≥12):
  - proxy.test.ts (8): build proxy from action map, type-narrow input/output, transport.call dispatch, options propagation, idempotent cache, brand symbol verification, `Reflect.set` blocked (read-only proxy), unknown action returns undefined.
  - integration.test.ts (4): mock RpcTransport with sync impl, async error propagation, options bridging, multiple actions in same proxy.
- **W-3-9-21**: README — Install / Quickstart with mock transport / API / Cross-references / License.

### Track 4: `@gertsai/rest-request-manager` (T4, F, Tier 2)

- **W-3-9-22**: Create `packages/rest-request-manager/` skeleton.
  - peerDependencies: `@gertsai/fetch: workspace:^`, `@gertsai/errors: workspace:^`, `@gertsai/async-utils: workspace:^`, `@gertsai/logger-factory: workspace:^` (optional).
  - peerDependenciesMeta: `@gertsai/logger-factory: { optional: true }`.
  - tsup external: `['@gertsai/fetch', '@gertsai/errors', '@gertsai/async-utils', '@gertsai/logger-factory']`.
- **W-3-9-23**: Implement `RestRequestManager` class — `src/manager.ts`. Composes:
  - `retry()` from async-utils for retry policy.
  - Internal token-bucket rate limiter — `src/rate-limiter.ts`.
  - Internal circuit breaker per host — `src/circuit-breaker.ts`. State machine closed/half-open/open. Map<host, State>.
  - Translation layer: HTTP status → AppError subclass per ADR-009 I-8 (4xx → ValidationError/NotFoundError/UnauthorizedError/ForbiddenError/ConflictError/RateLimitedError; 5xx → InternalError/UpstreamFailureError/BadGatewayError; timeout → TimeoutError).
- **W-3-9-24**: Convenience methods `get/post/put/delete/patch` — `src/manager.ts` extension.
- **W-3-9-25**: `getStats()` / `resetStats()` — diagnostics.
- **W-3-9-26**: `src/redaction.ts` — apply REDACTION_KEYS from errors to logged request/response.
- **W-3-9-27**: Tests (≥18):
  - manager.test.ts (8): get/post/put/delete/patch convenience; full request() with all opts; status → AppError mapping (4xx + 5xx + timeout); circuit-breaker state transitions.
  - rate-limiter.test.ts (4): token-bucket happy path, refill rate, burst, exhaustion → RateLimitedError.
  - circuit-breaker.test.ts (4): closed → open on threshold, half-open recovery, reset window.
  - redaction.test.ts (2): request/response body redaction via REDACTION_KEYS.
- **W-3-9-28**: README per template + Security/Caveats (circuit-breaker semantics, rate-limit precision, redaction list).

### Track 5: Phase B Integration (T5, team-lead solo)

- **W-3-9-29**: `pnpm install` → 39 packages.
- **W-3-9-30**: `pnpm build` — 39 + m9s-example green.
- **W-3-9-31**: `pnpm test` — target ≥4772 + ~63 added (~18 + ~15 + ~12 + ~18) = ≥4835.
- **W-3-9-32**: `pnpm typecheck` + `depcruise` + `lint` + publint — green.
- **W-3-9-33**: Update `CLAUDE.md` tier table 35 → 39 + Wave 5 complete note.
- **W-3-9-34**: Create 4 changesets (all minor).

### Track 6: Phase C+D Audit + Evidence (T6, team-lead solo)

- **W-3-9-35**: Post-Build fidelity audit — 4 reviewers parallel.
- **W-3-9-36**: Address P0/P1 (if any).
- **W-3-9-37**: Create EVID-016 (CL3, supports). **Wave 5 complete summary.**
- **W-3-9-38**: Activate SPEC-014.
- **W-3-9-39**: Single atomic commit.
- **W-3-9-40**: Hindsight retain Group 41 — Wave 5 fully complete (13 packages).

## Data Models

Cross-reference ADR-009 §Decisions A/B/C/D for full type definitions. Brief recap of the 4 packages' API surfaces:

### `@gertsai/async-utils` (root export, ZERO peer-deps per ADR-009 I-1)

```typescript
export function sleep(ms: number): Promise<void>;
export function withTimeout<T>(action: () => Promise<T>, timeoutMs: number, message?: string): Promise<T>;
export interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; reject(reason?: unknown): void; }
export function defer<T = void>(): Deferred<T>;
export function debounce<TArgs extends readonly unknown[]>(fn: (...args: TArgs) => void, waitMs: number): { (...args: TArgs): void; cancel(): void; flush(): void; };
export function throttle<TArgs extends readonly unknown[]>(fn: (...args: TArgs) => void, limitMs: number): { (...args: TArgs): void; cancel(): void; };
export interface RetryOpts {
  readonly maxAttempts?: number;
  readonly baseMs?: number;
  readonly maxMs?: number;
  readonly factor?: number;
  readonly jitter?: 'none' | 'full' | 'equal';
  readonly retryable?: (error: unknown) => boolean;
  readonly onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  readonly signal?: AbortSignal;
}
export function retry<T>(action: () => Promise<T>, opts?: RetryOpts): Promise<T>;
export interface CancellableSignal { readonly signal: AbortSignal; cancel(reason?: unknown): void; }
export function makeCancellable(): CancellableSignal;
```

### `@gertsai/logger-factory` (root + /pino + /winston subpaths)

```typescript
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface LogContext { readonly [key: string]: unknown; }
export interface Logger {
  trace(msg: string, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  fatal(msg: string, ctx?: LogContext): void;
  child(boundCtx: LogContext): Logger;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}
export interface LoggerBackend { log(level: LogLevel, msg: string, ctx: LogContext): void; }
export interface LoggerFactoryOpts { readonly level?: LogLevel; readonly backend?: LoggerBackend; readonly baseContext?: LogContext; readonly redact?: readonly string[]; }
export function createLogger(opts?: LoggerFactoryOpts): Logger;
export const consoleBackend: LoggerBackend;
// /pino subpath: createPinoBackend(pinoInstance: unknown): LoggerBackend
// /winston subpath: createWinstonBackend(winstonInstance: unknown): LoggerBackend
```

### `@gertsai/rpc-proxy-builder` (root export)

```typescript
import type { ActionDefinition } from '@gertsai/api-core';

export interface RpcCallOptions {
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}
export interface RpcTransport {
  call<TInput, TOutput>(actionName: string, input: TInput, options?: RpcCallOptions): Promise<TOutput>;
}
export type RpcProxy<TActionMap extends Record<string, ActionDefinition<unknown, unknown>>> = {
  [K in keyof TActionMap]: TActionMap[K] extends ActionDefinition<infer I, infer O>
    ? (input: I, options?: RpcCallOptions) => Promise<O>
    : never;
};
export function createRpcProxy<TActionMap extends Record<string, ActionDefinition<unknown, unknown>>>(
  transport: RpcTransport,
  actions: TActionMap,
): RpcProxy<TActionMap>;
```

### `@gertsai/rest-request-manager` (root export)

```typescript
import type { Logger } from '@gertsai/logger-factory';
import type { RetryOpts } from '@gertsai/async-utils';

export interface RestRequest<TBody = unknown> {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: TBody;
  readonly timeoutMs?: number;
}
export interface RestResponse<T = unknown> {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: T;
}
export interface RestCallOpts { readonly headers?: Readonly<Record<string, string>>; readonly timeoutMs?: number; }
export interface RestRequestManagerStats { readonly totalRequests: number; readonly totalRetries: number; readonly circuitOpens: number; readonly rateLimitedRequests: number; }
export interface RestRequestManagerOpts {
  readonly baseUrl?: string;
  readonly retry?: RetryOpts;
  readonly rateLimit?: { readonly tokensPerSecond: number; readonly burst?: number };
  readonly circuitBreaker?: { readonly failureThreshold: number; readonly resetTimeoutMs: number };
  readonly logger?: Logger;
  readonly redactRequestKeys?: readonly string[];
  readonly redactResponseKeys?: readonly string[];
}
export class RestRequestManager {
  constructor(opts?: RestRequestManagerOpts);
  request<TBody = unknown, TResponse = unknown>(request: RestRequest<TBody>): Promise<RestResponse<TResponse>>;
  get<TResponse>(url: string, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  post<TBody, TResponse>(url: string, body: TBody, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  put<TBody, TResponse>(url: string, body: TBody, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  delete<TResponse>(url: string, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  patch<TBody, TResponse>(url: string, body: TBody, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  getStats(): RestRequestManagerStats;
  resetStats(): void;
}
```

Per ADR-009 I-8: rest-request-manager throws AppError subclasses (`TimeoutError`, `RateLimitedError`, `UpstreamFailureError`, `BadGatewayError`, `InternalError`) — never bare `Error`.

## Out of scope

- Wave 6+ (next reference triage findings) — separate sprint.
- async-utils errors-aware variant (`withTimeoutTyped` throwing `TimeoutError`) — defer; consumers wrap.
- logger-factory transport abstraction (custom WebSocket logger backends) — Wave 6+.
- rpc-proxy-builder Moleculer adapter — Wave 6+; Sprint 3.9 ships transport-agnostic core only.
- rest-request-manager OAuth2/auth flow — Wave 6+; Sprint 3.9 ships transport core.
- v0.2.0 publish gate — separate user confirmation.

## Strategy markers

| Track | Marker |
|---|---|
| T1 async-utils | F |
| T2 logger-factory | F |
| T3 rpc-proxy-builder | F |
| T4 rest-request-manager | F |

## Acceptance Checklist

- [ ] T1 (W-3-9-1..10): @gertsai/async-utils Tier 1 zero-dep; ≥18 tests; README.
- [ ] T2 (W-3-9-11..16): @gertsai/logger-factory Tier 1 + /pino /winston subpaths; ≥15 tests; README.
- [ ] T3 (W-3-9-17..21): @gertsai/rpc-proxy-builder Tier 3; ≥12 tests; README.
- [ ] T4 (W-3-9-22..28): @gertsai/rest-request-manager Tier 2; ≥18 tests; README.
- [ ] T5 (W-3-9-29..34): full repo verify; CLAUDE.md 35 → 39; 4 changesets.
- [ ] T6 (W-3-9-35..40): post-Build audit; EVID-016; activate; commit; Hindsight Group 41.

## Sprint 3.9 acceptance bundle

1. 4 packages publishable as 0.1.0 candidates.
2. Test count: 4772 → ≥4835 (~63 added).
3. Package count: 35 → 39.
4. Branch state: 1 atomic commit on `feat/sprint-3-9-wave-5-phase-4`.
5. ADR-009 invariants I-1..I-13 preserved.
6. Wave 5 complete: 13 packages total (Phase 1 + 2 + 3 + 4).

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | async-utils withTimeout AbortController cleanup leak | finally block clearTimeout + abort; tests verify |
| R-2 | logger-factory pino/winston peer-dep gate fails silently | clear error message + tests |
| R-3 | rpc-proxy-builder DTS emit too complex for tsup | simplify to `Record<keyof TActionMap, ...>` if needed |
| R-4 | rest-request-manager circuit-breaker state grows unbounded | LRU eviction (default 1000 hosts) |
| R-5 | rate-limiter precision in high-load Node | use process.hrtime.bigint() |

## File ownership matrix

| Worker | Owns |
|---|---|
| async-utils-worker | `packages/async-utils/**` |
| logger-factory-worker | `packages/logger-factory/**` |
| rpc-proxy-builder-worker | `packages/rpc-proxy-builder/**` |
| rest-request-manager-worker | `packages/rest-request-manager/**` |
| team-lead Phase B | CLAUDE.md, lockfile, 4 changesets |

**Conflict-free**: 0 shared files between Wave 1 workers.

## Implementation Plan — AgentTeams

### Wave 1 (4∥ workers, parallel)

- **async-utils-worker** (T1) — Tier 1 leaf, ZERO peer-deps.
- **logger-factory-worker** (T2) — Tier 1, /pino /winston subpaths.
- **rpc-proxy-builder-worker** (T3) — Tier 3, type-only api-core import.
- **rest-request-manager-worker** (T4) — Tier 2, peer-deps on async-utils + logger-factory + fetch + errors.

All 4 may import their peer-deps immediately (Sprint 3.6/3.7 published Tier 1 packages already; async-utils ships in this Sprint as Tier 1 sibling — rest-request-manager-worker uses local stub if symlink not yet resolved per Amendment fallback pattern).

### Wave 2 (team-lead solo) — Phase B verify (T5).

### Wave 3 (4∥ reviewers, post-Build) — fidelity audit (T6).

### Wave 4 (team-lead solo) — EVID-016 + commit + Hindsight.

## Affected Files

**Wave 1 creates**:
- `packages/async-utils/**`, `packages/logger-factory/**`, `packages/rpc-proxy-builder/**`, `packages/rest-request-manager/**`.

**Wave 2 (team-lead Phase B)**:
- `CLAUDE.md`, `pnpm-lock.yaml`, `.changeset/sprint-3-9-{async-utils,logger-factory,rpc-proxy-builder,rest-request-manager}.md`.

**Wave 4 (team-lead Phase D)**:
- `.forgeplan/evidence/EVID-016-sprint-3-9-shipped.md`.

## Related Artifacts

| Artifact | Type | Relation |
|---|---|---|
| PRD-003 (Wave 5) | PRD | based_on |
| ADR-009 (Wave 5 Phase 4) | ADR | based_on |
| ADR-008 (Wave 5 Phase 3) | ADR | informs |
| ADR-007 (Wave 5 Phase 2) | ADR | informs |
| ADR-006 (Wave 5 Phase 1 — errors Shared Kernel) | ADR | informs |
| EVID-015 (Sprint 3.8 baseline) | Evidence | informs |

> **Next step**: SPEC-014 validate + activate → pre-Build audit → Build → post-Build audit → EVID-016 → Activate. **Wave 5 COMPLETE** — final phase.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers delivered findings. Workers MUST follow Amendment 1 over original W-items. Cross-reference: ADR-009 Amendment 1 (full rationale + invariants I-14..I-17 + 13 fix items).

### A1.1 — W-item supersessions

**W-3-9-3 SUPERSEDED**: `withTimeout<T>` MUST use `AbortSignal { once: true }` for internal listeners + cleanup in `finally` per ADR-009 I-16. NEW W-3-9-9 test: 1000-iter listener leak smoke.

**W-3-9-6 SUPERSEDED**: `retry<T>` default `jitter: 'full'` (was `'equal'`) per ADR-009 Amendment 1.2.7. README §Security/Caveats W-3-9-10 documents thundering herd.

**W-3-9-12 SUPERSEDED**: `createLogger` default `redact` MUST be `REDACTION_KEYS` from `@gertsai/errors` per ADR-009 I-17 (NOT empty). Consumer `redact` extends (set union); cannot disable. `child(boundCtx)` returns NEW Logger with `Object.freeze({ ...parent.mergedContext, ...boundCtx })` per Amendment 1.2.6. Independent level state.

**W-3-9-15 SUPERSEDED**: 4 NEW tests added per Amendment 1.2.5/1.2.6: redaction default-on test; child snapshot (parent.setLevel doesn't affect child); child PII isolation; redaction extends (consumer passes `['custom']` → REDACTION_KEYS + 'custom' both redact).

**W-3-9-18 SUPERSEDED**: `createRpcProxy` Proxy MUST install **3 traps** per ADR-009 I-15:
- `get` trap: returns action fn for known keys; throws `Error('Unknown RPC action: ' + String(prop))` for unknown string keys (per I-14); returns undefined for symbol-keyed access (Symbol.iterator etc.) gracefully.
- `set` trap: returns false (TypeError in strict mode).
- `deleteProperty` trap: returns false.
- Implementation note: explicit return cast `as RpcProxy<TActionMap>` per typescript P1-2.

`import type { ActionDefinition } from '@gertsai/api-core/contracts'` (subpath, NOT root) per Amendment 1.1.1.

**W-3-9-19 SUPERSEDED**: `import type { ActionDefinition } from '@gertsai/api-core/contracts'` (subpath). ActionDefinition was added to api-core pre-Build per Amendment 1.1.1.

**W-3-9-20 SUPERSEDED**: tests updated per Amendment 1.2.2/1.2.3:
- proxy.test.ts (10): build proxy from action map, type-narrow input/output, transport.call dispatch, options propagation, idempotent cache, brand symbol verification, **`Reflect.set` blocked → TypeError in strict mode**, **unknown string action throws Error** (I-14), **`delete proxy.foo` returns false** (I-15), symbol-keyed (Symbol.iterator) returns undefined gracefully.
- integration.test.ts (4): unchanged.
- (optional) dts-fixture.test-d.ts: compile-time `expectTypeOf` for input/output narrowing per typescript P1-1.

**W-3-9-22 SUPERSEDED**: `RestRequestManager` package.json adds `"engines": { "node": ">=22" }` per Amendment 1.2.10. README §Security/Caveats documents Node-only.

**W-3-9-23 SUPERSEDED**: Circuit-breaker uses **LRU Map** (default `maxHosts: 1000`, configurable via `circuitBreaker.maxHosts`) per Amendment 1.2.1. On eviction, evicted state lost (closed-by-default). Translation layer adds AbortError → TimeoutError per Amendment 1.2.8:
```typescript
try {
  return await withTimeout(action, timeoutMs);
} catch (e) {
  if (e instanceof Error && e.name === 'AbortError') {
    throw new TimeoutError({ message: 'Request timeout', details: { timeoutMs } });
  }
  throw e;
}
```
Admissibility: `RestRequestManagerOpts` MUST NOT expose `rejectUnauthorized: false` or equivalent per Amendment 1.2.11.

**W-3-9-27 SUPERSEDED**: NEW circuit-breaker test: "1001st host insert evicts first; eviction logged in stats". Total tests: 19 (was 18).

### A1.2 — Worker sequencing (Amendment 1.2.9)

Wave 1 workers ONLY write `src/` + `package.json` + `README.md` + `CHANGELOG.md` + tsup/vitest configs. **No per-package `pnpm install` or `pnpm test` during Wave 1** (deferred to Phase B per Sprint 3.7+3.8 lessons).

Exceptions:
- async-utils-worker (Tier 1 leaf, zero peer-deps) MAY run own `pnpm test`.
- logger-factory-worker MAY run own `pnpm test` (only depends on errors which is published).
- rpc-proxy-builder-worker SHOULD wait for Phase B (depends on api-core ActionDefinition added pre-Build).
- rest-request-manager-worker MUST wait for Phase B (depends on async-utils sibling shipped same Sprint).

### A1.3 — Documentation conventions (per Amendment 1.3.1..1.3.9)

Cross-reference ADR-009 Amendment 1.3 for full templates. Each README:
- Sections per Amendment 1.3.1 (per-package list).
- Quickstart code per Amendment 1.3.2 (canonical inlined snippets).
- Install error wording per Amendment 1.3.3.
- Compat matrix per Amendment 1.3.4.
- Subpath docs per Amendment 1.3.5 (logger-factory only).
- Cross-references per Amendment 1.3.6.

### A1.4 — Phase B Integration additions

**W-3-9-29 SUPERSEDED**: `pnpm install` + verify api-core dist contains `ActionDefinition` export (added pre-Build per Amendment 1.1.1).

**W-3-9-31 SUPERSEDED**: target tests ≥4772 + ~70 added (~19 + ~19 + ~14 + ~22 = ~74) → target ≥4846. Includes adversarial tests per Amendment 1.

**W-3-9-33 SUPERSEDED**: CLAUDE.md tier table 35 → 39 + Wave 5 complete preamble per Amendment 1.3.8.

**W-3-9-34 SUPERSEDED**: 4 changesets per Amendment 1.3.7 inline templates.

### A1.5 — Phase D additions

**W-3-9-37 SUPERSEDED**: EVID-016 MUST include "Wave 5 retrospective" section per Amendment 1.3.9 (5 mandatory sub-sections).

### Amendment 1 changelog

Cross-reference ADR-009 Amendment 1 changelog table for full source attributions.






