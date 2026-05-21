# @gertsai/async-utils

## 0.3.1

### Patch Changes

- 30d3b10: Wave 28 — close EVID-080 MED+LOW polish tail across 7 packages (4 MED + 10 LOW, +13 new tests).

  Solo teammate (typescript-pro). +252/-19 LOC. 0 workspace typecheck errors.

  **MED tail (4 actionable, M4 uuid rename deferred to v1.x; M10 already-correct):**

  - **FR-1 (M3) entity** — `EntityWithMetadata.$markSaved` becomes idempotent (guard on `_isMockup === false`). Matches `$markStaled`/`$markFresh` pattern.
  - **FR-2 (M5) session** — Default `errorHandler` now calls `console.error` instead of silent no-op. Easy revert via explicit `errorHandler: () => {}` opt.
  - **FR-3 (M8) tenant-resolver** — JSDoc on `chain-resolver` serial-by-design loop. Doc-only.
  - **FR-4 (M9) runtime-context** — `@example` JSDoc on `requireAuthContextWithDataAccess` showing distinction from `isImpersonating` (from `@gertsai/session-guard`).

  **LOW tail (10):**

  - **FR-6 (L1) audit-primitives** — `convert.ts` adds RangeError guards for negative epoch ms inputs.
  - **FR-7 (L2) async-utils** — `with-timeout.ts` JSDoc on AbortController best-effort fire-and-forget semantics.
  - **FR-8 (L3) async-utils** — `throttle.ts` JSDoc on `cancel()` reset-lastInvoke behaviour.
  - **FR-9 (L4) entity** — `adapters/vue.ts` truthy-check → `typeof === 'function'` triple-check with descriptive error.
  - **FR-10 (L5) tenant-resolver** — `header.strategy.ts` JSDoc on `string[]` header first-value behaviour.
  - **FR-11 (L6) tenant-resolver** — `subdomain.strategy.ts` IPv4 regex now range-precise (octets 0–255).
  - **FR-12 (L7) rpc-proxy-builder** — `proxy.ts` adds `has`/`ownKeys`/`getOwnPropertyDescriptor` traps. `'foo' in proxy` and `Object.keys(proxy)` now behave as expected.
  - **FR-13 (L8) rpc-proxy-builder** — `proxy.ts` get trap special-cases `then`/`catch`/`finally` → `undefined` for Promise-unwrap detection. `await proxy` no longer throws.
  - **FR-14 (L9) logger-factory** — `winston/index.ts` JSDoc on fatal→error mapping loss-of-distinction.
  - **FR-15 (L10) logger-factory** — `pino/index.ts` accepts optional `pinoOptions` second arg passed through to `pino()`. Backward compat preserved.

  **M4 (OperatorRef.\_uid → uuid rename)** — intentionally **deferred** to v1.x minor/major. Surface-breaking rename, not a patch-level polish.

  **M10 (`ctx.meta ?? {}` lazy-create)** — EVID-080 tagged as "code is correct; readability note". No action.

  **Tests**: +13 new (1 entity EntityWithMetadata + 1 entity vue + 1 session console.error + 1 tenant-resolver subdomain IPv4 + 4 audit-primitives negative epochs + 2 rpc-proxy-builder traps + 1 rpc-proxy-builder thenable + 2 logger-factory pinoOptions).

  **Behaviour clarifications**:

  - FR-1: `$markSaved` no-op when already saved — consumers who relied on re-emit must call manually.
  - FR-2: New errorHandler default emits `console.error('[gertsai/session] uncaught error:', err)`. Pass explicit handler to silence.
  - FR-12: `'foo' in proxy` and `Object.keys(proxy)` semantics change from "always empty" to "reflects registered actions".
  - FR-13: `await proxy` returns the proxy itself (was: threw `Unknown RPC action: then`).
  - FR-15: `pino(opts)` signature added — defaults preserved when called with no args.

  All bumps: patch. Zero public surface breaks.

  EVID-080 tail closure: **4/4 actionable MED closed + 10/10 LOW closed**. Combined with Wave 26 (5/5 HIGH + 3/10 MED), audit gap fully drained across all 41 packages.

  Refs: PRD-064, EVID-080 (Wave 25 audit), EVID-082 (Wave 28 evidence).

## 0.3.0

### Minor Changes

