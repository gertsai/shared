# @gertsai/m9s-cache

## 0.4.1

### Patch Changes

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

## 0.4.0

### Minor Changes

- 4415a5f: Wave 12.B-fix-2 — close 2 HIGH security findings (EVID-044).

  **1. `RedlockLockProvider.tryAcquire` silent DoS amplifier**

  Previously `try { acquire } catch { return null }` could not
  distinguish "lock held" from "Redis unreachable" or "Redlock
  misconfigured". When Redis was down, every request returned
  lock-unavailable, and `wrapNonBlocking` bypassed caching for every
  request — a silent DoS amplification.

  **Fix:** new private `_isLockHeldError(err)` classifier matches
  `name === 'ResourceLockedError'` (Redlock 5.x lock-already-held) and
  `name === 'ExecutionError'` with quorum-related message. Returns
  `null` only for these expected cases; all other errors propagate to
  the caller so infrastructure outages surface immediately.

  **2. CWE-20 — `validateKeys` default backwards in production**

  Prior code:

  ```ts
  this.validateKeys =
    options.validateKeys ?? process.env.NODE_ENV !== "production";
  ```

  This validated keys in development but accepted arbitrary keys in
  production — the opposite of safe. With Redis `KEYS pattern` glob
  semantics, a tenant-supplied key fragment with `*` could match other
  tenants' keys under a later `clean()` invocation.

  **Fix:**

  ```ts
  this.validateKeys = options.validateKeys ?? true;
  ```

  Production now gets strict validation by default. Callers opt out
  explicitly with `validateKeys: false`. The Moleculer adapter
  already passes `validateKeys: false` (Moleculer generates safe keys
  per its own conventions) so it is unaffected.

  **Migration:** any external consumer constructing `CacheStore`
  directly with non-conforming keys must add `validateKeys: false`
  explicitly OR migrate keys to conform to `DEFAULT_KEY_PATTERN`. This
  is the desired security fix — callers were silently relying on lax
  production behaviour.

  **Tests:** +11 new tests for `RedlockLockProvider` error
  classification + construction; obsolete "skips validation in
  production" test replaced with 3 strict-default tests. 119/119 total
  pass.

  Refs: PRD-030, RFC-021, EVID-044.

## 0.3.0

### Minor Changes

- cb29bb0: Wave 12.B-fix-1 — close CRITICAL external-type-leak (EVID-044 CRIT-1)
  per PRD-029. Split moleculer + ioredis integrations into dedicated
  subpaths so root `@gertsai/m9s-cache` becomes truly backend-agnostic.

  **Problem:** the prior root `dist/index.d.ts:1-2` did
  `import { ... } from 'ioredis'` AND `import { ... } from 'moleculer'`,
  and `moleculer-cacher.ts` did `require('moleculer')` at module top.
  Result: `import { CacheStore } from '@gertsai/m9s-cache'` **crashed at
  module-load** if `moleculer` wasn't installed — despite both being
  declared as optional peer-dependencies. The optional-peer contract was
  broken; consumers using only `MemoryCacheDriver` got a hard
  `MODULE_NOT_FOUND`.

  **Fix:**

  1. New `@gertsai/m9s-cache/moleculer` subpath. Exports `M9sCacheCacher`,
     `moleculerDbCacheMixin`, and all moleculer-coupled types.
  2. New `@gertsai/m9s-cache/redis` subpath. Exports `RedisCacheDriver`,
     `RedlockLockProvider`, `RedisLike`, and ioredis-coupled types.
  3. Root `dist/index.d.ts` now exports ONLY backend-agnostic primitives —
     `CacheStore`, `MemoryCacheDriver`, serializers, validators,
     `NoopLockProvider`, `generateTags`, and agnostic types.
  4. `moleculer-cacher.ts` refactored to lazy `getMoleculer()` +
     Proxy-construct pattern. `M9sCacheCacher` is now a `Proxy` whose
     `construct` trap resolves the underlying class on first
     instantiation. If `moleculer` isn't installed, the error is
     contextual: "moleculer is required for M9sCacheCacher. Install it
     as a peer dependency: pnpm add moleculer".

  **Migration (BREAKING — minor SemVer per pre-1.0 convention):**

  ```diff
  - import { M9sCacheCacher, MemoryCacheDriver, RedisCacheDriver } from '@gertsai/m9s-cache';
  - import type { RedisLike } from '@gertsai/m9s-cache';
  + import { MemoryCacheDriver } from '@gertsai/m9s-cache';
  + import { M9sCacheCacher } from '@gertsai/m9s-cache/moleculer';
  + import { RedisCacheDriver } from '@gertsai/m9s-cache/redis';
  + import type { RedisLike } from '@gertsai/m9s-cache/redis';
  ```

  `examples/m9s-example` is updated in this same PR — patch bump rolls
  through transitively.

  **Verification:**

  - `head -3 dist/index.d.ts` no longer imports from `'moleculer'` or
    `'ioredis'`
  - `head -3 dist/moleculer.d.ts` imports moleculer (correct — it's the
    bridge)
  - `head -3 dist/redis.d.ts` imports ioredis (correct)
  - No module-top `require('moleculer')` in `dist/index.js` (root
    decoupled). The lazy `require` in `dist/moleculer.js` lives only
    inside `getMoleculer()` function body.
  - Manual smoke check: simulating moleculer-missing → root import
    succeeds, subpath construction throws contextual error.
  - 106/106 tests pass; typecheck clean.

  Refs: PRD-029, RFC-020, EVID-044 CRIT-1.

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
