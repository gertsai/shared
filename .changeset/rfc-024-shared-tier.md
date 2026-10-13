---
"@gertsai/entity-queries": minor
"@gertsai/entity-storage": minor
"@gertsai/rpc-proxy-builder": minor
"@gertsai/entity": patch
"@gertsai/entity-react": patch
"@gertsai/fetch": patch
---

RFC-024 shared tier (Fluxis merge groundwork, Orchestra parity):

- `entity-queries` (new): validated read-path over `IStorageProvider` — guard → sanitizeConstraints (allowedOps/allowedFields/maxLimit) → pinnedFields → lifecycle filter → stripFields; `loadOne`/`loadPage`/`loadUids`/`loadCount` + `getLive`/`listLive`.
- `entity-storage`: write-rules engine — `TableWriteRules` (verb + `update_action.type` → predicate), fail-closed `assertWriteAllowed`, protected audit/lifecycle fields, `computeAffectedKeys`, `allowFields`; `BaseEntityStorageService.opts.rules` evaluates before stamping/routing, `resource` = committed row.
- `rpc-proxy-builder`: `createTypedApi` — structural `ActionContract` union → nested typed call surface via recursive Proxy; `invokeTransport`/`restTransport` adapters, `RestError`.
- `entity`: `node:crypto` → `globalThis.crypto.randomUUID()` (browser bundlers).
- `entity-react`: bundler-safe React resolution — public `setUseSyncExternalStore()` + `process.getBuiltinModule` Node path (was static `node:module` import breaking Vite).
- `fetch`: undici FormData facade casts — undici@7 `buffer.File` vs undici-types@6 `File[Symbol.toStringTag]` divergence unblocked repo typecheck.
