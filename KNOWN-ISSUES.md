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

## 5. Peer-dependency warnings on install

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
