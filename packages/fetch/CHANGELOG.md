# @gertsai/fetch

## 0.4.0

### Minor Changes

- 4415a5f: Wave 12.B-fix-2 — close HIGH DoS finding (EVID-044, CWE-770).

  **Problem:** `resolveBody` only enforced `maxBodySize` on sync/async
  iterable bodies. A 500 MB Blob, ArrayBuffer, Uint8Array, string, or
  URLSearchParams passed through the early branches without size check,
  defeating the documented DoS protection.

  **Fix:** uniform `maxBodySize` enforcement at every branch of
  `resolveBody`. New typed error `BodyTooLargeError extends Error` with
  structured fields `{ size: number; limit: number }`. Existing iterable
  guard refactored to use the same `_checkBodySize` helper for semantic
  consistency.

  **New exports (additive):** `BodyTooLargeError`.

  **Default `maxBodySize`:** unchanged at 50 MB.

  **Tests:** +20 new tests covering each body branch + UTF-8 byte-length
  correctness + iterable regression coverage. 84/84 total pass.

  **Consumer impact:** consumers catching generic `Error` continue to
  work. Consumers wanting to discriminate can now `instanceof
BodyTooLargeError`.

  Refs: PRD-030, RFC-021, EVID-044.

## 0.3.0

### Minor Changes

- cb29bb0: Wave 12.B-fix-1 — close CRITICAL external-type-leak (EVID-044 CRIT-2)
  per PRD-029. Published `dist/index.d.ts` no longer imports from `undici`.

  **Problem:** the prior `dist/index.d.ts:1` did
  `import { RequestInit, Response, request } from 'undici'` because
  `RequestOptions extends Omit<RequestInit, 'headers'>`,
  `ResponseLike extends Pick<Response, ...>`, and
  `UndiciRequestOptions = Parameters<typeof request>[1]` all derived their
  shape from undici. Every downstream `tsc` had to resolve undici's full
  type surface — bundle bloat, version-pin drift risk, exact Wave-13
  pattern that broke `examples/m9s-example` after Wave 13.

  **Fix:** replicated the minimum surface of `undici.RequestInit` +
  `Response` + `request` parameters as local structural interfaces in
  `packages/fetch/src/lib/types.ts` and `packages/fetch/src/fetchers/
undiciFetcher.ts`. Runtime `import { Headers, FormData, request } from
'undici'` retained (value imports — bundled, not in `.d.ts`). The
  single internal cast `options as unknown as Parameters<typeof request>[1]`
  at the `request()` call site bridges the local shape to undici's
  internal type without leaking a named type import.

  **Consumer impact:** public type names preserved (`RequestOptions`,
  `UndiciRequestOptions`, `ResponseLike`, `FetchSecurityConfig`,
  `HttpMethod`, `FetcherFunction`, `HttpErrorResponse`). Value-level
  callers using these types continue to compile without changes. Two new
  additive exports — `RequestBody` and `UndiciResolvedBody`.

  **Verification:**

  - `head -3 dist/index.d.ts` no longer contains `from 'undici'`
  - 64/64 tests pass
  - typecheck clean

  Refs: PRD-029, RFC-020, EVID-044 CRIT-2.

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
