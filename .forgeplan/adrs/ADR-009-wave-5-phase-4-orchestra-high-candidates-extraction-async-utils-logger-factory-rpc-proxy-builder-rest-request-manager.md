---
depth: standard
id: ADR-009
kind: adr
last_modified_at: 2026-05-06T20:42:01.862035+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-008
  relation: refines
status: active
title: Wave 5 Phase 4 — Orchestra HIGH candidates extraction (async-utils + logger-factory + rpc-proxy-builder + rest-request-manager)
---

# ADR-009: Wave 5 Phase 4 — Orchestra HIGH candidates extraction

## Context

Wave 5 progress: Phase 1 (Sprint 3.6, EVID-013) + Phase 2 (Sprint 3.7, EVID-014) + Phase 3 (Sprint 3.8, EVID-015) shipped foundation libraries (errors, tenant-resolver, runtime-context, session-guard, audit-primitives, 4 framework adapters). 35-package monorepo, 4772 tests. Sprint 3.9 = **final phase of Wave 5** — extract 4 Orchestra HIGH candidates identified in W-7 reference coverage triage (per memory recall: Orchestra scan 2026-05-06).

The 4 candidates were identified as HIGH OSS value across Orchestra projects:
1. **rpc-proxy-builder** — type-safe RPC proxy generator (used in Orchestra's API client layer).
2. **logger-factory** — structured logger with pluggable backends.
3. **async-utils** — generic async utilities (sleep, withTimeout, debounce, throttle, retry, deferred).
4. **rest-request-manager** — retry + rate-limit + circuit-breaker over HTTP.

Each candidate is generic enough to extract OSS-friendly. Wave 5 closes here; Wave 6+ will address subsequent reference triage findings.

Three architectural decisions need fixation BEFORE SPEC-014:

1. **`@gertsai/async-utils` design** — Tier 1 zero-dep utility package. What goes in: sleep, withTimeout, debounce, throttle, retry, deferred. NO dependencies on `@gertsai/*` packages (truly leaf utility).

2. **`@gertsai/logger-factory` design** — Tier 1 structured logger. Default console backend; pluggable for pino/winston peer-optional. Interface: `createLogger(opts) → Logger`. Logger methods: trace/debug/info/warn/error/fatal (6 levels). Child logger pattern. Context propagation.

3. **`@gertsai/rpc-proxy-builder` design** — Tier 3 type-safe RPC proxy generator. Consumes `@gertsai/api-core/contracts` action shapes. Builds Proxy that satisfies action interface + dispatches to underlying transport (Moleculer broker.call OR custom transport). Generic over transport.

4. **`@gertsai/rest-request-manager` design** — Tier 2 HTTP request manager. Retry + rate-limit + circuit-breaker over `@gertsai/fetch`. Uses `@gertsai/errors` taxonomy for typed failures. Uses `@gertsai/async-utils` (peer-dep on Tier 1 sibling). Uses `@gertsai/logger-factory` for diagnostics.

5. **Wave 5 Phase 4 invariants** — preserve Wave 5 Phase 1-3 invariants (errors as Shared Kernel, no concrete framework runtime, peer-optional patterns).

## Decision

### Decision A — `@gertsai/async-utils`

Tier 1 zero-dep utility package per Wave 5 Phase 4 §A.

**API surface (single root export)**:

```typescript
// Sleep
export function sleep(ms: number): Promise<void>;

// Timeout wrapper — throws TimeoutError if action exceeds limit
export function withTimeout<T>(
  action: () => Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T>;

// Deferred — manual resolve/reject promise
export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}
export function defer<T = void>(): Deferred<T>;

// Debounce — delay callback by wait period; subsequent calls reset timer
export function debounce<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): {
  (...args: TArgs): void;
  cancel(): void;
  flush(): void;
};

// Throttle — limit callback to once per period
export function throttle<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  limitMs: number,
): {
  (...args: TArgs): void;
  cancel(): void;
};

// Retry — retry action with exponential backoff
export interface RetryOpts {
  readonly maxAttempts?: number; // default 3
  readonly baseMs?: number; // default 100
  readonly maxMs?: number; // default 5000
  readonly factor?: number; // default 2 (exponential)
  readonly jitter?: 'none' | 'full' | 'equal'; // default 'equal'
  readonly retryable?: (error: unknown) => boolean; // default: retry all
  readonly onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}
export function retry<T>(
  action: () => Promise<T>,
  opts?: RetryOpts,
): Promise<T>;

// CancellableSignal — AbortController helper
export interface CancellableSignal {
  readonly signal: AbortSignal;
  cancel(reason?: unknown): void;
}
export function makeCancellable(): CancellableSignal;
```

**Key design choices**:

1. **Zero internal deps** — `dependencies: {}`, `peerDependencies: {}` (Tier 1 pure).
2. **No `@gertsai/errors` dep** — `withTimeout` throws standard `Error` with message; consumer wraps with errors taxonomy if needed (avoids circular dep — `@gertsai/errors` is Shared Kernel, async-utils is below it).
3. **Pure functions** — all utilities composable; debounce/throttle expose `cancel()` for cleanup.
4. **`AbortSignal` support** — `retry` accepts optional `signal: AbortSignal` to abort retry loop; `withTimeout` uses internal AbortController.

### Decision B — `@gertsai/logger-factory`

Tier 1 structured logger with pluggable backends.

**API surface**:

```typescript
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  readonly [key: string]: unknown;
}

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

export interface LoggerBackend {
  log(level: LogLevel, msg: string, ctx: LogContext): void;
}

export interface LoggerFactoryOpts {
  readonly level?: LogLevel; // default 'info'
  readonly backend?: LoggerBackend; // default console
  readonly baseContext?: LogContext;
  readonly redact?: readonly string[]; // keys to redact (e.g., 'password', 'token')
}

export function createLogger(opts?: LoggerFactoryOpts): Logger;

// Default console backend (built-in)
export const consoleBackend: LoggerBackend;

// Subpath /pino: peer-optional pino backend
// Subpath /winston: peer-optional winston backend
```

**Key design choices**:

1. **Default console backend** — works out-of-box, zero peer-deps for default usage.
2. **`/pino` and `/winston` subpaths** — peer-optional `pino` / `winston` runtime imports (subpath-only).
3. **`child(ctx)` pattern** — bound context propagation (correlationId, tenantId, requestId).
4. **Redaction list reused from `@gertsai/errors`** — peer-dep on errors for `REDACTION_KEYS` constant (Sprint 3.6 I-14 reuse). Logger applies redaction at backend call site.
5. **Levels match Sprint 3.6 errors taxonomy intent** — fatal corresponds to INTERNAL ErrorKind by convention.

### Decision C — `@gertsai/rpc-proxy-builder`

Tier 3 type-safe RPC proxy generator. Consumes action contract types from `@gertsai/api-core/contracts`. Generic over transport.

**API surface**:

```typescript
import type { ActionDefinition } from '@gertsai/api-core'; // type-only

export interface RpcTransport {
  call<TInput, TOutput>(
    actionName: string,
    input: TInput,
    options?: RpcCallOptions,
  ): Promise<TOutput>;
}

export interface RpcCallOptions {
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

// ActionMap = { [actionName]: ActionDefinition<Input, Output> }
export type RpcProxy<TActionMap extends Record<string, ActionDefinition<unknown, unknown>>> = {
  [K in keyof TActionMap]: TActionMap[K] extends ActionDefinition<infer I, infer O>
    ? (input: I, options?: RpcCallOptions) => Promise<O>
    : never;
};

export function createRpcProxy<
  TActionMap extends Record<string, ActionDefinition<unknown, unknown>>,
>(
  transport: RpcTransport,
  actions: TActionMap,
): RpcProxy<TActionMap>;
```

**Key design choices**:

1. **Generic over transport** — `RpcTransport` interface implementable for Moleculer broker, WebSocket (`@gertsai/ws-rpc`), HTTP (`@gertsai/rest-request-manager`), or custom.
2. **Type-safe via TActionMap** — Proxy-typed; consumers get full IntelliSense for action input/output types.
3. **Peer-dep on `@gertsai/api-core: workspace:^`** — types only (`import type` for ActionDefinition).
4. **No transport runtime in core** — adapters are consumer's responsibility.
5. **Builds via Proxy** — runtime trap `get` returns bound function calling `transport.call(actionName, input, options)`.

### Decision D — `@gertsai/rest-request-manager`

Tier 2 HTTP request manager. Composes retry + rate-limit + circuit-breaker over `@gertsai/fetch`.

**API surface**:

```typescript
import type { Logger } from '@gertsai/logger-factory'; // type-only OR runtime

export interface RestRequestManagerOpts {
  readonly baseUrl?: string;
  readonly retry?: RetryOpts; // from @gertsai/async-utils
  readonly rateLimit?: { readonly tokensPerSecond: number; readonly burst?: number };
  readonly circuitBreaker?: { readonly failureThreshold: number; readonly resetTimeoutMs: number };
  readonly logger?: Logger;
  readonly redactRequestKeys?: readonly string[];
  readonly redactResponseKeys?: readonly string[];
}

export class RestRequestManager {
  constructor(opts?: RestRequestManagerOpts);

  request<TBody = unknown, TResponse = unknown>(
    request: RestRequest<TBody>,
  ): Promise<RestResponse<TResponse>>;

  // Convenience methods
  get<TResponse>(url: string, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  post<TBody, TResponse>(url: string, body: TBody, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  put<TBody, TResponse>(url: string, body: TBody, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;
  delete<TResponse>(url: string, opts?: RestCallOpts): Promise<RestResponse<TResponse>>;

  // Diagnostics
  getStats(): RestRequestManagerStats;
  resetStats(): void;
}

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
```

**Key design choices**:

1. **Composes `@gertsai/fetch` + `@gertsai/async-utils.retry` + internal rate-limiter + circuit-breaker** — unified façade.
2. **Throws typed errors from `@gertsai/errors`** — `TimeoutError`, `RateLimitedError`, `UpstreamFailureError`, `BadGatewayError`, `InternalError` based on transport response.
3. **Optional logger** — passed via opts; logs request/response with redaction (reuses Sprint 3.6 redaction pattern).
4. **Circuit breaker per host** — internal state machine (closed/half-open/open) per `new URL(url).host`.
5. **Rate limiter token-bucket** — per-instance; consumers can spawn separate manager per upstream.

### Decision E — Wave 5 Phase 4 extraction policy

Применимо к Sprint 3.9. Дополняет ADR-008 Decision F.

1. **Tier placement** — async-utils (Tier 1, 0 deps), logger-factory (Tier 1, errors peer), rpc-proxy-builder (Tier 3, api-core peer + ws-rpc/rest-request-manager peer-optional), rest-request-manager (Tier 2, fetch + errors + async-utils + logger-factory peers).

2. **Dependency direction** — strict DAG. async-utils (no internal deps) ← logger-factory (errors) ← rest-request-manager (fetch + async-utils + logger-factory + errors) ← rpc-proxy-builder (api-core + optional rest-request-manager). No cycles.

3. **Subpath pattern** — only logger-factory has subpaths (`/pino`, `/winston`); others single-export.

4. **Strategy markers**: F (fresh) for all 4. No E+ refactor (no existing impl to lift).

5. **Reuse Wave 5 Phase 1-3 patterns**:
   - errors as Shared Kernel (Wave 5 Phase 1).
   - Module-private `Symbol(...)` markers (Sprint 3.8 I-11).
   - WeakMap for caches (Sprint 3.8 I-12).
   - 3 Proxy traps + Reflect.set without receiver (rpc-proxy-builder per Sprint 3.8 I-13).
   - createRequire(import.meta.url) lazy load for peer-optional runtime (Sprint 3.7+3.8 Amendment 1.2.9).
   - tsup external for cross-package generic flow (Sprint 3.7+3.8 Amendment 1.2.11).

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| A1 — Single mega-package "@gertsai/utils-x" | Rejected | Couples 4 unrelated concerns; consumers pay for unused. |
| A2 — async-utils depend on errors for TimeoutError | Rejected | Tier 1 leaf utility — circular dep risk if errors gains async-utils dep. async-utils throws standard Error; consumers wrap. |
| **A3 — 4 separate packages with strict tier hierarchy** | **Chosen** | Tree-shake friendly; clean DAG; each evolves independently. |
| B1 — logger-factory single backend (console only) | Rejected | Production needs pino/winston pluggability. |
| **B2 — logger-factory with default console + /pino /winston subpaths** | **Chosen** | Out-of-box works; production opt-in. |
| C1 — rpc-proxy-builder Moleculer-specific | Rejected | Wave 5 invariant — no concrete framework in core. |
| **C2 — rpc-proxy-builder transport-agnostic via RpcTransport interface** | **Chosen** | Generic; consumers inject Moleculer/WS/HTTP transport. |
| D1 — rest-request-manager monolithic class | Rejected | Hard to test individual concerns. |
| **D2 — rest-request-manager composing retry + rate-limit + circuit-breaker as internal modules** | **Chosen** | Each concern testable; observable via stats. |

## Consequences

### Positive

- 4 final Wave 5 packages ship — Wave 5 fully complete (13 packages total).
- async-utils is universally useful (consumed by rest-request-manager + Wave 6+ packages).
- logger-factory standardizes structured logging across `@gertsai/*` ecosystem.
- rpc-proxy-builder unblocks type-safe API client patterns.
- rest-request-manager provides production-grade HTTP retry + circuit-breaker.
- Strict Tier 1 → 2 → 3 dependency direction maintained.

### Negative (trade-offs)

- 4 new packages add ~1200-1800 LOC.
- async-utils duplicates patterns existing in `@gertsai/api-rlr` (rate-limit) — but api-rlr is Tier 5 service-side; async-utils is Tier 1 client-side. Different scope.
- logger-factory subpaths (`/pino`, `/winston`) add publishing surface; consumers without those backends pay zero cost via peer-optional.
- rpc-proxy-builder Tier 3 placement may require depcruise rule update (depends on api-core Tier 4 for types — but type-only import is acceptable cross-tier).

### Risks

- **R-1**: async-utils `withTimeout` throws standard Error → consumers wrap with errors. Mitigation: README example shows wrapping pattern.
- **R-2**: logger-factory pino/winston peer-optional subpaths — if consumer imports without runtime, clear error message per Sprint 3.6/3.7 pattern.
- **R-3**: rpc-proxy-builder Proxy overhead — JSProxy maturity makes negligible. Consumers measure if needed.
- **R-4**: rest-request-manager rate-limit token-bucket precision in Node high-load — use `process.hrtime.bigint()` for monotonic timing.
- **R-5**: Circuit breaker per-host state may grow unbounded for diverse URLs — Map<host, State> with LRU eviction (default 1000 hosts).

## Invariants

I-1: `@gertsai/async-utils` MUST have ZERO `@gertsai/*` peer-dependencies (Tier 1 leaf utility per Decision A.1).

I-2: `@gertsai/async-utils` MUST throw standard `Error` with descriptive message (NO `@gertsai/errors` dep). Consumers wrap if needed.

I-3: `@gertsai/logger-factory` core MUST default to console backend (zero peer-dep usage out-of-box).

I-4: `@gertsai/logger-factory/pino` and `/winston` subpaths MUST declare framework runtime as `peerDependenciesMeta.optional: true`.

I-5: `@gertsai/logger-factory` redaction MUST reuse Sprint 3.6 `REDACTION_KEYS` from `@gertsai/errors` (peer-dep on errors).

I-6: `@gertsai/rpc-proxy-builder` core MUST NOT import concrete transport runtime (Moleculer / WebSocket / HTTP). Type-only `import type` from `@gertsai/api-core/contracts`.

I-7: `@gertsai/rpc-proxy-builder` MUST use Proxy with module-private `Symbol(...)` brand markers (Sprint 3.8 I-11 reuse for cross-realm safety).

I-8: `@gertsai/rest-request-manager` MUST throw `@gertsai/errors` AppError subclasses (`TimeoutError`/`RateLimitedError`/`UpstreamFailureError`/`BadGatewayError`/`InternalError`) — never bare `Error`.

I-9: `@gertsai/rest-request-manager` MUST apply redaction (REDACTION_KEYS from errors) to logged request/response bodies.

I-10: All 4 Sprint 3.9 packages MUST declare strict `external` in tsup.config.ts for cross-package types (Sprint 3.7+3.8 Amendment 1.2.11 reuse).

I-11: All 4 packages MUST follow Sprint 3.6 README §template + Security/Caveats per Sprint 3.6 Amendment 1.3.

I-12: SPDX header on every new `.ts` file per ADR-005 I-5.

I-13: Per-package strategy markers (F) MUST appear in SPEC-014.

## Evidence Requirements

- **E-1**: SPEC-014 active с per-package markers (all F).
- **E-2**: `pnpm pack --dry-run` для каждого нового пакета — 0 leak.
- **E-3**: `grep -rE 'moleculer|express|fastify|koa|pino|winston' packages/{async-utils,rpc-proxy-builder,rest-request-manager}/src` returns 0 matches; `packages/logger-factory/src` returns 0 matches in core (root) — only `/pino` and `/winston` subpaths import.
- **E-4**: async-utils peerDependencies empty + zero internal `@gertsai/*` imports.
- **E-5**: rest-request-manager throws `@gertsai/errors` subclasses verified by tests.
- **E-6**: rpc-proxy-builder type-checked against api-core ActionDefinition (compile-time test fixture).
- **E-7**: Sprint 3.9 atomic commit on `feat/sprint-3-9-wave-5-phase-4` branch.

## Implementation Plan

### Phase 0: Pre-conditions
- [ ] **0.1** PRD-003 active; EVID-015 (Sprint 3.8) closed.
- [ ] **0.2** ADR-009 active.

### Phase 1: SPEC-014 + Pre-Build audit (Sprint 3.9)
- [ ] **1.1** SPEC-014 draft с W-3-9-1..N items.
- [ ] **1.2** Pre-Build audit (5 reviewers parallel).
- [ ] **1.3** Address P0/P1 audit findings via Amendment 1.
- [ ] **1.4** SPEC-014 validate + activate.

### Phase 2: Sprint 3.9 Build (4 parallel workers + team-lead)
- [ ] **2.1** AgentTeams Wave 1: 4 workers (async-utils / logger-factory / rpc-proxy-builder / rest-request-manager).
- [ ] **2.2** Team-lead Phase B: integrated verify.
- [ ] **2.3** CLAUDE.md tier table 35 → 39; 4 changesets.

### Phase 3: Post-Build audit + Activate
- [ ] **3.1** Post-Build fidelity audit (4 reviewers parallel).
- [ ] **3.2** Address P0/P1 findings (if any).
- [ ] **3.3** EVID-016 active.
- [ ] **3.4** SPEC-014 active.
- [ ] **3.5** Single atomic commit.
- [ ] **3.6** Hindsight retain Group 41. **Wave 5 fully complete.**

## Affected Files (predicted)

- `packages/async-utils/**` (NEW Tier 1)
- `packages/logger-factory/**` (NEW Tier 1 + /pino /winston subpaths)
- `packages/rpc-proxy-builder/**` (NEW Tier 3)
- `packages/rest-request-manager/**` (NEW Tier 2)
- `CLAUDE.md` (tier table 35 → 39)
- `pnpm-lock.yaml`
- `.changeset/sprint-3-9-{async-utils,logger-factory,rpc-proxy-builder,rest-request-manager}.md` (NEW × 4)
- `.forgeplan/evidence/EVID-016-sprint-3-9-shipped.md` (NEW)

## Admissibility

NOT admissible:
- NOT: `@gertsai/async-utils` имеет `@gertsai/*` peer-deps (must be 0).
- NOT: `@gertsai/logger-factory` core imports pino/winston runtime (only in subpaths).
- NOT: `@gertsai/rpc-proxy-builder` core imports concrete transport runtime.
- NOT: `@gertsai/rest-request-manager` throws bare Error (must be AppError subclass).
- NOT: skip Security/Caveats README section.
- NOT: skip SPDX headers.

## Rollback Plan

**Triggers**:
- async-utils API surface too narrow → extend additively in patch.
- logger-factory pluggable backend contract too restrictive → amend Decision B.
- rpc-proxy-builder type complexity creates DTS emit failures → simplify Proxy<TActionMap> to Record<string, Function>.
- rest-request-manager circuit breaker logic flawed → ship 0.1.x patch.

**Steps**: Open ADR-009 amendment; ship affected package patch.

**Blast Radius**: low. All 4 packages unpublished pre-Wave-5-publish.

## Affected Files

| File | Baseline Hash |
|------|---------------|
| packages/{async-utils,logger-factory,rpc-proxy-builder,rest-request-manager}/** | (NEW) |
| CLAUDE.md | post-Sprint 3.8 (commit `7c3535f`) |

## AI Guidance

> Sprint 3.9 worker rules:
- async-utils-worker: Tier 1 leaf — NO peer-deps on `@gertsai/*`. Throw standard Error.
- logger-factory-worker: default console backend; pino/winston in subpaths only with peer-optional runtime via createRequire.
- rpc-proxy-builder-worker: type-only api-core import; Proxy with module-private brand symbol.
- rest-request-manager-worker: throw AppError subclasses (TimeoutError/UpstreamFailureError/BadGatewayError/RateLimitedError/InternalError); apply redaction to logs.
- All: tsup external for cross-package types; SPDX headers; Sprint 3.6 README §template; createRequire(import.meta.url) for ESM compat.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5) | PRD | based_on |
| ADR-008 (Wave 5 Phase 3) | ADR | refines (extraction patterns reused) |
| ADR-007 (Wave 5 Phase 2) | ADR | informs |
| ADR-006 (Wave 5 Phase 1 — errors Shared Kernel) | ADR | informs |
| ADR-005 (Wave 4 storage) | ADR | informs |
| EVID-015 (Sprint 3.8 baseline) | Evidence | based_on |

> **Next step**: Activate ADR-009 → SPEC-014 → pre-Build audit → Build → post-Build audit → EVID-016 → Activate. Wave 5 COMPLETE.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers delivered findings (architect / security / ddd / typescript / docs). Workers MUST follow Amendment 1 over original Decisions where they disagree. Cross-reference: SPEC-014 Amendment 1 (W-item supersessions).

### A1.1 — Convergent fix (≥2 reviewers)

**A1.1.1 — `ActionDefinition<I, O>` ADDED to `@gertsai/api-core/contracts`** (typescript P0-1 + architect P0-A1 convergent).

Original Decision C referenced `import type { ActionDefinition } from '@gertsai/api-core'` but type did NOT exist. **Applied pre-Build**: NEW `packages/api-core/src/contracts/action-definition.ts`:
```typescript
export interface ActionDefinition<TInput = unknown, TOutput = unknown> {
  readonly input?: TInput;
  readonly output?: TOutput;
}
```
Re-exported from `contracts/index.ts`. api-core rebuilt; dist updated. Decision C imports clarified: `from '@gertsai/api-core/contracts'` (subpath, NOT root).

### A1.2 — Substantive fixes (single-reviewer P0/P1)

| ID | Source | Fix |
|---|---|---|
| A1.2.1 | security P0-S1 (CWE-770/401) | Circuit-breaker uses LRU `Map<host, State>` (default `maxHosts: 1000`, configurable). |
| A1.2.2 | security P0-S2 (CWE-1230) | rpc-proxy unknown action throws `Error` (NOT undefined). I-14. |
| A1.2.3 | security P0-S3 + ts P2-1 (CWE-1188) | rpc-proxy 3 traps: `get` / `set` (false) / `deleteProperty` (false). I-15. |
| A1.2.4 | security P1-S5 (CWE-401) | `withTimeout` AbortSignal `{once:true}` + cleanup in finally. I-16. |
| A1.2.5 | security P1-S7 (CWE-209) | logger default `redact` = REDACTION_KEYS (not empty). Consumer extends. I-17. |
| A1.2.6 | security P1-S6 (CWE-200) | `child(ctx)` frozen shallow copy + independent level state. |
| A1.2.7 | security P1-S4 (CWE-409) | retry default jitter `'full'` (was `'equal'`). |
| A1.2.8 | architect P2-A6 | rest-request-manager catches AbortError → throws `TimeoutError`. |
| A1.2.9 | architect P1-A2 | Wave 1 workers: NO per-package `pnpm install/test` (deferred to Phase B). Exception: async-utils, logger-factory (Tier 1 leaf with no fresh sibling deps). |
| A1.2.10 | security P2-S8 + architect P2-A7 | RestRequestManager Node-only: `engines.node ≥22`; documented in README §Caveats. |
| A1.2.11 | security P2-S9 | RestRequestManagerOpts MUST NOT expose `rejectUnauthorized: false`. |

### A1.3 — Documentation conventions (docs P1-1..P1-5 + P2-1..P2-3)

**A1.3.1 — README §template per package** (Sprint 3.6 §template adjusted):
- async-utils: Install / Quickstart / API / Compatibility / Security/Caveats / Cross-references / License (no Subpath).
- logger-factory: + Subpath imports (/pino /winston).
- rpc-proxy-builder + rest-request-manager: same as async-utils.

**A1.3.2 — Canonical Quickstart code** (inline per package):
- async-utils: `await sleep(100); const value = await withTimeout(fetchUser, 5000); const result = await retry(action, { maxAttempts: 3 });`
- logger-factory: `const log = createLogger({ level: 'info' }); log.info('boot', { tenantId }); const child = log.child({ requestId });`
- logger-factory /pino: `import pino from 'pino'; import { createPinoBackend } from '@gertsai/logger-factory/pino'; createLogger({ backend: createPinoBackend(pino()) });`
- rpc-proxy-builder: `const proxy = createRpcProxy(transport, actions); const user = await proxy.getUser({ id: '...' }, { timeoutMs: 5000 });`
- rest-request-manager: `const mgr = new RestRequestManager({ baseUrl, retry: { maxAttempts: 3 }, rateLimit: { tokensPerSecond: 10 } }); const r = await mgr.get<User>('/users/1');`

**A1.3.3 — Install gate error wording** (logger-factory subpaths):
`'@gertsai/logger-factory/pino requires "pino" >=8.0.0 as a peer dependency. Install it with: pnpm add pino'` (analogous for /winston).

**A1.3.4 — Compat matrix** per Sprint 3.7+3.8 pattern. Each README §Compatibility:
- async-utils: "no peer-deps".
- logger-factory: pino >=8.0.0, winston >=3.0.0, @gertsai/errors workspace:^.
- rpc-proxy-builder: @gertsai/api-core workspace:^ (type-only).
- rest-request-manager: @gertsai/fetch + errors + async-utils + logger-factory (optional).

**A1.3.5 — Subpath documentation** (logger-factory): 3 install variants + 3 import variants + typesVersions verification per Sprint 3.0.1 F-4.

**A1.3.6 — Cross-references**: ADR-009 + PRD-003 + (rest-request-manager) ADR-006 + (rpc-proxy-builder) api-core/contracts.

**A1.3.7 — Changeset templates inline** (4 .md files per spec § "Affected Files"). Cross-reference SPEC-014 Amendment for full text.

**A1.3.8 — CLAUDE.md tier-table snippet** (4 NEW rows + Wave 5 complete preamble). Cross-reference SPEC-014 Amendment.

**A1.3.9 — EVID-016 Wave 5 retrospective** (5 mandatory sub-sections):
1. Wave 5 packages tally (13 itemized).
2. Cumulative test-count delta (Sprint 3.5.2 baseline → Sprint 3.9 exit).
3. Pattern reuse audit (createRequire + tsup external + Sprint 3.6 README §template applied across all 13).
4. Invariants honored across 4 sprints (errors-as-Shared-Kernel; no concrete framework runtime; peer-optional discipline; security CWE-1321/401/672/20/674/362/770/1230 protection).
5. Lessons learned for Wave 6+ (inline templates from start; Amendment cycle frequency; pre-Build audit catches structural drift).

### A1.4 — New invariants (I-14..I-17)

**I-14**: rpc-proxy-builder Proxy `get` trap on unknown property MUST throw `Error('Unknown RPC action: ...')`. Symbol-keyed access returns undefined. Prevents fail-open + namespace probing (CWE-1230).

**I-15**: rpc-proxy-builder Proxy MUST install 3 traps (get/set/deleteProperty); set+deleteProperty return false. Read-only proxy. CWE-1188 protection.

**I-16**: async-utils.withTimeout MUST use `AbortSignal { once: true }` + cleanup in finally. No leak across 1000+ invocations (CWE-401).

**I-17**: logger-factory.createLogger default `redact` MUST be `REDACTION_KEYS` from `@gertsai/errors`. Consumer extends (set union); cannot disable. Case-insensitive shallow recursion. CWE-209 protection.

### A1.5 — File ownership matrix update

NEW: pre-Build phase modified `packages/api-core/src/contracts/action-definition.ts` (NEW) + `contracts/index.ts` (additive export). team-lead Phase B owns api-core changes per E+ refactor pattern (Sprint 3.7+3.8 precedent).

### Amendment 1 changelog summary

12 substantive amendments + 4 NEW invariants + 9 documentation conventions. Convergent P0 (ActionDefinition) addressed pre-Build. All other findings → Build phase invariants.



