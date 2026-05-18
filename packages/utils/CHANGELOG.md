# @gertsai/utils

## 0.5.0

### Minor Changes

- 8de6205: Wave 14.3+14.5 — URL validator consolidation + m9s-cache FIFO docs clarification per EVID-057.

  **Wave 14.3 — URL validator consolidation (Teammate M).**

  EVID-057 §URL Validator Audit identified 2 full-featured SSRF impls with disjoint APIs:

  - `@gertsai/fetch/lib/url-validator.ts` (result-shape, granular `allow*` flags, IPv4 int-CIDR fast path, `maxUrlLength` cap, `createUrlValidator` factory)
  - `@gertsai/utils/security/url-validator.ts` (throw-primary `validateWebhookUrl`, DNS rebinding async path, HTTPS-default, credential URL rejection, `SsrfError` typed)

  **Consolidated into `@gertsai/utils/security`** (more security-complete impl). Added to that file:

  - `validateUrl(url, options?) → { valid, error?, url? }` result-shape wrapper (default protocol `['http:', 'https:']` for HTTP-client parity; `validateWebhookUrl` keeps HTTPS-only default for webhook parity)
  - `assertSafeUrl(url, options?) → URL` throw-primary wrapper (wraps `validateUrl` failure as `Error("SSRF blocked: ...")`)
  - `createUrlValidator(presetOptions)` factory for preset configs
  - Granular `allow*` flags: `allowHttp`, `allowLocalhost`, `allowPrivateNetworks`, `allowLinkLocal`, `allowCloudMetadata`
  - IPv4 int-CIDR fast-path (`isPrivateIPv4Int`, `isLoopbackIPv4Int`, `isLinkLocalIPv4Int`)
  - IPv6 literal handlers (`isLoopbackIPv6Literal`, `isLinkLocalIPv6Literal`, `isPrivateIPv6Literal`)
  - `maxUrlLength: 2048` cap option (default unset = no cap)

  `@gertsai/fetch/lib/url-validator.ts` becomes a thin shim:

  ```ts
  export {
    validateUrl,
    assertSafeUrl,
    createUrlValidator,
    type UrlValidatorConfig,
    type UrlValidationResult,
  } from "@gertsai/utils/security";
  ```

  Marked `@deprecated` with `@see` pointing to `@gertsai/utils/security`. 31 fetch URL-validator tests migrated to `packages/utils/src/security/url-validator.test.ts` as a `describe('validateUrl (fetch-parity)')` block; deleted from fetch package. `undiciFetcher.ts` consumer continues working unchanged via the shim.

  **Wave 14.5 — m9s-cache FIFO documentation (Teammate M).**

  EVID-057 §LRU Audit flagged `@gertsai/m9s-cache MemoryCacheDriver` as **FIFO not LRU** (no `get()`-side recency touch — evicts oldest by insertion order). Pre-fix docs misleadingly claimed "LRU". Fix:

  - Class JSDoc on `MemoryCacheDriver` explicitly states "FIFO eviction (NOT LRU)" with rationale + migration path pointer to `@gertsai/utils/lru.LruMap`
  - README: 2 mislabellings corrected (`LRU + TTL` → `FIFO + TTL` in at-a-glance table + Drivers section)
  - Rationale documented: m9s-cache's FIFO matches the Moleculer cacher protocol contract for parity with its Redis driver. Don't change to LRU without aligning the upstream contract.

  **Net LOC (code-only, excluding test-port wash)**:

  - fetch impl: -313 LOC (345 → ~32 shim)
  - utils impl extended: +331 LOC
  - m9s-cache docs: +14 LOC
  - **~-224 LOC net** (vs EVID-057 estimate of -236, within 5%)

  **Tests**: utils 569 pass (was 538, +31 ported fetch-parity); fetch 39 pass (existing); m9s-cache 119 pass.

  **No public-API breaks**: `@gertsai/utils` minor (new exports); `@gertsai/fetch` patch (shim + deprecation, `validateUrl`/`assertSafeUrl`/`createUrlValidator` identifiers preserved for `undiciFetcher`); `@gertsai/m9s-cache` patch (docs-only).

  Refs: PRD-045, EVID-057 (Wave 12.F audit source), EVID-062 (Wave 14.1+14.2 LRU precedent).