- 05258e5: Wave 12.D-fix Teammate D — close 7 HIGH/MED logic findings per PRD-036:

  - **FR-017 (async-utils)** — `sleep(ms, signal?)` now accepts an
    `AbortSignal` and rejects with `signal.reason` (or `Error('Sleep aborted')`)
    when aborted. `retry()` propagates its signal into the back-off sleep
    AND re-checks the signal after `await sleep()` so a mid-back-off abort
    surfaces immediately instead of completing the full delay window.
  - **FR-018 (session-guard)** — `isImpersonating(session)` is now a
    pure predicate that returns `false` for `undefined` / `null` / empty
    UUIDs (CWE-1188 fail-closed). New companion helpers added:
    `assertImpersonating(session)` (throws `DataAccessUuidMissingError` on
    empty UUIDs, plain `Error` when UUIDs equal) and
    `checkImpersonating(session)` (returns `CheckResult<{ impersonating }>`
    discriminating the three failure modes).
  - **FR-019 (runtime-context)** — `RequestContext.$setSession` now throws
    with an explicit single-middleware-invariant message (EVID-051 L-3) so
    accidental "middleware ran twice" races surface as a hard error rather
    than a silent authorisation downgrade. JSDoc on `$freeze()` documents
    the invariant.
  - **FR-020 (runtime-context)** — `DefaultFeatureContext` accepts an
    optional `FeatureContextLogger` (structural `Pick<Logger, 'warn'>`
    shape, no hard import on `@gertsai/logger-factory`). When a logger is
    configured, flag-provider exceptions are logged at `warn` level before
    defaulting to `false`. Back-compat preserved (no logger = silent).
  - **FR-021 (entity-storage)** — `set` / `update` / `delete` / `destroy` /
    `restore` / `upsert` now re-check `_destroyed` after every
    `await provider.*` and suppress the emit if the service was destroyed
    mid-operation (EVID-051 L-5). Upsert JSDoc documents the 2-RTT TOCTOU
    race and recommended mitigations (native 1-RTT fast path or
    `runTransaction`). Full transactional upsert fallback tracked for
    Wave 14 / D2.
  - **FR-011 (arch)** — `engines.node ">=22"` added to `runtime-context`
    and `entity-storage` (both use `node:crypto` / `node:events`).
    `async-utils` and `session-guard` remain Node-builtin-free.

## 0.2.0

### Minor Changes

- c6896c4: Initial release. Tier 1 zero-peer-dep async utilities.

  - `sleep(ms)` / `withTimeout<T>(action, timeoutMs, message?)` (signal listener cleanup per ADR-009 I-16, no leak across 1000+ invocations).
  - `defer<T>()` / `debounce(fn, waitMs)` / `throttle(fn, limitMs)` with `cancel()`/`flush()` semantics.
  - `retry<T>(action, opts?)` exponential backoff. Default jitter `'full'` (CWE-409 thundering herd protection per ADR-009 Amendment 1.2.7). Honors `signal: AbortSignal`.
  - `makeCancellable()` AbortController helper.

  ZERO `@gertsai/*` peer-deps per ADR-009 I-1 (Tier 1 leaf). Throws standard `Error` (not `@gertsai/errors` AppError per I-2) — consumers wrap if needed.

### Patch Changes

- 782a3e0: Sprint 3.10 — Wave 5 P2 polish batch (additive non-breaking).

  `@gertsai/errors` (MINOR — observable behavior change for nested redaction):

  - `wrapUnknownError(x, kind?, correlationId?)` — `kind?` now applied via closed allow-list `'INTERNAL' | 'EXTERNAL'` (TS 2-arity union). `isAppError(x)` early-return preserved (no kind override on already-typed errors). Mitigates CWE-285 (error coercion for auth bypass).
  - `AppError` constructor JSDoc note re shallow `Object.freeze` (deep-freeze deferred).
  - `redactDetails()` now deep-scans recursively (max depth 5, breadth cap 1000, WeakSet anti-cycle, non-plain objects passthrough — Date/RegExp/Buffer left as-is). Mitigates CWE-209 nested info exposure + CWE-400/674 DoS via crafted payloads.
  - `errors/internal.ts` JSDoc clarification (catch-all `D` intentional; subclassing path documented).
  - README cross-references switched to absolute repo URLs (post-publish friendliness; scope expanded to all 13 Wave 5 package READMEs).

  Other Wave 5 packages (PATCH — JSDoc/comment polish, no behavior change):

  - `@gertsai/tenant-resolver`: `MOLECULER_*_HINT` message split (`NON_MOLECULER_CTX_ERROR` vs `MOLECULER_PEER_DEP_ERROR`), `PathStrategy` `...` wildcard JSDoc (trailing-only), `lookupHeader()` precedence note (exact-case-first short-circuit).
  - `@gertsai/runtime-context`: `requireAuthContextWithDataAccess` JSDoc clarified Session.dataAccessUuid getter fallback semantic.
  - `@gertsai/entity-storage`: `BaseEntityStorageService.upsert` 2-RTT cost JSDoc (cross-link KNOWN-ISSUES §10).
  - `@gertsai/entity-react`: `markRaw` `configurable: false` JSDoc (escape-hatch intentionally irreversible).
  - `@gertsai/rest-request-manager`: log `error.cause` chain on transport failure (5-level WeakSet bounded).
  - `@gertsai/async-utils`: `retry` JSDoc cross-ref to thundering herd Sprint 3.9 Amendment 1.2.7 default `'full'` jitter rationale.

  Refs ADR-010 §A + Amendment 1 §A1.2 (wrapUnknownError allow-list) + §A1.3 (redactDetails deep-scan).

## 0.1.0

### Minor Changes

- Initial release. Tier 1 zero-dep async utilities extracted from Orchestra (Sprint 3.9, Wave 5 Phase 4).
- API: `sleep`, `withTimeout`, `defer`, `debounce`, `throttle`, `retry`, `makeCancellable`.
- Per ADR-009 Decision A + invariants I-1 (zero `@gertsai/*` peer-deps), I-2 (standard `Error` for timeouts), I-16 (AbortSignal cleanup), I-17 (default `jitter: 'full'`).
