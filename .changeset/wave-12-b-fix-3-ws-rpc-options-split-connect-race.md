---
'@gertsai/ws-rpc': minor
---

Wave 12.B-fix-3 — close 2 HIGH findings (EVID-044) in
`@gertsai/ws-rpc`.

**1. `WsRpcOptions.headers?` silently discarded in browser**

`headers` was forwarded only on the Node.js WebSocket branch; browser
WebSocket silently discarded it. No type-level signal.

**Fix:** `WsRpcOptions` is now a discriminated union on
`environment`:

```ts
export interface WsRpcOptionsNode extends WsRpcOptionsBase {
  environment?: 'node';                 // default
  headers?: Record<string, string>;     // Node WebSocket only
}

export interface WsRpcOptionsBrowser extends WsRpcOptionsBase {
  environment: 'browser';               // explicit
  // No `headers` field — would be silently discarded
}

export type WsRpcOptions = WsRpcOptionsNode | WsRpcOptionsBrowser;
```

Browser-path attempt to pass `headers` is now a compile-time error.

**Backward compatibility:** old `{ url, headers }` callers continue
to work — `environment` defaults to `'node'`, which is the Node
variant that accepts `headers`.

**2. `connect()` post-open transient-error race**

When `connect()` was called while state was CONNECTING, the second
caller registered a fresh `once('error')` listener. If the WebSocket
subsequently emitted `error` AFTER `open` (transient protocol
error), the second caller's promise rejected even though the
connection succeeded for the first caller.

**Fix:** shared in-flight promise.
- `this.connecting: Promise<void> | null` slot holds the in-flight
  connect promise.
- Concurrent callers await the SAME promise; no duplicate listeners.
- `onOpen` removes `onError` listener before resolving, so
  post-open errors only emit (do not reject already-resolved
  callers).
- `finally { this.connecting = null }` lets later disconnect +
  reconnect work cleanly.

**Tests:** +3 concurrency tests (shared promise, post-open error
non-rejection, fresh-after-disconnect) + 3 discriminated-union tests
(Node accepts headers, Browser rejects via `@ts-expect-error`,
runtime drops headers in browser). 113/113 total pass.

Refs: PRD-031, RFC-022, EVID-044.
