---
'@gertsai/fetch': minor
---

Wave 12.B-fix-1 — close CRITICAL external-type-leak (EVID-044 CRIT-2)
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
