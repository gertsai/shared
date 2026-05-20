---
'@gertsai/session': patch
'@gertsai/runtime-context': patch
'@gertsai/rpc-proxy-builder': patch
'@gertsai/entity': patch
'@gertsai/tenant-resolver': patch
---

Wave 26 — close 5 HIGH + 3 MED EVID-080 findings across 4 packages (+ tenant-resolver test+doc).

Solo teammate (typescript-pro). +14 tests, 0 workspace typecheck errors.

**FR-1 (H1) session** — `Session.token` getter throws `SessionDestroyedError` (was bare `Error`). Test asserts `instanceof SessionDestroyedError` (was string-match).

**FR-2 (H2) runtime-context** — `provider-context._lookup` refactored to `{ present, value }` discriminator. `provide(token, undefined)` now distinguishable from "not bound" — `get(token)` returns `undefined` instead of throwing `ProviderNotFoundError`. +4 tests.

**FR-3 (H3) rpc-proxy-builder** — proxyCache nested `WeakMap<actions, WeakMap<transport, proxy>>`. Different transports sharing same actions now get distinct proxies (fixes multi-instance singleton bug per ADR-012 Wave 6.3). +2 tests.

**FR-4 (H4) entity** — `Entity.$patch` + `EntityWithMetadata.$setMetadata` swap `for...in` → `Object.keys(input)` (skip prototype chain, prototype-pollution defense).

**FR-5 (H5) entity** — `EntityJSON.data: Readonly<Data>` type widening (compile-time mutation rejection). `@ts-expect-error` test pins.

**FR-6 (M1+M2) entity deep-equal** — `Object.is` for primitives (NaN equality + +0/-0 distinction) + symmetric `Object.keys` length guard. +6 tests for edge cases.

**FR-7 (M6) tenant-resolver** — `path.strategy.ts` wildcard sentinel changed `___WILDCARD___` → `\x1FWILDCARD\x1F` (Unit-Separator control char). `split`/`join` replace instead of regex (avoids special-char interpretation). +1 test confirms literal `___WILDCARD___` segment doesn't collide.

**FR-8 (M7) tenant-resolver** — NON_PRINTABLE JSDoc note about ASCII-only limitation (no Cyrillic/CJK/emoji/non-Latin-1).

**Tests**: +14 new (4 runtime-context + 2 rpc-proxy-builder + 1 entity Entity + 6 entity deep-equal + 1 tenant-resolver path).

**Behaviour clarification**:
- FR-1: `SessionDestroyedError extends AppError extends Error` — `instanceof Error` still passes; substring matchers `'destroyed'` still pass.
- FR-2: `get`/`getOptional` signatures unchanged. Behaviour change only for previously-broken bound-to-undefined case.
- FR-3: Public surface unchanged. Cache identity for `(sameActions, sameTransport)` still holds.
- FR-4/5/6/7/8: Pure correctness improvements; no API breaks.

All bumps: patch.

EVID-080 H closure: **5/5 HIGH closed**. 3/10 MED closed. Remaining 7 MED + 8 LOW deferred (cosmetic / out-of-scope per PRD-063).

After Wave 25+26 all 41 packages deep-audited, 100% HIGH closure rate maintained.

Refs: PRD-063, EVID-080 (Wave 25 audit), ADR-006/007/009/010 + ADR-012 Wave 6.3.
