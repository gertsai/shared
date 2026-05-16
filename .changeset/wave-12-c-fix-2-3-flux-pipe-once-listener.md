---
'@gertsai/flux': minor
---

Wave 12.C-fix-2+3 — close 2 HIGH logic findings (EVID-048 H-7 + H-8).

**H-7 — DataStream.pipe() overwrites prior pipeline + leaks listeners**

Previously every `pipe()` call:
1. Unconditionally reassigned `_processItem` (single slot — silently overwrote prior pipe)
2. Attached two persistent `on('end')` / `on('error')` listeners that were never cleaned up

Calling `pipe()` twice silently discarded the first transformer; orphaned listeners persisted forever.

**Fix (Option B — explicit single-pipe contract):** second call to `pipe()` throws `Error('DataStream.pipe(): only one pipe per stream is supported. Use multiple subscribe() calls for fan-out.')`. Listener refs are stored in `_pipeWiring` slot and removed via `_detachPipeListeners()` called from both `close()` and `destroy()`. After destroy, listener-count is 0.

Reasoning for Option B over Option A (true fan-out): single `_processItem` slot is structurally consumed by `write()`, `_processNextItem()`, `end()`; backpressure loop pauses the upstream once; existing tests only ever chain-pipe on different returned streams (`a.pipe(f).pipe(g)`), never multi-pipe on the same source. Option A would require fan-out write coordination + per-pipe pause accounting — out of HIGH-severity scope.

**H-8 — Once-listener removal by ListenerInfo reference identity**

Previously the once-cleanup loop used `off(event, fn)` which calls `findIndex` matching the first registration by function identity. If a user called `emitter.once('x', fn)` and `emitter.on('x', fn)` (same fn), removing the once accidentally removed the persistent `on` registration.

**Fix:** new private `_removeListenerInfo(event, info)` helper that splices by `ListenerInfo` reference identity. Once-cleanup in `emit()` and `emitAsync()` now uses this helper. Public `off(event, fn)` keeps function-identity semantics for backward compat.

**Tests:** +5 new FR-007 tests (throw on double-pipe, chain-pipe regression, listener-count assertion on destroy, no orphaned wiring, close()/destroy() symmetry); +4 new FR-008 tests (once+on same fn both orders, double-once same fn, emitAsync parity). 362/362 total pass.

Refs: PRD-034, EVID-048 (H-7, H-8).
