---
depth: standard
id: RFC-020
kind: rfc
last_modified_at: 2026-05-16T17:05:21.896609+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-029
  relation: informs
status: active
title: Wave 12.B-fix-1 strategy — parallel 2-teammate fix with subpath split + lazy createRequire
---

# RFC-020 — Wave 12.B-fix-1 execution strategy

## Summary

Two parallel teammates fix the 2 CRITICAL leaks surfaced by EVID-044. Teammate A patches `@gertsai/fetch` by replacing `Parameters<typeof request>` derivations with a structural `UndiciRequestOptions` interface. Teammate B splits `@gertsai/m9s-cache` into `./moleculer` + `./redis` subpaths, moves moleculer-typed and ioredis-typed exports out of the root barrel, and converts `moleculer-cacher.ts`'s top-level `require('moleculer')` to lazy `createRequire(import.meta.url)`. Disjoint file ownership (different packages); no shared files; pure parallel work. Pre-seed by orchestrator: identify downstream import sites (m9s-example) for Phase 4 patch. Both packages get minor SemVer bumps (0.2.0 → 0.3.0) via changesets. Total wallclock target under 1 hour from teammate spawn to PR open.

## Context

PRD-029 requires fixing 2 CRITICAL external-type-leaks (fetch undici, m9s-cache moleculer + ioredis) via subpath split and local-type replication. This RFC pins HOW: which teammate works on what files, what the import patterns look like, how the subpath structure is wired, and what guarantees the orchestrator pre-seeds.

The work is highly parallel — both packages are independent — so wave execution uses 2 teammates with disjoint file ownership. No shared files exist; no integration points between teammates' work. This is a clean Wave-1 sprint per the `fpl-skills:sprint` pattern.

## Motivation

Wave 13 burned us with exactly this pattern — `defineAction<T>` preserved inferred shape from typia, leaking `StandardSchemaV1` into emitted .d.ts. The audit (Wave 12.B / EVID-044) confirmed the pattern repeats. Without this fix:

- `@gertsai/fetch@0.2.0` already published. Every consumer's `tsc` resolves undici types; bundle bloat for non-undici consumers; version-pin drift breaks TS compilation.
- `@gertsai/m9s-cache@0.2.0` already published. `import { CacheStore } from '@gertsai/m9s-cache'` **crashes at module-load** when moleculer isn't installed, despite moleculer being marked optional peer. This is a packaging bug visible to any consumer who only wants memory/redis caching.

Both leaks are visible TODAY in `dist/index.d.ts` of the published artefacts. Earliest cost is to consumers' CI build time; worst case is a hard crash. Wave 12.B-fix-1 closes both before consumers update beyond v0.2.0.

## Proposed Direction

### D-1 — Teammate roster

2 parallel teammates per `fpl-skills:sprint` Wave-1 pattern:

| Teammate | Subagent type | Scope | LOC budget |
|---|---|---|---|
| **A** | `agents-core:coder` | `packages/fetch/**` only | ≤150 LOC delta |
| **B** | `agents-core:coder` | `packages/m9s-cache/**` only | ≤350 LOC delta |

Disjoint package directories. No file-marker comments needed; no shared files.

### D-2 — `@gertsai/fetch` fix (Teammate A)

**Files in scope:**
- `packages/fetch/src/fetchers/undiciFetcher.ts` — keep undici import, but stop exporting type that derives from it
- `packages/fetch/src/lib/types.ts` — define local `UndiciRequestOptions` structural interface; redefine `RequestOptions` without `extends Omit<RequestInit, ...>`
- `packages/fetch/src/index.ts` — verify re-exports

**Type design:**

```ts
// packages/fetch/src/lib/types.ts (after fix)

import type { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

/**
 * Minimum structural shape consumed from `undici.RequestInit`.
 * Replicated locally to avoid leaking the entire undici type surface
 * into emitted `.d.ts` (Wave-13-pattern fix per EVID-044 CRIT-2).
 */
export interface UndiciRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string | string[]>;
  body?: string | Uint8Array | Readable | ReadableStream | null;
  signal?: AbortSignal;
  // (add fields actually consumed by the codebase — verify by reading
  //  `undiciFetcher.ts` and only including what flows through)
}

export interface RequestOptions {
  method?: HttpMethod;
  // ... explicit fields without `extends Omit<RequestInit, 'headers'>`
}
```

**Decision rule:** include in `UndiciRequestOptions` ONLY fields that `undiciFetcher.ts` (or any other consumer in `packages/fetch/src/**`) actually reads. Audit by `grep -rn "options\." packages/fetch/src/`.