- 739b3de: Wave 14.1+14.2 — LRU primitive consolidation per EVID-057.

  **Wave 14.1 — Cross-package consolidation (Teammate K).**

  EVID-057 surfaced 4 packages implementing the same insertion-order Map LRU pattern with identical eviction logic. Consolidated into `@gertsai/utils/lru` subpath:

  - **NEW**: `@gertsai/utils/lru` exports `LruMap<K,V>` (no TTL, `has()` non-touching) + `LruTtlMap<K,V>` (with TTL, `has()` touching — preserves Wave 7.4 auth-openfga semantics). Both classes support back-compat dual constructor signature: positional (`new LruMap(100)` legacy collection-style) OR options object (`new LruMap({ maxSize })`).
  - **NEW**: `LruMap.peek(key)` non-touching get for observability without perturbing eviction order.

  Migrated 4 consumers:

  - `@gertsai/auth-openfga/src/internal/lru-ttl-map.ts` → thin re-export shim from `@gertsai/utils/lru` (-127 LOC, public API preserved)
  - `@gertsai/rest-request-manager/src/circuit-breaker.ts` `hosts: Map<...>` → `LruMap<string, HostState>` (ADR-009 Amendment 1.2.1 `maxHosts: 1000` preserved). Used new `peek()` for `getState()` to avoid perturbing LRU order during observability.
  - `@gertsai/collection/src/utils/memoize.ts` `LRUCache<K,V>` → re-export shim `import { LruMap as LRUCache } from '@gertsai/utils/lru'` (-73 LOC, named export + `instanceof` semantics preserved)
  - `@gertsai/api-rlr/src/adapters/ResilientRedisAdapter.ts` private `LRUCache<K,V>` → consumes `LruMap` directly (-31 LOC, was module-private)

  **Wave 14.2 — Same-package consolidation (Teammate L).**

  - `@gertsai/core/src/deny-ledger/providers/memory.ts MemoryDenyLedger` previously inlined doubly-linked-list LRU logic that exactly duplicated `core/lru-cache.ts`. Refactored to consume the local `LRUCache<DenyEntry>` primitive (-63 LOC).
  - 3 behavioural deltas surfaced + preserved:
    1. Stats granularity kept at ledger level (not per-`get()`-probe level — `isDenied()` probes up to 4 lookup keys/call)
    2. TTL source of truth remains `DenyEntry.expiresAt`; `LRUCache` used without TTL
    3. `byId` secondary index synced via `onEvict` callback with race-guarded `byId.get(id) === entry` check

  **Net LOC**: 188 insertions / 434 deletions = **-246 net** across 6 packages (consumer reductions dominate). Source-only (excluding tests): -227 LOC consumers + ~+333 LOC kernel = +106 net source, but single source of truth means future bug fixes (CWE-770 hardening, etc.) land once.

  **Tests**: +38 new tests for kernel (20 LruMap + 18 LruTtlMap parity port). 1767 tests pass across the 5 packages (no regressions in 1195 core / 524 utils / 145 auth-openfga / 28 rest-rm / 772 collection / 298 api-rlr).

  **No public-API breaks**: utils minor bump (new exports added); 5 consumer packages patch bumps only. `auth-openfga LruTtlMap` import path unchanged via shim; `collection LRUCache` named export preserved; `rest-request-manager CircuitBreaker` external API unchanged; `api-rlr LRUCache` was module-private.

  Refs: PRD-044, EVID-057 (Wave 12.F audit source), ADR-009 Amendment 1.2.1, RFC-007.

## 0.4.0

### Minor Changes

- a26b3d6: Wave 12.B-fix-3 — close HIGH type-system finding (EVID-044) in
  `@gertsai/utils`.

  **`getSyncFields` `Record<string, any>` → `Record<string, unknown>`**

  Exported helper input constraint narrowed from `Record<string, any>`
  to `Record<string, unknown>`. Return type now explicitly `Partial<T>`
  so callers reading `result[key]` get `T[key] | undefined` instead of
  `any` — proper per-key narrowing.

  **Soft breaking:** callers explicitly typing input as
  `Record<string, any>` need to switch to `Record<string, unknown>` or
  a concrete type. Most callers use concrete types and are unaffected.
  Inside the function body, two minimal `unknown`-safe casts preserve
  soundness without leaking `any` (`(obj as Record<string, unknown>)
[key] = data[key]` and `{} as Partial<T>` reduce seed).

  **Tests:** +1 narrowing regression test asserting
  `result.name: string | undefined` and `result.progress: number |
undefined` for concrete input. 486/486 total pass.

  Refs: PRD-031, RFC-022, EVID-044.

