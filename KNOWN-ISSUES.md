# Known Issues — v0.1.0

This file tracks issues we are aware of in the initial release. None block
build, install, or runtime use of the documented public API. They are
documented here for transparency and to be addressed in v0.1.x patch releases.

## 1. `@gertsai/core` — `identity-resolver` not exported

**Status:** intentional, pending v0.1.x

The file `packages/core/src/connectors/identity-resolver.ts` is referenced by
`connectors/index.ts` but was never tracked by git in the upstream
`gertsai_codex` monorepo (a global `connectors/` pattern in `.gitignore`
excluded it). The export is currently commented out:

```ts
// packages/core/src/connectors/index.ts
// export * from './identity-resolver';
```

`acl` and `enums` exports from the same module are unaffected.

## 2. Skipped tests in `@gertsai/core`

Three tests in `tenant-config-chunking.test.ts` reference RFC-105 fields
(`chunkStrategy`, `chunkSizeUnit`, `enableContextualRag`, `chunksToProcess`)
that were renamed in source (`chunkingStrategy`, `chunkSize`). The describe
block is currently `describe.skip(...)`. Pre-existing in upstream; not an
extraction artifact.

DB integration tests in `core/src/deny-ledger/__tests__/` (postgres, redis,
hybrid) are skipped by default — they require a running database and are
intended to run only in CI environments with Docker fixtures.

## 3. Pre-existing TypeScript diagnostics in test files

`packages/api-core/src/__test__/response-wrapper.test.ts` has variance-related
type warnings (`OrchestraApiResponse<ResponseCode.SUCCESS>` not assignable to
`OrchestraApiResponse<ResponseCode>`). These do not affect test execution
(vitest uses vite/swc transpilation, not strict tsc), and the production code
(`src/lib/`) builds cleanly. The test suite itself passes 370/370.

The test in `tenant-config-chunking.test.ts` has type errors against the
renamed fields (see above). Block is skipped, so it does not run; warnings
are visible to TS-aware editors but do not affect CI.

## 4. References to non-extracted `@gertsai/*` packages

Some source files dynamically `import('@gertsai/database')` inside skipped
DB-integration tests, or include CLI suggestions referencing packages not yet
extracted. All such references are guarded:

- Dynamic imports are inside `describe.skip(...)` blocks with
  `@ts-expect-error` directives.
- No static imports remain (verified by audit).

These will resolve when their target packages are published in a subsequent
extraction wave.

## 5. `@gertsai/api-rlr` — PostgreSQL integration tests force-skipped

**Status:** intentional, deferred (per ADR-011)

`PostgreSQLAdapter.test.ts` contains an integration `describe.skip(...)` block
that originally relied on the upstream Hub's `@gerts/database` helpers
(`getDatabase()` / `initializeDatabase()` / `disconnectDatabase()`) — Prisma
client wired against the Hub's specific schema. That helper package is **not**
part of the OSS first-wave extraction (per ADR-009), and `@gertsai/api-rlr` is
explicitly database-agnostic (per ADR-011 invariants I-1, I-2): it depends only
on the local `PgClient` interface (3 methods), not on any specific ORM or
schema package.

Behaviour validation для PostgreSQL path is preserved via:

- **Algorithmic unit tests** (`PostgreSQLAdapter.test.ts (unit)`, ~25 tests с
  mock `PgClient` instances) — these run by default and pass green.
- **Redis integration tests** (`HAS_REDIS=1 pnpm test:redis`) — same algorithms
  on the Redis adapter path provide cross-adapter algorithmic coverage.

To re-enable PostgreSQL integration locally, instantiate any
`PgClient`-compatible client (Prisma, Drizzle, raw `pg`, or wrapper) и pass
it via `new PostgreSQLAdapter({ prisma })`. Schema setup is not bundled
with the OSS package — consumers manage their own migrations.

## 6. `@gertsai/api-rlr` — Redis-required tests skipped by default

**Status:** intentional

Eight test files require a running Redis instance and are `describe.skipIf(!HAS_REDIS)`:

- `__tests__/lua-sliding.test.ts`, `__tests__/lua-sliding.edge.test.ts`,
  `__tests__/lua-sliding.behaviour.test.ts`
- `__tests__/lua-gcra.test.ts`, `__tests__/lua-gcra.edge.test.ts`,
  `__tests__/lua-gcra.behaviour.test.ts`
- `__tests__/middleware.integration.test.ts`,
  `__tests__/comprehensive-integration.test.ts` (16 tests)

Run locally with `HAS_REDIS=1 pnpm --filter @gertsai/api-rlr test:redis`. CI
will get a separate Redis-enabled job in v0.1.x once docker-compose fixtures
are wired (планируется отдельный workflow).

Without Redis: 289 tests pass, 48 skipped (35 test files: 27 passed, 8 skipped).

## 7. Peer-dependency warnings on install

```
packages/core
└─┬ @ryoppippi/unplugin-typia 2.6.5
  └── ✕ unmet peer typescript@">=4.8.0 <5.9.0": found 5.9.3

packages/m9s-cache
└─┬ moleculer 0.14.35
  └── ✕ unmet peer redlock@^4.0.0: found 5.0.0-beta.2
```

Both are warnings only. Build and tests pass.