**Verification:**
```
head -3 packages/fetch/dist/index.d.ts
# MUST NOT start with `import ... from 'undici'`
```

**Tests:** existing `*.test.ts` files in `packages/fetch/` cover behaviour; type-only changes shouldn't break them. Add ONE new test verifying public type accepts the documented shape (compile-time assertion via `satisfies`).

### D-3 — `@gertsai/m9s-cache` fix (Teammate B)

**Subpath structure to introduce:**

```
packages/m9s-cache/
├── src/
│   ├── index.ts          ← backend-agnostic only (CacheStore, MemoryCacheDriver, serializers, validators, types-no-external)
│   ├── moleculer.ts      ← NEW barrel for /moleculer subpath
│   ├── redis.ts          ← NEW barrel for /redis subpath
│   ├── moleculer-cacher.ts        ← keep, refactor to lazy createRequire
│   ├── moleculer-db-mixin.ts      ← keep, refactor to lazy createRequire
│   ├── redis-driver.ts            ← keep
│   ├── lock-provider.ts           ← redlock loaded via createRequire (already correct)
│   └── ... (memory-driver, cache-store, serializers, tag-utils, types unchanged)
├── package.json   ← exports: "." + "./moleculer" + "./redis" + "./package.json"; typesVersions block
└── tsup.config.ts ← entry: { index, moleculer, redis }
```

**`packages/m9s-cache/src/moleculer.ts`** (new barrel — type-only re-exports for the bridge):

```ts
// SPDX-License-Identifier: Apache-2.0
// Moleculer integration subpath. Lazy-loads moleculer at construction time.
// Root barrel (./) does NOT import this — keeps moleculer optional-peer.

export { M9sCacheCacher } from './moleculer-cacher.js';
export type { M9sCacheCacherOptions } from './moleculer-cacher.js';
export { moleculerDbCacheMixin } from './moleculer-db-mixin.js';
export type {
  MoleculerDbModel,
  CacheableEntity,
  CacheEnabledService,
  CacheEnabledBroker,
  EntityEventType,
  EntityChangedHandler,
} from './moleculer-db-mixin.js';
export type {
  MoleculerContext,
  MoleculerCachedAction,
  MoleculerCacheOptions,
} from './types.js';
```

**`packages/m9s-cache/src/redis.ts`** (new barrel):

```ts
// SPDX-License-Identifier: Apache-2.0
// Redis integration subpath. ioredis types are referenced here only.

export { RedisCacheDriver } from './redis-driver.js';
export type { RedisCacheDriverOptions, RedisLike } from './redis-driver.js';
export { RedlockLockProvider } from './lock-provider.js';
export type { RedlockProviderOptions } from './lock-provider.js';
```

**`packages/m9s-cache/src/index.ts`** (root, after fix — agnostic only):

```ts
// SPDX-License-Identifier: Apache-2.0

// Core (no external types)
export { CacheStore } from './cache-store.js';

// Serializers
export {
  JsonSerializer, TypedSerializer, BinarySerializer, PassthroughSerializer,
} from './serializers.js';

// Memory driver
export { MemoryCacheDriver } from './memory-driver.js';
export type { MemoryCacheDriverOptions } from './memory-driver.js';

// Lock provider (Noop only at root; Redlock at /redis)
export { NoopLockProvider } from './lock-provider.js';

// Tag utilities
export { generateTags } from './tag-utils.js';

// Types — agnostic only (drop all moleculer/redis type re-exports)
export type {
  CachePayload, Serializable, CacheDriver, CacheSerializer,
  GenericCacheSerializer, CacheStoreOptions, CacheSetOptions,
  CacheWrapOptions, CacheGetResult, CacheWrapResult,
  CacheKey, CacheKeyValidationOptions,
  CacheLockProvider, UnlockFunction,
  PathSegment, CacheTagConfig, CacheTag, TagVersionMap,
  CacheEnvelope,
  CacheValueType, RequiredProps, DeepPartial,
  EntityId, Identifiable, Timestamped,
  TTLValidationOptions,
} from './types.js';
export {
  validateCacheKey, isCacheKey, createCacheKey,
  CacheKeyError, DEFAULT_KEY_PATTERN,
  isCacheEnvelope,
  CacheError, CacheErrorCode, createCacheError,
  MAX_TTL_SECONDS, MIN_TTL_SECONDS, validateTTL,
} from './types.js';
```

**Lazy `createRequire` pattern** (apply to `moleculer-cacher.ts` line 6 area):

