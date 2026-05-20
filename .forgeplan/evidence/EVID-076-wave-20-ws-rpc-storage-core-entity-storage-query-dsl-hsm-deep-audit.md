---
depth: tactical
id: EVID-076
kind: evidence
links:
- target: PRD-058
  relation: informs
status: active
title: Wave 20 — ws-rpc + storage-core + entity-storage + query-dsl + hsm deep audit
---

## Summary

Wave 20 deep audit covers the remaining 5 platform packages — `@gertsai/ws-rpc`, `@gertsai/hsm`, `@gertsai/storage-core`, `@gertsai/query-dsl`, `@gertsai/entity-storage` — for a combined ~6.3k LOC of source + ~3.5k LOC of tests. Wave 12.D (EVID-051) touched these shallow; Wave 18 went deep on `entity-adapters` (EVID-074). This wave closes the platform-package gap.

Headline themes: (a) `InMemoryStorageProvider` has two SIGNIFICANT correctness bugs in `runBatch`/`runTransaction` commit (writes-without-reads cannot conflict; concurrent commits do whole-collection snapshot replacement which clobbers each other's writes). (b) `ws-rpc` has a silent reconnect-death path when the very first WebSocket creation rejects before `onopen` ever fires — reconnect chain terminates because no `onclose` event is produced. (c) `ws-rpc` `SubscriptionManager.wildcardMatch` is recursive without depth/iteration bounds and can be DoS'd by an adversarial server pushing deep `**`-laden topic strings. (d) `query-dsl` SQL compiler validates identifiers via regex but accepts SQL reserved words (`select`, `from`, ...) as field/table names because it doesn't actually quote with `"..."`; (e) cross-package: `applyQueryFilter` in `entity-storage` silently ignores `offset` even though `compileToSql` honors it — InMemory and Pg providers return different rows for the same query.

Distribution: **0 CRITICAL · 8 HIGH · 12 MEDIUM · 9 LOW**. The two `InMemoryStorageProvider` bugs are HIGH (not CRITICAL) because the package is documented as a test fixture; in tests they silently mask real concurrency bugs in callers. The ws-rpc reconnect-death is HIGH because production websocket clients with no upstream-DNS resolution will permanently stop reconnecting. `query-dsl` parameter binding is correct (no SQL injection); the audit confirmed every `whereField` value is bound via `$N` positional parameters in `compileToSql`. The storage triple (`storage-core` + `query-dsl` + `entity-storage`) holds together on the `preservesCreatorAudit` capability — both InMemory and Pg providers honor it correctly per Wave 7.2.

## Structured Fields

- verdict: weakens
- congruence_level: CL3
- evidence_type: internal_audit
- linked_artifact: PRD-058
- summary: 5 platform packages audited deep, ~9.8k LOC scanned, 8 HIGH/12 MED/9 LOW findings, 0 CRITICAL; biggest themes are InMemoryStorageProvider concurrent-commit data-loss, ws-rpc reconnect-death-on-pre-onopen-failure, ws-rpc wildcard ReDoS, and applyQueryFilter/compileToSql divergence on `offset`/`limitToLast`.

## Coverage Stats

| Package | Source LOC | Test LOC | Tests | Findings (C/H/M/L) |
|---|---|---|---|---|
| @gertsai/ws-rpc | 1653 | 1529 | ~75 | 0 / 3 / 5 / 2 |
| @gertsai/hsm | 2202 | ~700 | 32 | 0 / 1 / 2 / 4 |
| @gertsai/storage-core | 685 | 601 | ~30 | 0 / 0 / 1 / 1 |
| @gertsai/query-dsl | 876 | 528 | ~25 | 0 / 0 / 2 / 1 |
| @gertsai/entity-storage | 1775 | 1933 | ~80 | 0 / 4 / 2 / 1 |
| **Total** | **7191** | **5291** | **~242** | **0 / 8 / 12 / 9** |

## CRITICAL findings

None.

The closest miss is **H-ENT-1** (`InMemoryStorageProvider.runTransaction` writes-only path silently loses data on concurrent commits). It is HIGH-not-CRITICAL because the provider is documented as a test fixture; in production code paths the analogous `PgStorageProvider.runTransaction` uses real Postgres SERIALIZABLE isolation. The hazard is that the in-memory fixture lies about transactional semantics, so unit tests can pass while the production-equivalent code would fail — a subtle test-fidelity gap.

## HIGH findings (per package)

### @gertsai/ws-rpc

- **H-WS-1 — Reconnect chain silently terminates on pre-onopen failures**
  File: packages/ws-rpc/src/client.ts:541-550
  When `createWebSocket()` rejects (DNS error, ECONNREFUSED, ws-lib import failure), the `connect()` promise rejects, `state = CLOSED`, and `scheduleReconnection` is NEVER invoked because there is no `onclose` event (no socket was ever opened). The comment at L-547-549 says "Will trigger another reconnection attempt via handleClose" — incorrect, `handleClose` only fires on `ws.onclose`, which fires only for sockets that previously opened.
  Impact: a client that boots while the server is unreachable will never reconnect even after the server comes back online — the reconnect timer never re-arms.
  Fix: in `connect()`'s catch path, call `this.scheduleReconnection()` after setting `state = CLOSED`, OR have the rejected branch synthesize a `handleClose(1006, 'connect-failed')` so the existing reconnect-on-close logic applies.

- **H-WS-2 — SubscriptionManager.wildcardMatch is exponential in depth and unbounded recursion**
  File: packages/ws-rpc/src/subscription.ts:143-196
  `**` segments recurse via `wildcardMatch(remainingPattern, remainingTopic)` with no depth or iteration limit. An adversarial server pushing a notification with a topic like `a.b.c.d.e.f...` against a subscriber pattern `**.**.**.**.x` will fan-out exponentially — the call tree is O(N^M) where N=topic-segments, M=number-of-double-stars.
  Impact: client DoS via CPU exhaustion if the upstream is untrusted.
  Fix: bound the number of `**` segments in a pattern at registration time (reject >2 `**`), OR convert to an iterative NFA-style match, OR memoize subproblems with a `Map<key,boolean>`. Cheapest fix: at L-51 in `subscribe()`, count `pattern.split('.').filter(x => x === '**').length` and throw if >2.

- **H-WS-3 — Heartbeat is JSON-RPC notification, not WebSocket protocol-level ping**
  File: packages/ws-rpc/src/client.ts:570-583
  `notify('ping')` sends a JSON-RPC notification with method `ping`. If the server has no handler for `ping`, the heartbeat is silently dropped. There is no pong-tracking either way — broken TCP sessions are detected only by OS-level keepalive (default ~2h on Linux).
  Impact: half-open connections persist until OS TCP timeout; the client thinks it's connected and queues messages that never deliver.
  Fix: use WebSocket protocol ping frames (`ws.ping()` in the Node `ws` lib; not available in browser) AND track a `lastPongAt` watchdog. Alternative: send a JSON-RPC `call('ping')` (request-not-notification) and treat timeout as a connection failure → `disconnect(1001)`.

### @gertsai/hsm

- **H-HSM-1 — ConvergentEncryption trusts provider's `verified` flag when true**
  File: packages/hsm/src/convergent-encryption.ts:188-198
  When `verifyOnDecrypt=true` AND the provider's `result.verified === true`, the wrapper does NOT recompute the hash to confirm. A buggy or compromised provider can return `verified: true` for tampered plaintext. The fallback (L-189-191) only fires when `result.verified === false`.
  Impact: integrity check is conditional on provider honesty — defeats the defence-in-depth purpose of `verifyOnDecrypt`.
  Fix: when `verifyOnDecrypt: true`, ALWAYS recompute `SHA-256(plaintext) === contentHash`. Drop the `result.verified` shortcut, or AND it with the recomputed value.

### @gertsai/storage-core

None at HIGH severity.

### @gertsai/query-dsl

None at HIGH severity. SQL injection surface is properly closed via positional parameter binding (`$1..$N`) for all values; identifier validation uses a strict ASCII regex.

### @gertsai/entity-storage

- **H-ENT-1 — InMemoryStorageProvider.runTransaction silently overwrites concurrent commits**
  File: packages/entity-storage/src/InMemoryStorageProvider.ts:376-451 (esp. L-422-440)
  Read-set conflict detection iterates only `reads` (L-423). Writes that were NEVER preceded by a `tx.get(...)` for the same key are not in `reads`, so they're not version-checked. Worse, commit (L-438-440) does `this._store.set(path, snap)` — replacing the entire path map with the transaction's snapshot. If tx1 and tx2 both snapshot the same collection (empty), tx1 commits {A}, tx2 (whose snap was taken BEFORE tx1's commit and never updated) commits {B}: the live map ends with {B} only. **A is lost**.
  Impact: tests that exercise concurrent transactions on the same path will pass while the same logic against a real DB (with SERIALIZABLE) would conflict — test fidelity gap.
  Fix: at commit, do per-key merge (`for (const [id, doc] of snap) this._coll(path).set(id, doc)`) instead of whole-map replacement. AND: extend conflict detection to writes — record version-at-snapshot for every written key, re-verify at commit.

- **H-ENT-2 — InMemoryStorageProvider.runBatch has the same whole-collection replacement hazard**
  File: packages/entity-storage/src/InMemoryStorageProvider.ts:322-372 (esp. L-358-360)
  Same root-cause as H-ENT-1 — batch commit at L-358-360 does `this._store.set(path, snap)` where `snap` is the snapshot taken at first `ensureSnap`. Concurrent batches (or batch + bare `set`) interleave and the later commit clobbers the earlier.
  Fix: same as H-ENT-1 — replace whole-map swap with per-key merge.

- **H-ENT-3 — applyQueryFilter silently ignores `offset` while compileToSql honors it**
  File: packages/entity-storage/src/applyQueryFilter.ts:244-251
  applyQueryFilter handles `where → orderBy → cursors → limit` but does NOT handle `offset` at all (no case in any of the constraint loops). Meanwhile compileToSql at packages/query-dsl/src/sql.ts:133-137 emits `OFFSET $N` and the runtime validator at packages/query-dsl/src/validate.ts:107-119 accepts the constraint. Result: same query against InMemoryStorageProvider vs PgStorageProvider returns different rows.
  Impact: any test that uses `offset()` against the in-memory fixture is a false-positive — production runs through Pg will produce different result sets.
  Fix: add an `offset` case to applyQueryFilter after the limit slice (`result = result.slice(offsetValue)`) — but BEFORE the limit, matching SQL pipeline `WHERE → ORDER BY → OFFSET → LIMIT`.

- **H-ENT-4 — applyQueryFilter ignores `limitToLast` silently; compileToSql throws**
  File: packages/entity-storage/src/applyQueryFilter.ts (no case at all) vs packages/query-dsl/src/sql.ts:138-147
  Same divergence class as H-ENT-3. compileToSql explicitly throws `'limitToLast is not supported by the reference Postgres compiler'`; applyQueryFilter silently no-ops. Behavior mismatch.
  Fix: either implement `limitToLast` in applyQueryFilter (slice tail after sort) OR have it throw the same error compileToSql does — pick whichever matches the intended contract.

## MEDIUM findings (consolidated)

- **M-WS-1** — `reconnect.ts:82-95` first-reconnect delay is `initialDelay * factor` not `initialDelay`. After `recordAttempt()` bumps attempts to 1, `getDelay()` returns `initialDelay * factor^1 = 2000ms` for default config — first reconnect should be 1000ms. Off-by-one. Fix: use `attempts - 1` in the pow exponent, or compute delay BEFORE recordAttempt.

- **M-WS-2** — `client.ts:432` malformed JSON is silently dropped with no `error` emit. Comment says "Not JSON — ignore". Hostile or buggy servers can corrupt the stream and the client has no visibility. Fix: `this.emit('error', new Error('Received non-JSON WebSocket message'))` for at least observability.

- **M-WS-3** — `client.ts:618-620` `queueMessage` drops oldest silently when `maxQueueSize` reached. The dropped message's caller is awaiting a `call()` promise whose timeout will eventually fire — so the user gets `RpcTimeoutError` for a message that never even left the queue. Misleading. Fix: emit an `error` with the dropped request's id+method, or reject the pending request immediately.

- **M-WS-4** — `reconnect.ts:91-92` jitter is `±25%` symmetric, not "full jitter" per CWE-409. ADR-009 Amendment 1.2.7 mandates full jitter for `@gertsai/async-utils`; ws-rpc predates the rule but should align for consistency.

- **M-WS-5** — `subscription.ts:71` `unsubscribe(id: string)` returns a boolean but the wrapper at `client.ts:417` ignores it. Callers of `subscribe()`'s returned function get `void`. Spec the contract.

- **M-HSM-1** — `vault.provider.ts:353` `keys/${this.config.keyName}` interpolates `keyName` unencoded into URL path. If config-bug or dynamic-config flow lets `keyName` contain `/` or `..`, the Vault REST path traverses to unintended keys. Fix: validate `keyName` matches `/^[a-zA-Z0-9_-]+$/` at construction; `encodeURIComponent` defensively.

- **M-HSM-2** — `retry.ts:91` `delay = Math.min(currentDelay * jitterFactor, maxDelayMs)` mixes jittered-for-sleep with raw-for-state. Mild but the jittered value should NOT be used to update `currentDelay` at L-97 (and it isn't — but the asymmetry is subtle). Document or compute jitter just-in-time at sleep.

- **M-STG-1** — `storage-core/src/types.ts:188-230` `StorageCapabilities.upsert` is optional with documented default `{ supported: false, preservesCreatorAudit: false }` but providers can omit it entirely. There's no runtime check to assert capability presence — consumers must handle `upsert === undefined`. The fast path at `BaseEntityStorageService:511-517` uses `upsertCap?.supported === true` which correctly treats undefined as false. OK but the documentation contract is weaker than what the code expects.

- **M-QDS-1** — `query-dsl/src/sql.ts:245-252` `quoteIdent` validates with regex but emits the identifier unquoted. Postgres reserved words like `select`, `from`, `where`, `order`, `desc` pass the regex but generate broken SQL like `SELECT * FROM users WHERE order = $1`. Not an injection — but it's a footgun for callers naming an `indexed` field after a reserved word. Fix: emit `"<name>"` always.

- **M-QDS-2** — `query-dsl/src/sql.ts:148-157` cursor constraints (`startAt`/`startAfter`/`endAt`/`endBefore`) are silently no-op'd in SQL output. Comment documents the limitation but applyQueryFilter DOES implement them. Asymmetric — same query returns different rows between InMemory and Pg. Same divergence class as H-ENT-3 but rated MED because it's documented.

- **M-ENT-1** — `InMemoryStorageProvider:103-117 _emitDoc` swallows listener exceptions with no logger. Production Pg-backed listeners (when implemented) would benefit from a structured-log hook. Fix: accept an optional `StorageLogger` in InMemoryStorageProvider constructor (parity with BaseEntityStorageService) and `logger.warn('listener-threw', { path, id, error })`.

- **M-ENT-2** — `BaseEntityStorageService.upsert()` fast-path at L-531-541 deliberately does NOT emit `ENTITY_CREATED`/`ENTITY_UPDATED` because it cannot tell insert from update without a pre-read. Documented. The trade-off is event-loss for listeners. Provide an opt-in flag `emitUpsertAsCreated: boolean` for callers who prefer one synthetic event over none.

## LOW findings (consolidated)

- **L-WS-1** — `types.ts:202-211` `Subscription.callback` is `SubscriptionCallback<T = unknown>` but stored as `unknown` after the cast at `subscription.ts:60`. Type erasure inside the manager; callers cast back. Mild.

- **L-WS-2** — `client.ts:673-675` `generateId()` returns ++counter as `number` — wraps at Number.MAX_SAFE_INTEGER. Theoretically unbounded session can collide; practically irrelevant.

- **L-HSM-1** — `convergent-encryption.ts:191` `computedHash === context` non-constant-time string comparison. Hash equality isn't secret-equality so no timing leak — but `crypto.timingSafeEqual` is the conventional belt-and-suspenders.

- **L-HSM-2** — `vault.provider.ts:715` network-error detection via `err.message.includes('fetch')` is brittle/English-only.

- **L-HSM-3** — `vault.provider.ts:440` algorithm hardcoded as `'aes256-gcm96'`. If Vault key changes type (admin action), the metadata lie about cipher.

- **L-HSM-4** — `mock.provider.ts:151-157` AES-GCM nonce is derived deterministically (correct for convergent encryption) BUT there's no Additional Authenticated Data binding the ciphertext to the context. A theoretical attacker who controls plaintext could rebind ciphertexts across contexts. Fix: pass `context` as AAD via `cipher.setAAD(Buffer.from(context, 'hex'))`. Pure hardening on a test fixture.

- **L-STG-1** — `storage-core/src/errors.ts:38-52` `ListenersNotSupportedError` uses `Object.setPrototypeOf(this, new.target.prototype)` which is correct for transpiled ES5 but doesn't survive realm boundaries either. Document the cross-realm caveat.

- **L-QDS-1** — `constraints.ts:101-105` `limit(n)` allows `n=0` (returns empty result). Mirrors SQL `LIMIT 0` but unusual. Document or reject.

- **L-ENT-1** — `InMemoryStorageProvider:103-117` listener registration order is iteration order of `Set`. Insertion-order in V8 but spec-fragile. Document.

## Cross-package observations

### CP-1 — Storage triple capability honesty holds, but the contract is fragile

The `preservesCreatorAudit` capability per Wave 7.2 is honored by both implementations:
- `InMemoryStorageProvider.upsertDoc` (packages/entity-storage/src/InMemoryStorageProvider.ts:190-216) pre-checks `Map.has(id)` and merges `creator_uuid`/`created_at` from the existing doc. Correct.
- `PgStorageProvider.upsertDoc` (packages/pg-client/src/storage-provider.ts:368-382) uses `data || (EXCLUDED.data - 'creator_uuid' - 'created_at')` jsonb operators. Correct.

But the **field-name contract is implicit** — both providers hard-code `'creator_uuid'` and `'created_at'`. If `@gertsai/entity-audit` ever changes those names (e.g. camelCase migration), both providers AND `BaseEntityStorageService.upsert` need synchronized updates. There's no shared constant. Fix: export `AUDIT_FIELD_NAMES` from `@gertsai/entity-audit` and import in both providers; alternatively, providers consume a `MutationMarks` strip-list from the audit package.

### CP-2 — applyQueryFilter / compileToSql / validateQuery disagree on supported constraints

Three packages each have their own view of which constraints are honored:

| Constraint | validateQuery (query-dsl) | compileToSql (query-dsl) | applyQueryFilter (entity-storage) |
|---|---|---|---|
| where (all ops) | yes | yes | yes |
| orderBy | yes | yes | yes |
| limit | yes | yes | yes |
| limitToLast | yes | THROWS | silently ignored |
| offset | yes | yes | silently ignored |
| startAt/After/EndAt/Before | yes | silently no-op | yes |

The mismatch means the same `Query<Meta>` returns different rows depending on which backend executes it. Tests pass against InMemory but production-Pg returns different shapes (or vice-versa).

Fix: define a single capability matrix — either applyQueryFilter implements the full set (closing offset+limitToLast gaps) and compileToSql throws on cursors uniformly, OR validateQuery refuses constraints that aren't universally supported and downgrades the contract.

### CP-3 — ws-rpc abuse surface relies entirely on client-side caps

`maxMessageSize` (1MB default), `maxPendingRequests` (1000 default), `maxQueueSize` (100 default) are the only abuse-resistance levers. There is no:
- per-method rate limit
- per-topic subscription cap
- backpressure signal to the server when queues fill
- detection of the SubscriptionManager wildcardMatch DoS (H-WS-2)
- size limit on individual subscription topic strings

If the server is untrusted (e.g., 3rd-party RPC integration), an attacker can push 1000 notifications/sec with adversarial topic strings and CPU-DoS the client. Fix: introduce a `SubscriptionManager` size cap, an `onNotificationDropped` hook, and document the trust model in `@gertsai/ws-rpc/README.md`.

### CP-4 — HSM error taxonomy doesn't compose with `@gertsai/errors` Shared Kernel (ADR-006)

`HSMError` in `hsm/src/types.ts:400-444` extends `Error` directly, not `AppError<D>` from `@gertsai/errors`. The Shared Kernel pattern per ADR-006 would have HSMError extend AppError with `kind: 'HSM_*'`. Cross-package error handling (e.g., a service that wraps HSM + storage + session) would have to special-case HSMError. Fix in Wave 21 or later: refactor `HSMError` to extend `AppError`, mapping codes onto a new `'HSM'` ErrorKind in `@gertsai/errors`. Backward-compat: re-export the legacy class shape with `Object.setPrototypeOf` plumbing.

### CP-5 — InMemoryStorageProvider semantic note documentation underplays the concurrency caveats

The doc at packages/entity-storage/src/InMemoryStorageProvider.ts:14-26 says "Transactions track a `_version` counter per (path, id). A read-during-tx records the observed version; commit re-reads the current version and throws TransactionConflictError on mismatch." This documents H-ENT-1 in passive voice — readers don't connect "read-during-tx" with "blind writes have no protection." Augment with a "Concurrency caveat" subsection that calls out: (a) blind writes don't conflict, (b) commits do whole-collection replacement.

## Suggested Wave 21 fix sequence

Prioritized by combined (severity × visibility × patch-complexity):

1. **H-WS-1 reconnect-death fix** — 1 line change in `scheduleReconnection` catch, or new `connect()` catch handler. Production-impacting. ~30 min including test.
2. **H-ENT-1 + H-ENT-2 InMemoryStorageProvider commit semantics** — replace whole-map swap with per-key merge in both `runBatch` and `runTransaction`. Plus extend version-checking to write-set. ~2-3h including concurrent-commit test coverage.
3. **H-ENT-3 + H-ENT-4 applyQueryFilter parity** — add `offset` handling, decide on `limitToLast` (implement OR throw). ~30 min.
4. **H-WS-2 wildcardMatch DoS** — bound `**` count at subscribe time (cheap), document trust model in README. ~20 min.
5. **H-WS-3 heartbeat upgrade** — use protocol-level ping frames in Node (`ws.ping()`), track pong, force-disconnect on missed pong. Browser keeps notification-ping as best-effort. ~1h.
6. **H-HSM-1 always-verify-on-decrypt** — drop the `result.verified` shortcut. ~10 min + test.
7. **M-WS-1 reconnect off-by-one** — change exponent formula. ~5 min.
8. **M-QDS-1 quoteIdent actually quotes** — emit `"<name>"`. Minor migration risk for existing PgStorageProvider users (was their column unquoted-uppercase?). ~30 min.
9. **CP-2 query DSL capability matrix** — document or implement; consider adding a capability flag `supportsCursors: boolean` etc. on the IStorageProvider. ~2h design discussion + 2h impl.
10. **CP-1 shared audit field names** — small refactor across 3 packages. ~1h.

All ten land cleanly inside Wave 21 budget. None require ADR amendments; H-ENT-1/2 may benefit from a SPEC documenting the new InMemory semantics.

## Methodology

Files audited (read in full):
- ws-rpc: client.ts (721), reconnect.ts (151), subscription.ts (273), types.ts (386), index.ts (122) — 5 files
- hsm: types.ts (495), convergent-encryption.ts (302), providers/vault.provider.ts (729), providers/mock.provider.ts (380), utils/retry.ts (170), index.ts (128) — 6 files
- storage-core: types.ts (484), errors.ts (96), identifier.ts (83), index.ts (22) — 4 files
- query-dsl: constraints.ts (299), sql.ts (252), validate.ts (143), types.ts (148), index.ts (34) — 5 files
- entity-storage: BaseEntityStorageService.ts (850), InMemoryStorageProvider.ts (452), applyQueryFilter.ts (254), AuditedRunners.ts (134), STORAGE_EVENTS.ts (36), index.ts (49) — 6 files
- cross-reference: pg-client/storage-provider.ts (selected 280-400) — 1 partial

Total: 26 files, ~7.2k source LOC. Test files inventoried but not line-by-line audited (per scope).

Tools used: Read (full-file), Bash grep (cross-package consistency probes), forgeplan CLI for MCP-equivalent artifact creation. No source modified.

## Refs

- PRD-058 (target — Wave 20 deep audit scope definition)
- EVID-051 (Wave 12.D shallow precedent on these same packages)
- EVID-059 (Wave 13.D2 deep audit pattern — core)
- EVID-074 (Wave 18 deep audit pattern — entity-adapters)
- ADR-005 (storage-core architecture; capabilities matrix per CP-2)
- ADR-006 (Shared Kernel errors pattern — relevant to CP-4)
- ADR-009 (async-utils retry/jitter — relevant to M-WS-4)
- Wave 7.2 commit f791e8a (preservesCreatorAudit capability boolean-pair shape)




