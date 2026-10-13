---
"@gertsai/entity-storage": minor
"@gertsai/rpc-proxy-builder": patch
---

Write-rules deferred gate + storage hardening (Fluxis RFC-024 follow-up):

- `entity-storage`: `assertPendingWrites` — deferred-eval gate that replays a runner's queued `PendingWrite[]` through the ruleset before the buffered commit flushes; `runBatch`/`runTransaction` now evaluate rules on every queued write (was: stamped but ungated).
- `entity-storage`: `set()`/`upsert()` are create-only on governed tables — writing over an existing row is denied instead of smuggling an update past update-rules with a false `create` journal.
- `entity-storage`: `delete()` accepts `{ action, params }` — action-keyed delete rules receive the journal just like updates.
- `entity-storage`: `write-stamps` helpers (`stampCreate`/`stampUpdate`/`stampDelete`/`stampRestore`/`actionFromOpts`) — single stamping point for service and runner paths.
- `entity-storage`: `InMemoryStorageProvider` returns cloned rows on reads/snapshots (mutating a returned doc no longer corrupts the store) and `update` on a missing row is a no-op, matching PostgreSQL `UPDATE ... WHERE` semantics.
- `rpc-proxy-builder`: `UnwrapValidator` unwraps typia `IValidation<T>` envelopes (`{ success: true, data: T }`) in addition to callable and `.validate()` shapes.