```ts
// BEFORE (module-top require):
const Moleculer = require('moleculer');
const { BaseCacher } = Moleculer.Cachers;

// AFTER (lazy in-constructor):
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

class M9sCacheCacher {
  constructor(opts: M9sCacheCacherOptions) {
    // Resolved on instantiation, not module load.
    // If moleculer isn't installed, error message is contextual.
    const Moleculer = require('moleculer');
    // ... existing init logic
  }
}
```

**`package.json` updates:**

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./moleculer": {
      "import": { "types": "./dist/moleculer.d.ts", "default": "./dist/moleculer.js" },
      "require": { "types": "./dist/moleculer.d.cts", "default": "./dist/moleculer.cjs" }
    },
    "./redis": {
      "import": { "types": "./dist/redis.d.ts", "default": "./dist/redis.js" },
      "require": { "types": "./dist/redis.d.cts", "default": "./dist/redis.cjs" }
    },
    "./package.json": "./package.json"
  },
  "typesVersions": {
    "*": {
      "moleculer": ["./dist/moleculer.d.ts"],
      "redis": ["./dist/redis.d.ts"]
    }
  }
}
```

**`tsup.config.ts`:**

```ts
export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'moleculer': 'src/moleculer.ts',
    'redis': 'src/redis.ts',
  },
  tsconfig: './tsconfig.build.json',
});
```

**Verification:**
```bash
pnpm --filter @gertsai/m9s-cache build
head -3 packages/m9s-cache/dist/index.d.ts
# MUST NOT import from 'moleculer' or 'ioredis'

head -3 packages/m9s-cache/dist/moleculer.d.ts
# expected: import from 'moleculer'

