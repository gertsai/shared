# @gertsai/ws-rpc

## 0.4.1

### Patch Changes

- c6dab2a: Wave 22 — Documents the ws-rpc trust model per EVID-076 CP-3 (deferred from Wave 21).

  README "Trust model" section explicitly states the 6 threat-model assumptions:

  1. Server is trusted to send well-formed messages (payload-shape validation is consumer's)
  2. Hostile server CAN DoS — mitigations as of Wave 21 (subscription patterns, message size, pending requests caps)
  3. NO per-method rate limit (use @gertsai/api-rlr at JSON-RPC handler if needed)
  4. NO backpressure signal toward server (callbacks should be O(1))
  5. Reconnect is best-effort (after maxAttempts → ConnectionError + manual connect() required)
  6. Heartbeat is liveness, not auth (token-refresh layer separate)

  Plus 3 explicit non-threats (server reading client memory, privilege escalation, storage poisoning).

  Docs-only patch bump.

  Refs: PRD-058, EVID-076 CP-3, EVID-077 (Wave 21 mitigations now documented).

## 0.4.0

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

## 0.3.0

### Minor Changes

- a26b3d6: Wave 12.B-fix-3 — close 2 HIGH findings (EVID-044) in
  `@gertsai/ws-rpc`.

  **1. `WsRpcOptions.headers?` silently discarded in browser**

  `headers` was forwarded only on the Node.js WebSocket branch; browser
  WebSocket silently discarded it. No type-level signal.

  **Fix:** `WsRpcOptions` is now a discriminated union on
  `environment`:

  ```ts
  export interface WsRpcOptionsNode extends WsRpcOptionsBase {
    environment?: "node"; // default
    headers?: Record<string, string>; // Node WebSocket only
  }

  export interface WsRpcOptionsBrowser extends WsRpcOptionsBase {
    environment: "browser"; // explicit
    // No `headers` field — would be silently discarded
  }

  export type WsRpcOptions = WsRpcOptionsNode | WsRpcOptionsBrowser;
  ```

  Browser-path attempt to pass `headers` is now a compile-time error.

  **Backward compatibility:** old `{ url, headers }` callers continue
  to work — `environment` defaults to `'node'`, which is the Node
  variant that accepts `headers`.

  **2. `connect()` post-open transient-error race**

  When `connect()` was called while state was CONNECTING, the second
  caller registered a fresh `once('error')` listener. If the WebSocket
  subsequently emitted `error` AFTER `open` (transient protocol
  error), the second caller's promise rejected even though the
  connection succeeded for the first caller.

  **Fix:** shared in-flight promise.

  - `this.connecting: Promise<void> | null` slot holds the in-flight
    connect promise.
  - Concurrent callers await the SAME promise; no duplicate listeners.
  - `onOpen` removes `onError` listener before resolving, so
    post-open errors only emit (do not reject already-resolved
    callers).
  - `finally { this.connecting = null }` lets later disconnect +
    reconnect work cleanly.

  **Tests:** +3 concurrency tests (shared promise, post-open error
  non-rejection, fresh-after-disconnect) + 3 discriminated-union tests
  (Node accepts headers, Browser rejects via `@ts-expect-error`,
  runtime drops headers in browser). 113/113 total pass.

  Refs: PRD-031, RFC-022, EVID-044.

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
