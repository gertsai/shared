---
'@gertsai/fetch': minor
---

Wave 12.B-fix-2 — close HIGH DoS finding (EVID-044, CWE-770).

**Problem:** `resolveBody` only enforced `maxBodySize` on sync/async
iterable bodies. A 500 MB Blob, ArrayBuffer, Uint8Array, string, or
URLSearchParams passed through the early branches without size check,
defeating the documented DoS protection.

**Fix:** uniform `maxBodySize` enforcement at every branch of
`resolveBody`. New typed error `BodyTooLargeError extends Error` with
structured fields `{ size: number; limit: number }`. Existing iterable
guard refactored to use the same `_checkBodySize` helper for semantic
consistency.

**New exports (additive):** `BodyTooLargeError`.

**Default `maxBodySize`:** unchanged at 50 MB.

**Tests:** +20 new tests covering each body branch + UTF-8 byte-length
correctness + iterable regression coverage. 84/84 total pass.

**Consumer impact:** consumers catching generic `Error` continue to
work. Consumers wanting to discriminate can now `instanceof
BodyTooLargeError`.

Refs: PRD-030, RFC-021, EVID-044.
