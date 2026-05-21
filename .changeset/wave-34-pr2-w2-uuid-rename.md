---
'@gertsai/entity': minor
'@gertsai/core': minor
---

Wave 34 PR-2 — W2 surface-breaking `_uid → uuid` rename across `@gertsai/entity` + `@gertsai/core`.

Per ADI reasoning (Gemini-3-Flash-Preview via forgeplan_reason) H2 (Additive-First Phasing): this PR is the isolated surface-breaking change for clean revert if downstream breaks.

**Breaking changes**:

- **`@gertsai/entity` EntityJSON shape**: `Entity.toJSONObject()` now returns `{ uuid, data }` (was `{ _uid, data }`). Same for `EntityWithMetadata.toJSONObject()` which returns `{ uuid, data, metadata, __typename }`.
- **`@gertsai/core` UsersMetaType.data**: `_uid: string` field renamed to `uuid: string`.

**Migration**:

```ts
// Before:
const { _uid, data } = entity.toJSONObject();

// After:
const { uuid, data } = entity.toJSONObject();
```

No runtime fallback — pure structural rename. Update all consumers in a single PR for clean typecheck. Pre-1.0 minor bump per CLAUDE.md semver policy.

**Closes EVID-083 W2** — was deferred from Wave 33 as "major scope, separate decision". After Wave 33's narrower `@gertsai/session` `OperatorRef._uid → uuid` rename, this PR completes ecosystem parity (was "partial rename" per EVID-083 W2 finding).

**Files modified**: 7 files, +48/-9 LOC:
- `packages/entity/src/types.ts` — `EntityJSON.uuid: string` interface
- `packages/entity/src/Entity.ts` — `toJSONObject()` emits `uuid:`
- `packages/entity/src/EntityWithMetadata.ts` — same
- `packages/entity/src/Entity.test.ts` — 4 test sites
- `packages/entity/src/EntityWithMetadata.test.ts` — 3 test sites
- `packages/core/src/session/types.ts` — `UsersMetaType.data.uuid: string`
- `packages/entity/README.md` — Wave 34 breaking-change banner + migration table

**Out-of-scope `_uid` references intentionally untouched** (different concepts):
- `@gertsai/utils` — Firestore-style entity-uid (sync field concept)
- `@gertsai/pg-client/storage-provider.test.ts` — Storage Meta test fixture (data-row column name)
- `@gertsai/storage-core` README — historical Orchestra `IStorageDocumentSnapshot._uid` mention
- `examples/m9s-example` document.repository.ts — m9s document-row column name (`DocumentReadShape._uid`)
- `@gertsai/entity` internal `_uidGetter`/`_uidPath` — instance fields, not serialization keys

**Verification**:
- `pnpm typecheck` workspace — 0 errors
- `pnpm --filter @gertsai/entity test` — 63/63 (unchanged)
- `pnpm --filter @gertsai/core test` — 1244/1244 + 53 skipped (unchanged)
- `pnpm --filter @gertsai/pg-client test` — 37/37 (unchanged)
- m9s-example typecheck — 0 errors (no hidden consumers)

After Wave 34: EVID-083 100% closed (44/44 findings). Combined audit closure across Wave 25 (EVID-080) + Wave 31 (EVID-083) = 67/67 (100%). Forgeplan ledger fully drained (no blind spots, no advisory phase mismatches).

Refs: PRD-068, EVID-086 (closure proof), EVID-083 W2, ADI H2, Wave 33 PRD-067 (preceding closures), Wave 29.A (Session OperatorRef.uuid baseline rename).
