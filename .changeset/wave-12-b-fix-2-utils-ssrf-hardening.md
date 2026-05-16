---
'@gertsai/utils': minor
---

Wave 12.B-fix-2 — close 3 HIGH security findings (EVID-044).

**1. CWE-918 — DNS rebinding TOCTOU in `validateWebhookUrlAsync`**

The validator resolved DNS, checked IPs were public, but did not return
the resolved IP. Callers fetched by hostname — between validate and
fetch, DNS could return a different IP (rebinding).

**Fix (additive):** `validateWebhookUrlAsync` return type changed from
`Promise<void>` to `Promise<ValidationResultAsync>` with shape:

```ts
interface ValidationResultAsync {
  valid: boolean;
  url: URL;
  resolvedIp?: string;   // NEW
  error?: SsrfError;
}
```

Old void-callers continue to work (return value is now non-void but the
existing call signature is unchanged at the type-erased boundary).
Callers wanting true rebinding protection should fetch by `resolvedIp`
with an explicit `Host` header, per new JSDoc guidance.

**2. CWE-400 — `resolveHostname` AbortController not wired**

The timeout `controller.abort()` fired, but `dns.resolve4`/`resolve6`
did not receive the signal. They ran to completion regardless; the
`clearTimeout` in finally was defensive dead code.

**Fix:** `abortableResolve` helper wraps DNS calls in `Promise.race`
with an abort-signal rejector. Timeout now actually aborts the
resolution promise.

**3. CWE-338 — `getRandomId` weak PRNG + security-misuse trap**

Function uses `Math.random()` and was exported with a generic name
inviting misuse for tokens / session IDs / invite codes.

**Fix:**
- `@deprecated` JSDoc on `getRandomId` pointing to
  `getSecureRandomId`.
- One-shot `console.warn` on first call (suppressed under
  `NODE_ENV=test` or `VITEST=true` to avoid test-output pollution).
- New export `getSecureRandomId(length?: number)` using
  `crypto.randomBytes` + base62 rejection sampling (no modulo bias).
- `getRandomId` runtime behaviour unchanged — caller decides whether
  to migrate.

**New exports (additive):** `getSecureRandomId`,
`ValidationResultAsync`.

**Tests:** +6 unit tests for `getSecureRandomId`; existing URL
validator tests updated for new return shape; +3 abort-signal tests
+ 1 IP-pinning test. 485/485 total pass.

Refs: PRD-030, RFC-021, EVID-044.
