# @gerts/ws-rpc

WebSocket JSON-RPC 2.0 client with auto-reconnect and topic-based subscriptions.

## Installation

```bash
pnpm add @gerts/ws-rpc
```

## Features

- **JSON-RPC 2.0** — Full protocol support (requests, responses, notifications)
- **Auto-reconnect** — Exponential backoff with configurable limits
- **Subscriptions** — Topic-based with wildcard support (`user.*`, `**`)
- **Message queuing** — Queues messages when disconnected
- **Heartbeat** — Built-in ping/pong support
- **TypeScript** — Full type safety
- **Cross-platform** — Works in browser and Node.js

> **Note:** See [TODO.md](./TODO.md) for pending security hardening tasks before production use.

## Quick Start

```typescript
import { WsRpcClient } from '@gerts/ws-rpc';

const client = new WsRpcClient({
  url: 'ws://localhost:3023/ws',
  reconnect: { maxAttempts: 5, delay: 1000 },
});

await client.connect();

// RPC call with typed response
const result = await client.call<{ answer: string }>('graph.query', {
  question: 'What is NeuraTech?',
  tenantId: 'demo',
});
console.log(result.answer);

// Subscribe to events
const unsubscribe = client.subscribe('ingest.progress', (event) => {
  console.log(`Progress: ${event.progress}%`);
});

// Subscribe with wildcard
client.subscribe('user.*', (event) => {
  console.log('User event:', event);
});

// Cleanup
unsubscribe();
client.disconnect();
```

## Configuration

```typescript
const client = new WsRpcClient({
  // Required
  url: 'ws://localhost:3023/ws',

  // Optional
  protocols: 'json-rpc',         // WebSocket sub-protocol
  timeout: 30000,                // Request timeout (ms)
  heartbeatInterval: 30000,      // Heartbeat interval (ms, 0 to disable)
  maxQueueSize: 100,             // Max queued messages when disconnected
  headers: { 'X-API-Key': '...' }, // Custom headers (Node.js only)

  // Reconnection
  reconnect: {
    enabled: true,               // Enable auto-reconnect
    maxAttempts: 5,              // Max retry attempts
    delay: 1000,                 // Initial delay (ms)
    maxDelay: 30000,             // Max delay (ms)
    factor: 2,                   // Backoff multiplier
    jitter: true,                // Add randomness to delay
  },
});
```

## API Reference

### WsRpcClient

#### `connect(): Promise<void>`

Connect to WebSocket server.

```typescript
await client.connect();
```

#### `disconnect(code?: number, reason?: string): void`

Disconnect from server.

```typescript
client.disconnect(1000, 'Normal closure');
```

#### `call<TResult, TParams>(method: string, params?: TParams): Promise<TResult>`

Make JSON-RPC call and wait for response.

```typescript
const result = await client.call<User>('user.get', { id: '123' });
```

#### `notify<TParams>(method: string, params?: TParams): void`

Send notification (no response expected).

```typescript
client.notify('analytics.track', { event: 'page_view' });
```

#### `subscribe<T>(topic: string, callback: (data: T) => void): () => void`

Subscribe to server events. Returns unsubscribe function.

```typescript
// Exact topic
const unsub = client.subscribe('user.created', (user) => {
  console.log('New user:', user);
});

// Wildcard (single segment)
client.subscribe('user.*', (event) => {
  // Matches: user.created, user.updated, user.deleted
});

// Wildcard (multiple segments)
client.subscribe('api.**', (event) => {
  // Matches: api.request, api.users.get, api.orders.create
});

unsub(); // Unsubscribe
```

### Events

```typescript
client.on('open', () => {
  console.log('Connected');
});

client.on('close', (code, reason) => {
  console.log(`Disconnected: ${code} ${reason}`);
});

client.on('error', (error) => {
  console.error('Error:', error);
});

client.on('reconnecting', (attempt, delay) => {
  console.log(`Reconnecting in ${delay}ms (attempt ${attempt})`);
});

client.on('reconnected', () => {
  console.log('Reconnected!');
});

client.on('notification', (method, params) => {
  console.log(`Notification: ${method}`, params);
});

client.on('message', (data) => {
  console.log('Raw message:', data);
});
```