## 0.3.0

### Minor Changes

- 4415a5f: Wave 12.B-fix-2 — close 3 HIGH security findings (EVID-044).

  **1. CWE-918 — DNS rebinding TOCTOU in `validateWebhookUrlAsync`**

  The validator resolved DNS, checked IPs were public, but did not return
  the resolved IP. Callers fetched by hostname — between validate and
  fetch, DNS could return a different IP (rebinding).

  **Fix (additive):** `validateWebhookUrlAsync` return type changed from
  `Promise<void>` to `Promise<ValidationResultAsync>` with shape:

  ```ts
  interface ValidationResultAsync {
    valid: boolean;
    url: URL;
    resolvedIp?: string; // NEW
    error?: SsrfError;
  }
  ```

  Old void-callers continue to work (return value is now non-void but the
  existing call signature is unchanged at the type-erased boundary).
  Callers wanting true rebinding protection should fetch by `resolvedIp`
  with an explicit `Host` header, per new JSDoc guidance.

  **2. CWE-400 — `resolveHostname` AbortController not wired**

  The timeout `controller.abort()` fired, but `dns.resolve4`/`resolve6`
  did not receive the signal. They ran to completion regardless; the
  `clearTimeout` in finally was defensive dead code.

  **Fix:** `abortableResolve` helper wraps DNS calls in `Promise.race`
  with an abort-signal rejector. Timeout now actually aborts the
  resolution promise.

  **3. CWE-338 — `getRandomId` weak PRNG + security-misuse trap**

  Function uses `Math.random()` and was exported with a generic name
  inviting misuse for tokens / session IDs / invite codes.

  **Fix:**

  - `@deprecated` JSDoc on `getRandomId` pointing to
    `getSecureRandomId`.
  - One-shot `console.warn` on first call (suppressed under
    `NODE_ENV=test` or `VITEST=true` to avoid test-output pollution).
  - New export `getSecureRandomId(length?: number)` using
    `crypto.randomBytes` + base62 rejection sampling (no modulo bias).
  - `getRandomId` runtime behaviour unchanged — caller decides whether
    to migrate.

  **New exports (additive):** `getSecureRandomId`,
  `ValidationResultAsync`.

  **Tests:** +6 unit tests for `getSecureRandomId`; existing URL
  validator tests updated for new return shape; +3 abort-signal tests

  - 1 IP-pinning test. 485/485 total pass.

  Refs: PRD-030, RFC-021, EVID-044.

## 0.2.0

### Minor Changes

- 0755c6d: Initial OSS release of `@gertsai/*` first-wave packages (v0.1.0).

  Extracted with preserved git history from internal `gertsai_codex` monorepo
  into the public `gertsai/shared` repository, под Apache 2.0. 14 packages
  across 5 tiers per [ADR-009][adr-009] + [ADR-011][adr-011]:

  - **Tier 1** (zero internal deps): `fsm`, `fetch`, `collection`, `llm-costs`,
    `utils`, `m9s-cache`, `ws-rpc`
  - **Tier 2** (depends on Tier 1): `di` (→ utils), `flux` (→ collection)
  - **Tier 3**: `core` (→ llm-costs), `hsm`
  - **Tier 4**: `auth-openfga` (→ core), `api-core` (→ core + auth-openfga)
  - **Tier 5** (per ADR-011): `api-rlr` (→ api-core; database-agnostic
    `PgClient` interface — drop-in compat с Prisma/Drizzle/raw-pg)

  Highlights:

  - **`@gertsai/api-rlr`**: production-grade rate limit middleware для
    Moleculer.js. Sliding-Window + GCRA через Redis Lua scripts; PostgreSQL
    adapter accepts any client structurally compatible с Prisma's
    `$queryRawUnsafe` / `$executeRawUnsafe` / `$transaction` surface.
  - **`@gertsai/api-core`**: unified `APIError`/`ResponseCode` (RFC-053),
    `ApiController`, Moleculer mixins, OpenAPI merge.
  - **`@gertsai/core`**: identity, errors, response envelope, tracing primitives.
  - **`@gertsai/fsm`** / **`@gertsai/hsm`**: zero-dep finite & hierarchical state
    machines.

  See individual package READMEs for install + quickstart.

  [adr-009]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-009-trivexdev-as-single-oss-umbrella-for-shared-packages-and-fluxis.md
  [adr-011]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-011-first-wave-extension-to-14-packages-add-api-rlr-refines-adr-009.md
