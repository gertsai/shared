---
"@gertsai/api-core": patch
---

fix(api-core): honor the ResponseCode of a transport-serialised APIError instead of collapsing to HTTP 500 (#115)

An `APIError` thrown from a handler loses its `instanceof` identity when it crosses
the Moleculer transport boundary (reconstructed as a plain object) or when imported
from a different installed copy of `@gertsai/api-core` (dual-package hazard). The
error-translation layer recognised `APIError` only via `instanceof` (plus the
unrelated `__ORCHESTRA_ERROR__` brand), so such errors fell through to
`APIError.fromError()` and were re-wrapped as `INTERNAL_ERROR` — e.g.
`APIError(ResponseCode.CONFLICT)` was served as **HTTP 500 `internal_error`**
instead of **409**.

The translation layer now also recognises an `APIError` **structurally** (by
`name === 'APIError'` / the `__API_ERROR__` brand plus a valid `ResponseCode`
`code`) via the new `APIError.isAPIErrorLike()` guard, and rebuilds it with the new
`APIError.fromSerialized()` — preserving the original `code` (and therefore the HTTP
status) and the already-formatted message verbatim (no double-prefix). Applied at
all three shared error-translation sites: the pipeline `translateError` stage, the
Moleculer api-gate `sendError`, and the queue/subscriber error translators in
`ApiController`.

Affects every consumer that throws domain `APIError`s with a non-default
`ResponseCode`. Unblocks gertsai/gerts-hub#9.