### Utility Methods

```typescript
client.isConnected();         // boolean
client.getState();            // 'connecting' | 'open' | 'closing' | 'closed'
client.getPendingCount();     // Number of pending requests
client.getQueueSize();        // Number of queued messages
client.getSubscriptionCount(); // Number of active subscriptions
```

## Error Handling

```typescript
import { RpcError, RpcTimeoutError, ConnectionError } from '@gerts/ws-rpc';

try {
  await client.call('some.method');
} catch (error) {
  if (error instanceof RpcError) {
    console.log(`RPC Error: ${error.code} - ${error.message}`);
    console.log('Data:', error.data);
  }

  if (error instanceof RpcTimeoutError) {
    console.log(`Timeout calling ${error.method} after ${error.timeout}ms`);
  }

  if (error instanceof ConnectionError) {
    console.log('Connection error:', error.message);
  }
}
```

### Standard JSON-RPC Error Codes

```typescript
import { JsonRpcErrorCode } from '@gerts/ws-rpc';

JsonRpcErrorCode.PARSE_ERROR      // -32700
JsonRpcErrorCode.INVALID_REQUEST  // -32600
JsonRpcErrorCode.METHOD_NOT_FOUND // -32601
JsonRpcErrorCode.INVALID_PARAMS   // -32602
JsonRpcErrorCode.INTERNAL_ERROR   // -32603
```

## Type Guards

```typescript
import {
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcSuccessResponse,
  isJsonRpcErrorResponse,
} from '@gerts/ws-rpc';

const message = JSON.parse(data);

if (isJsonRpcRequest(message)) {
  console.log('Request:', message.method);
}

if (isJsonRpcNotification(message)) {
  console.log('Notification:', message.method);
}

if (isJsonRpcResponse(message)) {
  if (isJsonRpcSuccessResponse(message)) {
    console.log('Success:', message.result);
  } else {
    console.log('Error:', message.error);
  }
}
```

## Standalone Utilities

### ReconnectStrategy

```typescript
import { ReconnectStrategy } from '@gerts/ws-rpc';

const strategy = new ReconnectStrategy({
  maxAttempts: 5,
  delay: 1000,
  maxDelay: 30000,
  factor: 2,
  jitter: true,
});

while (strategy.shouldReconnect()) {
  const delay = strategy.getDelay();
  await sleep(delay);
  strategy.recordAttempt();

  try {
    await connect();
    strategy.reset(); // Success - reset counter
    break;
  } catch (error) {
    continue;
  }
}
```

### SubscriptionManager

```typescript
import { SubscriptionManager } from '@gerts/ws-rpc';

const manager = new SubscriptionManager();

const id = manager.subscribe('topic', (data) => {
  console.log(data);
});

manager.dispatch('topic', { message: 'Hello' });

manager.unsubscribe(id);
```

## Integration with @gerts/api-types

```typescript
import { WsRpcClient } from '@gerts/ws-rpc';
import type { PipelineEvent, isIngestEvent } from '@gerts/api-types';

const client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

client.subscribe<PipelineEvent>('pipeline.*', (event) => {
  if (isIngestEvent(event)) {
    console.log(`Ingest ${event.type}: ${event.jobId}`);
  }
});
```

## Package Structure

```
src/
├── types.ts          # JSON-RPC 2.0 types, errors, type guards
├── client.ts         # WsRpcClient class
├── reconnect.ts      # ReconnectStrategy
├── subscription.ts   # SubscriptionManager
└── index.ts          # Exports
```

## References

Based on patterns from:
- [Gong WebSocketManager](../../sources/orchestra/gong/) — Connection, reconnect, heartbeat
- [JSON-RPC 2.0 Spec](https://www.jsonrpc.org/specification) — Protocol types

## License

MIT