head -3 packages/m9s-cache/dist/redis.d.ts
# expected: import from 'ioredis'
```

### D-4 — Tests and downstream consumer impact

**`m9s-example` impact check:** currently imports from root. After fix, must update to `import { M9sCacheCacher } from '@gertsai/m9s-cache/moleculer'`. Pre-seed: orchestrator searches imports before teammates start; if found, adds to teammate B's task list.

**`api-core` impact check:** `packages/api-core/**` should NOT import from `@gertsai/m9s-cache` (verify). If it does, that's a tier-discipline finding to address.

**New tests:**
- Teammate A: type-level assertion in `packages/fetch/__tests__/types.test-d.ts` (or inline `// @ts-expect-error` test) that `RequestOptions` and `UndiciRequestOptions` accept canonical shapes.
- Teammate B: smoke test `packages/m9s-cache/__tests__/subpaths.test.ts` that imports from `./moleculer` and `./redis` resolve (Node test).

### D-5 — Orchestrator pre-seed work

Before spawning teammates, orchestrator does:
1. Search downstream imports: `grep -rn "from '@gertsai/m9s-cache'" examples/ packages/` to identify migration sites.
2. Confirm both packages' current test surface — note any test that may break.
3. Set teammate file-ownership boundaries in the spawn prompt.

This RFC's "Files in scope" sections (D-2, D-3) feed verbatim into teammate prompts.

### D-6 — Changesets

After both teammates complete:
- `.changeset/wave-12-b-fix-1-fetch-undici-leak.md` — `@gertsai/fetch: minor` (0.2.0 → 0.3.0)
- `.changeset/wave-12-b-fix-1-m9s-cache-subpath-split.md` — `@gertsai/m9s-cache: minor` (0.2.0 → 0.3.0)

Bodies cite EVID-044 CRIT-1/CRIT-2, link PRD-029, document migration:

```
**Migration for `@gertsai/m9s-cache` consumers:**

Before:
  import { M9sCacheCacher, RedisCacheDriver } from '@gertsai/m9s-cache';

After:
  import { M9sCacheCacher } from '@gertsai/m9s-cache/moleculer';
  import { RedisCacheDriver } from '@gertsai/m9s-cache/redis';
  // CacheStore, MemoryCacheDriver, serializers remain at root.
```

### D-7 — Branch and PR

```bash
git checkout -b fix/wave-12-b-fix-1-external-type-leaks
# (teammate work)
git commit -m "fix(*): Wave 12.B-fix-1 — close 2 CRITICAL leaks"
git push -u origin fix/wave-12-b-fix-1-external-type-leaks
gh pr create --base main --title "..." --body "Refs: PRD-029, EVID-044"
```

## Implementation Phases

| Phase | Duration | Owner | Output |
|---|---|---|---|
| Phase 1 — Pre-seed | 5 min | Orchestrator | Read both packages' current sources, confirm no shared files, identify m9s-example/api-core import sites |
| Phase 2 — Parallel teammates | 15–25 min wallclock | 2 × `coder` agents | A: fetch local-types patch; B: m9s-cache subpath split + lazy require |
| Phase 3 — Local smoke | 5 min | Orchestrator | `pnpm build`; `pnpm --filter @gertsai/{fetch,m9s-cache} test`; manual `head dist/*.d.ts` check |
| Phase 4 — Downstream fix | 5 min | Orchestrator | Patch m9s-example imports if affected |
| Phase 5 — Evidence + changesets | 10 min | Orchestrator | EVID-045 with structured fields; 2 changeset files |
| Phase 6 — Activate + commit + PR | 10 min | Orchestrator | Activate PRD-029 + RFC-020 + EVID-045; branch + commit + PR |

Wallclock target: under 1 hour from teammate spawn to PR open.

## Invariants

- **I-1** — Root `dist/index.d.ts` of both packages MUST NOT begin with `import ... from 'undici' | 'moleculer' | 'ioredis'`. Verified by orchestrator post-build.
- **I-2** — Lazy `createRequire(import.meta.url)` for moleculer in `moleculer-cacher.ts` — top-level `require('moleculer')` is forbidden. Same for ioredis if module-top require exists.
- **I-3** — Subpath barrels are pure re-export modules — no business logic. Logic stays in `moleculer-cacher.ts`, `moleculer-db-mixin.ts`, `redis-driver.ts` unchanged (just the import paths shift).
- **I-4** — Backward-compat for `@gertsai/fetch` value-level types — `RequestOptions` and `UndiciRequestOptions` accept the same shapes consumers use today.
- **I-5** — File ownership disjoint — teammate A touches ONLY `packages/fetch/**`; teammate B touches ONLY `packages/m9s-cache/**`. Cross-package edits are orchestrator's job (post-merge or in Phase 4).
- **I-6** — Test budget — `pnpm --filter @gertsai/fetch test` and `pnpm --filter @gertsai/m9s-cache test` MUST pass after their respective teammate completes. Pre-existing tests stay green; new tests cover the subpath imports.
- **I-7** — No `.forgeplan/*.md` mutated via shell `Edit`/`Write` — only via MCP `forgeplan_update`.

## Rollback Plan

If teammate B's subpath split causes downstream breakage we didn't anticipate:

1. Close PR without merge.
2. Revert local changes via `git checkout main && git branch -D fix/wave-12-b-fix-1-external-type-leaks`.
3. Re-spawn teammate B with refined prompt focusing on minimum-viable fix: only switch top-level `require('moleculer')` to lazy `createRequire`, defer subpath split to a follow-up Wave 12.B-fix-1b.
4. Re-run.

If teammate A's local-types refactor causes downstream `@gertsai/fetch` consumer breakage:
1. Inspect failing site, narrow the local interface to match consumer expectation.
2. Re-run teammate A focused on the specific compat issue.

Worst-case: deprecate this PRD without activating, mark as superseded by a smaller-scope follow-up PRD-029b.

## Alternatives Considered

### Alt-1 — Move external deps from `dependencies` to `peerDependencies`

Force consumers to install undici/moleculer/ioredis themselves. Risk: breaking-change install path. Rejected — worse UX than local-types fix.

### Alt-2 — Keep root barrel re-exports of subpath symbols for backward compat

Pros: zero migration cost.
Cons: defeats the entire fix — moleculer-typed exports at root mean root `dist/index.d.ts` still imports moleculer types. Pre-1.0 SemVer convention says minor bumps may break. Rejected.

### Alt-3 — Strip moleculer-typed exports from root WITHOUT subpath split

Force consumers to import from internal `moleculer-cacher.ts` directly.

Rejected: internal paths are not public API.

## Risks

- **R-1 — Internal `m9s-example` breakage on import sites** — mitigated by orchestrator's pre-seed grep (Phase 1) + Phase 4 patch.
- **R-2 — Subpath typesVersions mistakes** — Sprint 3.0.1 F-4 established the pattern; we mirror `tenant/`, `otel/`, `pg-client/` exactly. Low risk if RFC's `package.json` block followed.
- **R-3 — Test surface unaware of subpath** — new subpath barrels need a smoke test. Mitigated by FR-006 + D-4.

## Refs

- PRD-029 (this wave's PRD)
- EVID-044 (sources both CRITICALs)
- PRD-027 + EVID-043 (Wave 13 precedent)
- ADR-004 (foundation libs naming — subpath patterns)


