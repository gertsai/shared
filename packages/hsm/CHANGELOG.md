# @gertsai/hsm

## 5.0.0

### Patch Changes

- Updated dependencies [9de7cf7]
  - @gertsai/core@0.6.0

## 4.1.0

### Minor Changes

- 8aa7198: Wave 21 — close 9 HIGH + 2 MED + 2 CP findings from EVID-076 across 5 platform packages.

  **Tests: +44** (17 from Teammate W + 27 from Teammate X). All 5 affected packages pass; workspace typecheck 0 errors across 45 projects.

  **Teammate W — ws-rpc + hsm + query-dsl/sql.ts (+154/+101/+23/+18 src LOC)**:

  - **H-WS-1** (`ws-rpc/client.ts:541`) — reconnect chain no longer dies on pre-onopen `createWebSocket()` rejection (DNS/ECONNREFUSED). Synth `handleClose(1006)` in connect catch + tracked `pendingSyntheticCloseTimer`.
  - **H-WS-2** (`ws-rpc/subscription.ts:143`) — wildcardMatch ReDoS bounded via `MAX_DOUBLE_STAR_SEGMENTS=3` + `MAX_TOPIC_SEGMENTS=64` + `MAX_WILDCARD_RECURSION_DEPTH=100`. Adversarial patterns rejected at subscribe time via new `InvalidSubscriptionPatternError`.
  - **H-WS-3** — Node protocol-ping via `ws.ping()` + pong watchdog; browser falls back to app-level heartbeat.
  - **H-HSM-1** (`hsm/convergent-encryption.ts`) — ALWAYS recompute SHA-256 on decrypt + throw `HSMError(INVALID_CONTEXT)` on mismatch.
  - **M-WS-1** (`ws-rpc reconnect`) — off-by-one fix: `getDelay()` BEFORE `recordAttempt()`.
  - **M-QDS-1** (`query-dsl/sql.ts`) — `quoteIdent` emits `"<name>"` with `""` escape (Postgres-safe).

  **Teammate X — entity-storage + storage-core + query-dsl/validate + entity-audit (+176/+64/+217 LOC across files)**:

  - **H-ENT-1+H-ENT-2** (`entity-storage/InMemoryStorageProvider.ts`) — `runTransaction` rewritten with per-key version snapshot + per-key merge commit + read-set+write-set verification. Concurrent commits touching disjoint keys no longer clobber. Writes-without-reads use implicit pre-snapshot version → no longer bypass conflict detection. Chose Option 3 (fail-on-conflict, matches PG MVCC + ADR-005 `TransactionConflictError`).
  - **H-ENT-3** (`entity-storage/applyQueryFilter.ts`) — `offset` now applied (was silently ignored).
  - **H-ENT-4** (`entity-storage/applyQueryFilter.ts`) — `limitToLast` now applied (was silently ignored).
  - **CP-2** (`@gertsai/query-dsl/src/capabilities.ts` NEW) — `QueryCapabilities` type + 4 preset constants; `validateQuery(query, capabilities)` rejects constraints unsupported by target backend. Same query now provably returns same rows on InMemory vs Pg (or fails validation at the boundary).
  - **CP-1** (`@gertsai/entity-audit/src/index.ts`) — `AUDIT_FIELDS` + `CREATOR_AUDIT_FIELDS` shared constants exported. InMemoryStorageProvider + PgStorageProvider import; hardcoded strings eliminated from runtime code (2 remaining hits are JSDoc comments).
  - `@gertsai/pg-client` gains peer-optional dep on `@gertsai/entity-audit` for `/storage` subpath (mirrors existing query-dsl peer-optional pattern).

  **Tests** (+44 total):

  - ws-rpc 113 → 124 (+11)
  - hsm 32 → 35 (+3)
  - query-dsl 56 → 64 (+8 capability gating)
  - entity-storage 103 → 117 (+14 — 8 offset/limitToLast + 6 concurrent commit)
  - entity-audit 30 → 35 (+5 AUDIT_FIELDS)

  **Behaviour breaks (pre-1.0 minor bumps allowed):**

  - ws-rpc subscribe throws `InvalidSubscriptionPatternError` on adversarial patterns (was silently accepted)
  - hsm `decrypt` throws on hash-mismatch (was silently trusted)
  - query-dsl `validateQuery` now requires capabilities arg (or backwards-compat path TBD)
  - query-dsl `quoteIdent` emits quoted output (was raw)
  - entity-storage InMemoryStorageProvider commits now throw `TransactionConflictError` on race (was silent clobber)
  - entity-storage `applyQueryFilter` now honors `offset` + `limitToLast` (was silently ignored)

  Per-adapter bumps:

  - @gertsai/ws-rpc: minor (4 new error classes, behaviour break)
  - @gertsai/hsm: minor (decrypt now throws on mismatch)
  - @gertsai/query-dsl: minor (quoteIdent + capabilities)
  - @gertsai/entity-storage: minor (transaction + applyQueryFilter behaviour changes)
  - @gertsai/entity-audit: minor (new exports)
  - @gertsai/pg-client: patch (only uses AUDIT_FIELDS internally)

  Refs: PRD-059, EVID-076 (Wave 20 audit), ADR-005 (storage-core architecture).

## 4.0.0

### Patch Changes

- Updated dependencies [0f71f1d]
- Updated dependencies [7109c49]
  - @gertsai/core@0.5.0

## 3.0.1

### Patch Changes

- Updated dependencies [739b3de]
  - @gertsai/core@0.4.1

## 3.0.0

### Patch Changes

- Updated dependencies [f0f6f26]
- Updated dependencies [7bc148b]
  - @gertsai/core@0.4.0

## 2.0.0

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

## 1.0.0

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
