---
'@gertsai/entity-storage': minor
---

Sprint 3.6 P2 polish batch (post-Sprint-3.5.2 audit findings).

**BREAKING for consumers without `@gertsai/storage-core` install**: `peerDependenciesMeta.@gertsai/storage-core.optional: true` flag removed. `@gertsai/storage-core` is now strictly required as a peer dependency (was optional during Wave 4B Phase A intermediate state). Consumers without storage-core installed will see install-time error instead of runtime resolve failure. Per architecture review, this is appropriately classified as `minor` SemVer bump (changes consumer install behavior).

Additive (non-breaking):
- `InMemoryStorageProvider<Meta extends StorageMetadata = StorageMetadata>` default generic — call sites without explicit `<Meta>` now compile cleanly. Existing call sites with explicit generic continue to work unchanged.
- `BaseEntityStorageService.upsert(entity & { _uid }, options?)` atomic upsert helper — branches `get → update vs set` to preserve `created_at` semantic. Returns `{ id }` for parity with `set`. Routing options (`runTransaction`, `runBatch`) propagate. 3 tests added (`__tests__/upsert.test.ts`).
- `README.md` cleanup: removed "Wave 4B Phase A/B" intermediate-state language at lines 80, 152. Documented current canonical state per ADR-005.
