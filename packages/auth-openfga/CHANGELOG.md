# @gertsai/auth-openfga

## 0.3.2

### Patch Changes

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

- Updated dependencies [8de6205]
- Updated dependencies [739b3de]
  - @gertsai/utils@0.5.0
  - @gertsai/core@0.4.1

## 0.3.1

### Patch Changes

- Updated dependencies [f0f6f26]
- Updated dependencies [7bc148b]
  - @gertsai/core@0.4.0

## 0.3.0

### Minor Changes

- 05258e5: Wave 12.D-fix Teammate C — close 5 HIGH findings + engines.node declaration on 4 packages per PRD-036.

  **@gertsai/errors — FR-007 + root re-export**

  `REDACTION_KEYS` expanded by 19 new entries (11 PRD-named + 8 snake_case variants): `apitoken`, `accesstoken`, `refreshtoken`, `csrftoken`, `bearertoken`, `idtoken`, `sessionid`, `clientsecret`, `x-api-key`, `bearer`, `jwt`, plus `api_token` / `access_token` / `refresh_token` / `csrf_token` / `bearer_token` / `id_token` / `session_id` / `client_secret`. All consumers of `redactDetails` inherit the wider redaction automatically.

  `redactDetails` + `REDACTION_KEYS` re-exported from package root (was only on `/http` subpath). Backward-compatible — additive.

  **@gertsai/logger-factory — FR-006**

  `applyRedaction` was shallow-only — `{ user: { password: 'p' } }` leaked nested secrets. Replaced with delegation to `redactDetails` from `@gertsai/errors` root export (depth-5 + cycle-safe + breadth-1000 per Sprint 3.10 W-3-10-3).

  **@gertsai/hsm — FR-009 (HIGH security CWE-319)**

  `VaultProvider` constructor now validates `VaultConfig.address`. Rejects non-`https://` URLs (throws `HSMError` with `CONFIG_ERROR`) unless host is loopback (`localhost`/`127.0.0.1`/`::1`). Loopback http: allowed for dev with `console.warn`. Prevents cleartext `X-Vault-Token` transmission.

  **@gertsai/auth-openfga — FR-022 (HIGH logic)**

  `initialize()` race fix. Previously coalesced concurrent calls via `this.initPromise` but never cleared on failure → all subsequent callers saw rejected promise forever even when retry would succeed. Now: `try { await this.initPromise; ...} catch (err) { this.initPromise = null; throw err; }`.

  **FR-011 — engines.node declared on all 4 packages** (`>=22`) per post-12.C-fix-1 entity precedent. Documents Node-only nature for `node:crypto`, `events`, etc imports.

  **Tests:** +18 new tests across 4 packages (7 redaction-expanded + 2 nested-redaction + 7 vault-address + 2 init-retry). 281+18=299 pass.

  Refs: PRD-036, EVID-051 (S-1, S-2, S-4, L-6).

### Patch Changes

- Updated dependencies [05258e5]
  - @gertsai/core@0.3.0

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

### Patch Changes

- Updated dependencies [0755c6d]
- Updated dependencies [1d1e833]
- Updated dependencies [155d0c0]
- Updated dependencies [e830ae6]
  - @gertsai/core@0.2.0
