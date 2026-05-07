# @gertsai/async-utils

[![npm version](https://img.shields.io/npm/v/@gertsai/async-utils.svg)](https://www.npmjs.com/package/@gertsai/async-utils)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Tier 1 zero-dep async utilities for the `@gertsai/*` ecosystem. Extracted from
Orchestra (Sprint 3.9, Wave 5 Phase 4). Pure functions, no peer dependencies.

API: `sleep`, `withTimeout`, `defer`, `debounce`, `throttle`, `retry`,
`makeCancellable`.

## Install

```bash
pnpm add @gertsai/async-utils
# or
npm install @gertsai/async-utils
# or
yarn add @gertsai/async-utils
```

No peer dependencies — Tier 1 zero-dep policy per ADR-009 invariant I-1.

## Quickstart

```typescript
import { sleep, withTimeout, retry } from '@gertsai/async-utils';

await sleep(100);
const value = await withTimeout(fetchUser, 5000);
const result = await retry(action, { maxAttempts: 3 });
```

## API

### `sleep(ms: number): Promise<void>`

Resolve after the specified milliseconds.

### `withTimeout<T>(action, timeoutMs, message?): Promise<T>`

Race an async action against a timeout. Throws a standard `Error` (with
`name === 'AbortError'`) if the action exceeds `timeoutMs`. Per ADR-009
invariant I-2, this package never throws `@gertsai/errors` types — consumers
wrap with the errors taxonomy if needed.

```typescript
const user = await withTimeout(() => fetch('/api/user'), 3000, 'User fetch timed out');
```

### `defer<T>(): Deferred<T>`

Create an externally controllable promise.

```typescript
const d = defer<number>();
queue.on('done', (n) => d.resolve(n));
const n = await d.promise;
```

### `debounce(fn, waitMs)` and `throttle(fn, limitMs)`

Both return a wrapped function with `cancel()`. Debounce additionally exposes
`flush()` to invoke immediately if a call is pending.

```typescript
const search = debounce((q: string) => runSearch(q), 200);
input.addEventListener('input', (e) => search(e.target.value));
// later: search.cancel();
```

### `retry<T>(action, opts?): Promise<T>`

Retry an async action with exponential backoff and jitter.

| Option        | Default     | Notes                                                     |
|---------------|-------------|-----------------------------------------------------------|
| `maxAttempts` | `3`         | Total attempts including the first.                       |
| `baseMs`      | `100`       | Base backoff in milliseconds.                             |
| `maxMs`       | `5000`      | Cap on computed delay before jitter.                      |
| `factor`      | `2`         | Exponential growth factor.                                |
| `jitter`      | `'full'`    | `'none' \| 'full' \| 'equal'`. Default `'full'` per CWE-409. |
| `retryable`   | retry-all   | `(error) => boolean`. Predicate to short-circuit.         |
| `onRetry`     | —           | `(attempt, error, delayMs) => void`. Hook for logging.    |
| `signal`      | —           | Optional `AbortSignal` to abort the retry loop.           |

```typescript
const data = await retry(() => http.get('/foo'), {
  maxAttempts: 5,
  retryable: (e) => isTransient(e),
  signal: controller.signal,
});
```

### `makeCancellable(): CancellableSignal`

Thin `AbortController` wrapper exposing `{ signal, cancel(reason?) }`.

```typescript
const { signal, cancel } = makeCancellable();
fetch(url, { signal });
setTimeout(() => cancel('user navigated away'), 5000);
```

## Compatibility

| Requirement | Version |
|---|---|
| Node.js | ≥ 22 LTS |
| TypeScript | ≥ 5.0 (consumer side) |
| Peer dependencies | **none** (zero-dep policy per ADR-009 I-1) |

## Security & Caveats

- **`withTimeout` listener cleanup (CWE-401, ADR-009 I-16)**: uses an internal
  `AbortController` and clears the timeout in `finally`. Verified to not leak
  listeners across 1000+ invocations.
- **`retry` default `jitter: 'full'` (CWE-409)**: randomizes backoff in
  `[0, computedDelay]` for thundering-herd protection. If you opt into
  `jitter: 'none'`, multiple clients retrying simultaneously may synchronize
  and overload upstreams. Use `'none'` only when intentional.
- **`retry` honors `AbortSignal`**: aborted between attempts → throws
  `Error('Retry aborted')`. The action itself is not auto-aborted; pass the
  same signal into your action if needed.
- **Standard `Error` (NOT `AppError`, ADR-009 I-2)**: `withTimeout` throws a
  plain `Error` so this package stays zero-dep. Wrap with `@gertsai/errors`
  if you need the canonical `TimeoutError` taxonomy.
- **`debounce` / `throttle` cleanup**: always call `cancel()` on unmount to
  release pending timers.

## Cross-references

- [ADR-009 — Wave 5 Phase 4 extraction](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-009-wave-5-phase-4-orchestra-high-candidates-extraction-async-utils-logger-factory-rpc-proxy-builder-rest-request-manager.md)
- [PRD-003 — Wave 5 errors / runtime-context / framework adapters](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)

## License

Apache-2.0 — see [LICENSE](./LICENSE).
