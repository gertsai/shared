---
'@gertsai/m9s-cache': minor
---

Wave 12.B-fix-2 — close 2 HIGH security findings (EVID-044).

**1. `RedlockLockProvider.tryAcquire` silent DoS amplifier**

Previously `try { acquire } catch { return null }` could not
distinguish "lock held" from "Redis unreachable" or "Redlock
misconfigured". When Redis was down, every request returned
lock-unavailable, and `wrapNonBlocking` bypassed caching for every
request — a silent DoS amplification.

**Fix:** new private `_isLockHeldError(err)` classifier matches
`name === 'ResourceLockedError'` (Redlock 5.x lock-already-held) and
`name === 'ExecutionError'` with quorum-related message. Returns
`null` only for these expected cases; all other errors propagate to
the caller so infrastructure outages surface immediately.

**2. CWE-20 — `validateKeys` default backwards in production**

Prior code:
```ts
this.validateKeys = options.validateKeys ?? (process.env.NODE_ENV !== 'production');
```
This validated keys in development but accepted arbitrary keys in
production — the opposite of safe. With Redis `KEYS pattern` glob
semantics, a tenant-supplied key fragment with `*` could match other
tenants' keys under a later `clean()` invocation.

**Fix:**
```ts
this.validateKeys = options.validateKeys ?? true;
```
Production now gets strict validation by default. Callers opt out
explicitly with `validateKeys: false`. The Moleculer adapter
already passes `validateKeys: false` (Moleculer generates safe keys
per its own conventions) so it is unaffected.

**Migration:** any external consumer constructing `CacheStore`
directly with non-conforming keys must add `validateKeys: false`
explicitly OR migrate keys to conform to `DEFAULT_KEY_PATTERN`. This
is the desired security fix — callers were silently relying on lax
production behaviour.

**Tests:** +11 new tests for `RedlockLockProvider` error
classification + construction; obsolete "skips validation in
production" test replaced with 3 strict-default tests. 119/119 total
pass.

Refs: PRD-030, RFC-021, EVID-044.
