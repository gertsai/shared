# @gertsai/ws-rpc

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
