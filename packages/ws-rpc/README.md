<div align="center">

# @gertsai/ws-rpc

### WebSocket JSON-RPC 2.0 — auto-reconnect, topics, type-safe

A Tier-1 client for talking to JSON-RPC 2.0 servers over WebSocket. Exponential backoff,
topic subscriptions with wildcards, message queuing, heartbeat — and a typed surface for both
browser and Node.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Fws--rpc-orange?style=flat-square)](https://www.npmjs.com/package/@gertsai/ws-rpc)
[![License: MIT](https://img.shields.io/badge/license-MIT-000.svg?style=flat-square)](LICENSE)
[![Tier](https://img.shields.io/badge/tier-1%20(no%20deps)-blue?style=flat-square)](#status)

</div>

---

## Why @gertsai/ws-rpc

<table>
<tr>
<td width="50%">

### Without
- Hand-rolled `WebSocket` with ad-hoc reconnect
- Pending promises that hang forever after a drop
- Topic routing reinvented per-app
- "Did the server actually receive that?" — silence
- Browser/Node split into two clients

</td>
<td width="50%">

### With
- One `WsRpcClient` — `connect`, `call`, `notify`, `subscribe`
- Pending requests rejected on disconnect, no leaks
- Wildcards built-in (`user.*`, `pipeline.**`)
- Message queue while offline, drained on reconnect
- Same API in browser and Node (`ws` peer optional)

</td>
</tr>
</table>

## Install

```bash
pnpm add @gertsai/ws-rpc
# Node-side only: provide a WebSocket implementation
pnpm add ws
```

Peer `ws@^8` is optional — browsers use the global `WebSocket`.

## Quickstart

### Connect

```typescript
import { WsRpcClient } from '@gertsai/ws-rpc';

const client = new WsRpcClient({
  url: 'ws://localhost:3023/ws',
  timeout: 30000,
  reconnect: { maxAttempts: 5, delay: 1000, factor: 2, jitter: true },
});

await client.connect();
```

### Call (request → response)

```typescript
import { RpcError, RpcTimeoutError } from '@gertsai/ws-rpc';

try {
  const result = await client.call<{ answer: string }>('graph.query', {
    question: 'What is NeuraTech?',
    tenantId: 'demo',
  });
  console.log(result.answer);
} catch (err) {
  if (err instanceof RpcError)        console.error(err.code, err.message);
  if (err instanceof RpcTimeoutError) console.error('timeout', err.method);
}
```

### Subscribe (topic stream)

```typescript
// Exact topic
const off = client.subscribe<{ progress: number }>('ingest.progress', (e) => {
  console.log(`${e.progress}%`);
});

// Single-segment wildcard: matches user.created, user.updated, ...
client.subscribe('user.*', (e) => console.log('user event', e));

// Multi-segment wildcard: matches api.users.get, api.orders.create, ...
client.subscribe('api.**', (e) => console.log('api event', e));

off();              // unsubscribe one
client.disconnect(); // close cleanly
```

## What you get

| Feature | Status | Notes |
|---|---|---|
| **JSON-RPC 2.0** | Full | Requests, responses, notifications, batches via type guards |
| **Auto-reconnect** | Built-in | Exponential backoff + jitter, configurable cap |
| **Topic subscriptions** | Built-in | Wildcards `*` (one segment) and `**` (many) |
| **Message queuing** | Built-in | Buffers up to `maxQueueSize` while offline; drains on reconnect |
| **Heartbeat** | Built-in | Configurable ping interval; `0` to disable |
| **Type safety** | Strict | Generic `call<TResult, TParams>`, typed events, exhaustive guards |
| **Cross-platform** | Yes | Browser `WebSocket` or Node `ws` peer (optional) |
| **Backpressure** | Yes | `maxMessageSize` (1MB default), `maxPendingRequests` (1000 default) |
| **Pending hygiene** | Yes | All in-flight calls rejected on `disconnect()` |

## API surface

Documented exports from `@gertsai/ws-rpc`:

```typescript
// Client + utilities
export { WsRpcClient }          // main class
export { ReconnectStrategy }    // standalone backoff calculator
export { SubscriptionManager }  // standalone topic dispatcher

// Errors
export { RpcError, ConnectionError, RpcTimeoutError }

// Constants
export { JSON_RPC_VERSION, JsonRpcErrorCode }

// Type guards
export {
  isValidJsonRpcId,
  isJsonRpcRequest, isJsonRpcNotification,
  isJsonRpcResponse, isJsonRpcSuccessResponse, isJsonRpcErrorResponse,
}

// Types
export type {
  JsonRpcId, JsonRpcRequest, JsonRpcNotification, JsonRpcError,
  JsonRpcResponse, JsonRpcSuccessResponse, JsonRpcErrorResponse,
  WsRpcOptions, ReconnectOptions,
  Subscription, SubscriptionCallback,
  WsRpcEvents, PendingRequest,
}
```

### `WsRpcClient` — core methods

| Method | Returns | Purpose |
|---|---|---|
| `connect()` | `Promise<void>` | Open the socket; resolves on `open`, rejects on fatal error |
| `disconnect(code?, reason?)` | `void` | Close cleanly; rejects all pending calls |
| `call<TResult, TParams>(method, params?)` | `Promise<TResult>` | JSON-RPC request with timeout |
| `notify<TParams>(method, params?)` | `void` | Fire-and-forget notification |
| `subscribe<T>(topic, cb)` | `() => void` | Subscribe to topic; returns unsubscribe |
| `isConnected()` | `boolean` | Quick liveness check |
| `getState()` | `'connecting' \| 'open' \| 'closing' \| 'closed'` | Detailed state |
| `getPendingCount()` / `getQueueSize()` / `getSubscriptionCount()` | `number` | Introspection |

### Events (typed via `WsRpcEvents`)

`open` · `close(code, reason)` · `error(error)` · `reconnecting(attempt, delay)` ·
`reconnected` · `notification(method, params)` · `message(data)`

### Options highlights — `WsRpcOptions`

```typescript
{
  url: string;                       // required
  protocols?: string | string[];     // WebSocket sub-protocols
  timeout?: number;                  // request timeout, default 30000ms
  heartbeatInterval?: number;        // default 30000ms, 0 to disable
  maxQueueSize?: number;             // default 100
  maxMessageSize?: number;           // default 1MB
  maxPendingRequests?: number;       // default 1000
  headers?: Record<string, string>;  // Node only
  reconnect?: ReconnectOptions;
}
```

## Reconnect strategy

`ReconnectStrategy` computes `delay * factor^attempts`, clamped at `maxDelay`, with optional
±25% jitter to spread reconnect storms. After `maxAttempts`, the client stops retrying and
surfaces a `ConnectionError`. Call `client.connect()` again to reset the counter — or use
`ReconnectStrategy` standalone for any other reconnect loop.

## Status

**v0.1.0 — pre-1.0, stable surface.** Tier 1: zero internal deps, only `eventemitter3`
runtime + optional `ws` peer.

- 107 tests passing across `client`, `reconnect`, `subscription`, `types`
- Hardened: message size cap, pending-request cap, XOR-correct response guard, pending cleanup on disconnect
- Pre-production work tracked in [`TODO.md`](./TODO.md): rate limiting, structured logging, token refresh on reconnect, URL validation
- API additions before 1.0 will be additive; breaking changes will go through a deprecation cycle

## License

MIT — see [LICENSE](./LICENSE).

<div align="center">
<sub>Part of the <b>@gertsai</b> shared toolkit. Tier 1 — no internal dependencies.</sub>
</div>
