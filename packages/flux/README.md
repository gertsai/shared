<div align="center">

# @gertsai/flux

### High-performance data streams, event-driven collections, reactive flows

A **TypeScript reactive runtime** for building data pipelines, real-time caches, and event buses.
Backpressure-aware streams, TTL collections, priority events, and pluggable adapters — all strictly typed.

<br>

[![License: MIT](https://img.shields.io/badge/license-MIT-000.svg?style=flat-square)](LICENSE)
[![Tier](https://img.shields.io/badge/tier-2-orange?style=flat-square)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square)](https://nodejs.org/)

</div>

---

<div align="center">

```
   ┌────────┐    ┌─────────┐    ┌──────────┐    ┌────────┐    ┌─────────┐
   │ INGEST │ ─▶ │ STREAM  │ ─▶ │ TRANSFORM│ ─▶ │ EMIT   │ ─▶ │ CONSUME │
   └────────┘    └─────────┘    └──────────┘    └────────┘    └─────────┘
    write()      backpressure   .pipe(fn)      priority       on('data')
```

**Every chunk has backpressure. Every event has priority. Every collection has TTL.**

</div>

---

## Why @gertsai/flux

<table>
<tr>
<td width="50%">

### Without flux
- Hand-rolled `Map` + `setTimeout` for caches
- `EventEmitter` from Node, no priorities, no async
- Streams that overflow when consumers are slow
- Adapters wired manually, no DI
- Type guesswork on event payloads

</td>
<td width="50%">

### With flux
- `FluxilisCollection` with TTL, set ops, events
- `FluxilisEventEmitter` with priority + `emitAsync`
- `DataStream` with `highWaterMark` and `drain`
- `ComponentFactory` for backends and serializers
- Strict generics on every emit and pipe

</td>
</tr>
</table>

## Install

```bash
pnpm add @gertsai/flux
# peer: typescript >= 5.0, node >= 18
```

Tier 2 in the Gerts AI stack — depends on `@gertsai/collection`.

## Quickstart

### DataStream pipeline with backpressure

```typescript
import { DataStream } from '@gertsai/flux';

const stream = new DataStream<number>({ highWaterMark: 100, errorMode: 'emit' });

const out = stream
  .pipe((n) => n * 2)
  .pipe(async (n) => `value:${n}`);

out.on('data', console.log);
out.on('error', (err) => console.error(err));

if (!stream.write(5)) {
  await new Promise<void>((r) => stream.once('drain', r));
}
stream.end();
```

### Priority event emitter with TTL collection

```typescript
import { FluxilisCollection, FluxilisEventEmitter } from '@gertsai/flux';

const cache = new FluxilisCollection<string, { name: string }>();
cache.on('delete', (key) => console.log(`expired: ${key}`));
cache.setWithTTL('session-123', { name: 'Alice' }, 3_600_000);

const bus = new FluxilisEventEmitter({ asyncListeners: true });
bus.on('request', auth, { priority: 100 });   // runs first
bus.on('request', log, { priority: 50 });
bus.on('request', handle, { priority: 0 });   // runs last
await bus.emitAsync('request', { path: '/api/users' });
```

## What you get

| Capability | What it does |
|---|---|
| **Streaming** | `DataStream` with `highWaterMark`, `drain`, `pause`/`resume`, sync + async `.pipe()` chains, three error modes (`throw` \| `emit` \| `ignore`). |
| **Reactive collections** | `FluxilisCollection` — Map-like, with TTL, set ops (union/intersection/difference), `groupBy`/`partition`, `setMany`/`getMany`, fired events: `add` \| `update` \| `delete` \| `clear`. |
| **Event emitter** | `FluxilisEventEmitter` with numeric priorities, `emitAsync`, configurable `maxListeners`, optional async error capture. |
| **Component factory** | DI container — register/resolve `IBackend`, `ISerializer`, `IEventEmitter` by name. Pre-registered: `'map'`, `'json'`. |
| **Adapters** | `MapBackend` (in-memory) and `JsonSerializer` ship out-of-box. Implement `IBackend` / `ISerializer` for Redis, MsgPack, etc. |
| **Type safety** | Generic over key/value, narrowed event maps (`CollectionEventMap`), `FluxilisKey = string \| number`. |
| **Utilities** | `debounce`, `throttle`, `deepClone`, `createDeferred`, `safeAsync`, `isPromise`, `generateId`. |

## API surface

### Streams

```typescript
import { DataStream, type DataStreamOptions, type DataTransformer } from '@gertsai/flux';

const s = new DataStream<T>({ highWaterMark: 1000, errorMode: 'emit', autoEnd: false });
s.write(chunk);                // → boolean (false = backpressure)
s.pipe<U>(fn: DataTransformer<T, U>); // → DataStream<U>
s.pause(); s.resume(); s.end(); s.close();
s.isPaused(); s.isEnded();
// events: 'data' | 'end' | 'error' | 'drain' | 'pause' | 'resume' | 'close'
```

### Collections

```typescript
import { FluxilisCollection, type FluxilisCollectionOptions } from '@gertsai/flux';

const c = new FluxilisCollection<K, V>(entries?, { cloneValues: false });

// CRUD
c.set / c.get(key, default?) / c.has / c.delete(key | key[]) / c.clear
c.setMany / c.getMany / c.setIfAbsent / c.update / c.ensure(key, factory)
c.setWithTTL(key, value, ms)

// Functional
c.map / c.filter / c.reduce / c.find / c.findKey / c.some / c.every / c.forEach / c.each / c.sweep

// Set ops
c.union / c.intersection / c.difference / c.symmetricDifference / c.merge

// Positional
c.first(n?) / c.last(n?) / c.at(i) / c.keyAt(i) / c.random(n?) / c.randomKey()

// Grouping
c.groupBy(fn) / c.partition(fn)

// Conversion
c.clone / c.toArray / c.keysArray / c.entriesArray / c.toObject / c.equals / c.hasAll / c.hasAny

// Events: 'add' | 'update' | 'delete' | 'clear' (typed via CollectionEventMap)
c.on / c.once / c.off
```

### Events

```typescript
import { FluxilisEventEmitter, type IFluxilisEventEmitter } from '@gertsai/flux';

const e = new FluxilisEventEmitter({ maxListeners: 10, asyncListeners: false });
e.on(name, fn, { priority: 0 });    // higher priority runs first
e.once(name, fn) / e.off(name, fn);
e.emit(name, ...args);              // → boolean
await e.emitAsync(name, ...args);   // awaits all listeners
e.listenerCount / e.listeners / e.eventNames / e.removeAllListeners / e.setMaxListeners
```

### DI and adapters

```typescript
import {
  ComponentFactory, componentFactory,
  MapBackend, JsonSerializer,
  type IBackend, type ISerializer,
} from '@gertsai/flux';

componentFactory.getBackend('map');                 // pre-registered
componentFactory.getSerializer('json');
componentFactory.registerBackend('redis', RedisBackend);
const f = new ComponentFactory();                   // or roll your own
```

### Utilities

```typescript
import {
  debounce, throttle, deepClone,
  createDeferred, safeAsync, isPromise, generateId,
} from '@gertsai/flux';
```

Full type exports: `FluxilisKey`, `IDataStream`, `DataStreamOptions`, `IFluxilisEventEmitter`,
`CollectionEventMap`, `CollectionEventName`, `ICollectionBackend`, `ISerializer`, `IEventEmitter`,
`IStreamAdapter`, plus re-exports `ReadableCollection`, `WritableCollection` from `@gertsai/collection`.

## Performance

Practical guidelines from the implementation:

| Concern | Guidance |
|---|---|
| **TTL timers** | Each `setWithTTL` schedules a timer. For thousands of short-lived keys, prefer periodic `sweep()` over per-key timers. |
| **Backpressure** | Always check `stream.write()` return value; await `'drain'` before resuming writes. Ignoring this leaks memory. |
| **Clone on read** | `cloneValues: true` adds a `deepClone` per `get()`. Enable only when callers mutate retrieved values. |
| **Listener leaks** | Remove listeners explicitly or use `once()`. `maxListeners` warns past the threshold (default 10). |
| **Bulk ops** | Use `setMany`/`getMany` rather than loops — single event emit, less overhead. |
| **Bundle size** | ~15 KB minified (vs ~50 KB for RxJS, ~5 KB for discord.js Collection). |

## Status

- Version: `0.1.0`
- Tier: 2 (depends on `@gertsai/collection`)
- Node: `>= 18`
- TypeScript: `>= 5.0`
- Tests: `vitest run`
- Build: `tsc --build`

## License

MIT
