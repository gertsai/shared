# @gertsai/utils

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