**TypeScript pin (Sprint 3.0.1, F-7):** TypeScript is intentionally pinned to
the exact version `5.9.3` workspace-wide via the root `package.json` (single
source of truth — individual `packages/*/package.json` no longer declare a
`typescript` devDependency). The `@ryoppippi/unplugin-typia 2.6.5` peer range
(`>=4.8.0 <5.9.0`) is therefore knowingly violated. Tracked: Sprint 3.x will
either bump `@ryoppippi/unplugin-typia` to a release that widens the peer
constraint, or pin workspace TS to a 5.8.x line if upstream typia is slow to
update. The full test suite passes green on 5.9.3, so the warning is
informational only.

The `redlock` warning is unchanged: `moleculer 0.14.35` declares
`redlock@^4.0.0` as a peer, but `redlock@5.0.0-beta.2` is the only ESM-native
release and is what `@gertsai/m9s-cache` is wired against. Will be addressed
in v0.1.x once moleculer ships a compatible peer range.

## 8. Subpath imports require `moduleResolution: "node16"` or higher

`@gertsai/core` (`/rag`, `/llm`) and `@gertsai/api-core` (`/contracts`,
`/moleculer`, `/runtime/node`) are exposed via `package.json#exports` subpath
keys. To resolve their types, downstream TypeScript consumers must use
`moduleResolution: "node16"`, `"nodenext"`, or `"bundler"`.

For consumers stuck on `moduleResolution: "node"` (TS pre-4.7 or Node10
profile), Sprint 3.0.1 added `typesVersions` fallback maps to both packages
(see `packages/{core,api-core}/package.json`). The fallback maps each subpath
to its `dist/<subpath>/index.d.ts` file, providing best-effort Node10
resolution. Cases not covered by the fallback (e.g. unusual TS resolver
configurations) should upgrade to `node16`+; documented in
`audit-pre-sprint-3-2` (production-validator F-P-1, type-auditor F-T-4).

## 9. `@gertsai/api-core` — `oauth.class.ts` placeholder console.log calls

`packages/api-core/src/lib/oauth/oauth.class.ts:151..174` contains five
`console.log(...)` lines (`'Getting user'`, `'Revoking token'`, etc.) that
are placeholder bodies of `OAuth2Server`-style provider methods. These are
extraction artifacts — they were stub bodies in the upstream code and were
not replaced during the Wave 2 extraction.

Real consumers wiring an OAuth provider will see noisy logs in production.
Workaround: pass a custom provider implementation via `setAuthProvider(...)`
that overrides these stubs. Permanent fix planned for the @gertsai/auth-*
extraction (Sprint 3.x or Wave 3).

## 10. `BaseEntityStorageService.upsert` performs 2 RTTs vs 1

**Status:** acceptable; tracked for Wave 6+

`upsert(...)` consolidated from m9s-example DocumentRepository (Sprint 3.6
W-3-6-24) issues `provider.get(...)` followed by either `provider.set(...)`
or `provider.update(...)` — two round-trips. For the in-memory provider
this is negligible. For a future Postgres adapter (or any networked
backend) the latency cost is non-trivial; a single-RTT `upsert` (e.g.
`INSERT ... ON CONFLICT DO UPDATE`) requires a new method on
`IStorageProvider` and per-adapter implementation. Tracked for Wave 6+;
not a blocker because `set` / `update` paths remain available when the
caller already knows existence.

## 11. Sprint 3.6 P2 polish backlog (non-blocking)

**Status:** deferred to Sprint 3.6.1 / 3.7 maintenance pass

Post-Build fidelity audit (Phase C, 3 reviewers) raised 9 P2 polish items
across the 3 new/extended packages. None are blockers; bundled here so the
cleanup is discoverable when working in those modules:

**`@gertsai/errors`** (errors-fidelity):
- `wrapUnknownError(x, kind?, correlationId?)` declares `kind?` parameter
  but ignores it (`_kind?` placeholder). Either remove from signature or
  honour the override.
- `AppError` constructor `Object.freeze({ ...details })` is shallow-only;
  nested objects are not frozen. Either deep-freeze or document explicitly
  in JSDoc.
- `redactDetails()` is shallow-scan — nested objects with `password`/etc.
  inside are not redacted. Add adversarial test fixture documenting the
  contract; consider deep-scan if needed.
- `errors/internal.ts` uses `<Record<string, unknown>>` catch-all where
  spec example showed `{ trace?: string }`. Tighten generic if useful.
- README cross-references use relative paths to `.forgeplan/...` which will
  break post-npm-publish. Switch to absolute repo URL or mark "repo-only".

**`@gertsai/tenant-resolver`** (tenant-resolver-fidelity):
- `MOLECULER_INSTALL_HINT` error string in `moleculer/index.ts` is
  misleading — fires on "non-Moleculer Context shape", not on missing peer
  install. Rename or split.
- PathStrategy `...` wildcard semantics: only valid as trailing token, but
  README does not flag the placement constraint; add JSDoc note.
- `lookupHeader()` exact-case-first short-circuit precedence undocumented;
  harden with JSDoc to prevent future regression.

**`@gertsai/session`** (session-scoping-fidelity):
- `__tests__/scoping.test.ts:13-17` carries a 5-line stub comment that
  references the deleted Phase B fallback. Compress to one line.
- `Session.ts:19-22` post-swap history comment is verbose; can be reduced.
