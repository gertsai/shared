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

Both are warnings only. Build and tests pass. Will be addressed in v0.1.x by
either downgrading TypeScript to 5.8 or upgrading the peer-declaring
dependencies once compatible versions ship.
