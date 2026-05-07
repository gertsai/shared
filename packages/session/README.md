# @gertsai/session

Backend-agnostic `Session` class with operator + data-access identity scoping.

Mirrors the Orchestra `OrchestraSession` lifecycle 1:1 with all Vue
(`@vue/runtime-core`) and Orchestra-DI (`@orchlab/di`) dependencies stripped
per ADR-005. Per PRD-002 FR-W4-004..006.

## Install

```bash
pnpm add @gertsai/session
```

## Quickstart

```ts
import { Session, SESSION_EVENTS } from '@gertsai/session';

const session = new Session({
  operatorUuid: 'user-123',
  operatorType: 'web',
  tokenGetter: async () => fetchAccessToken(),
  dialog: {
    confirm: async (msg) => window.confirm(msg),
    alert: (msg) => window.alert(msg),
    error: (err) => console.error(err),
  },
  clientPlatform: 'web',
  clientVersion: '1.0.0',
});

const token = await session.token;

session.on(SESSION_EVENTS.OPERATOR_SWITCHED, ({ prev, current }) => {
  console.log('Operator changed:', prev, '→', current);
});

// AI agent acting on behalf of human user — load user's data, mutate as bot:
session.$setDataAccessUuid('human-user-7');
console.log(session.isOperatorScopeOverridden); // true
```

## Token refresh flow

`tokenGetter` is intentionally async so consumers can transparently fold
caching and refresh logic into a single hook. The Session itself never
caches the token — every `await session.token` calls through.

```ts
const session = new Session({
  operatorUuid: 'user-1',
  operatorType: 'web',
  tokenGetter: async () => {
    const cached = getCachedToken();
    if (cached && !isExpired(cached)) return cached.value;
    const fresh = await refreshAccessToken();
    setCachedToken(fresh);
    return fresh.value;
  },
  dialog: myDialog,
  clientPlatform: 'web',
  clientVersion: '1.0.0',
});

// Consumer usage with retry-on-401:
async function authedFetch(url: string): Promise<Response> {
  let token = await session.token;
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    // tokenGetter caches; force refresh by clearing cache externally then retry.
    invalidateCachedToken();
    token = await session.token;
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return res;
}
```

## Error handling via `errorHandler`

`errorHandler` is a side-channel for non-fatal errors that Session-aware code
discovers but does not want to throw. The default handler swallows; injecting
one lets you surface those errors to telemetry without disturbing happy-path
control flow. Consumers can also call it directly to centralise reporting.

```ts
const session = new Session({
  operatorUuid: 'user-1',
  operatorType: 'web',
  tokenGetter: async () => fetchAccessToken(),
  dialog: myDialog,
  clientPlatform: 'web',
  clientVersion: '1.0.0',
  errorHandler: (err) => {
    // Surface non-fatal errors to telemetry without throwing.
    logger.warn({ err }, 'session error');
    metrics.increment('session.errors');
  },
});

// Consumers can call errorHandler directly:
try {
  await riskyOperation();
} catch (e) {
  session.errorHandler(e);
}
```

## `$destroy` lifecycle

`$destroy()` is idempotent: only the first call emits `'destroyed'` and
removes listeners. Subsequent operator-touching operations throw, and
`session.token` rejects — stale callers fail loudly rather than silently
operating against a torn-down identity.

```ts
// Bind cleanup to user logout:
function logout() {
  session.$destroy(); // Emits 'destroyed', removes all listeners.
}

// Detect destruction in long-running consumers:
session.on(SESSION_EVENTS.DESTROYED, () => {
  // Clean up subscriptions tied to session lifetime.
  unsubscribeAll();
});

// Subsequent operations fail loudly:
await session.token; // Promise.reject(new Error('Session destroyed'))
session.$switchOperator({ _uid: 'x', type: 'web' }); // throws
session.$setDataAccessUuid('y'); // throws
```

## Tenant / project / space scoping

Session optionally carries multi-tenant scope tags for downstream consumers
(per Sprint 3.6 Wave 5 Phase 1, ADR-006 Decision C). Three optional fields —
`tenantId`, `projectId`, `spaceId` — are flat tags with no enforced hierarchy
(I-17). Hierarchy enforcement, if needed, lives in Sprint 3.7 RuntimeContext
middleware as opt-in.

```ts
const session = new Session({
  operatorUuid: 'user-123',
  operatorType: 'web',
  tokenGetter: async () => fetchAccessToken(),
  dialog: myDialog,
  clientPlatform: 'web',
  clientVersion: '1.0.0',
  // Sprint 3.6 additive scope fields — all optional:
  tenantId: 'tenant-acme',
  projectId: 'proj-42',
  spaceId: 'space-q1',
});

// Read-only getters return string | undefined.
session.tenantId; // 'tenant-acme'
session.projectId; // 'proj-42'
session.spaceId; // 'space-q1'
```

### Strict helpers — auth vs validation boundary

Three `*Strict()` helpers throw appropriately-typed errors from
`@gertsai/errors` when the corresponding scope is missing (ADR-006 I-16):

- `session.getTenantStrict()` — throws `UnauthorizedError` when `tenantId`
  is unset. Multi-tenancy is an **authentication boundary**.
- `session.getProjectStrict()` — throws `ValidationError` when `projectId`
  is unset. Project absence is **invalid input**, not unauthenticated.
- `session.getSpaceStrict()` — throws `ValidationError` when `spaceId` is
  unset. Same semantics as project.

```ts
import { UnauthorizedError, ValidationError } from '@gertsai/errors';

try {
  const tenant = session.getTenantStrict();
  // ... multi-tenant database query scoped to `tenant`
} catch (err) {
  if (err instanceof UnauthorizedError) {
    return res.status(401).json({ error: 'authentication required' });
  }
  throw err;
}

try {
  const project = session.getProjectStrict();
} catch (err) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: 'projectId scope is required' });
  }
  throw err;
}
```

### Flat tags, no enforced hierarchy

The scope fields are intentionally **flat tags** — orphan-scope states are
valid:

```ts
// ✅ tenantId without projectId — valid (cross-project tenant operation).
new Session({ ...opts, tenantId: 'acme' });

// ✅ spaceId without projectId or tenantId — valid (system spaces).
new Session({ ...opts, spaceId: 'system-shared' });
```

For consumers that DO need `space ⊂ project ⊂ tenant` invariants, opt in via
Sprint 3.7 RuntimeContext middleware (TBD) — Session itself stays neutral.

### Peer dependency on `@gertsai/errors`

`*Strict()` helpers throw error classes from `@gertsai/errors`. The package
declares `@gertsai/errors` as a peer dependency:

```jsonc
// package.json
{
  "peerDependencies": {
    "@gertsai/errors": "workspace:^"
  }
}
```

Consumers that never call `*Strict()` helpers technically don't need the
peer at runtime, but it is recommended to install for ecosystem consistency
(error taxonomy is a Shared Kernel per ADR-006 Amendment 1.1.3).

## Migrating from `OrchestraSession`

Breaking deltas relative to Orchestra's `OrchestraSession`:

- **`tokenGetter` is async.** Was sync `() => string`, now `() => Promise<string>`.
  Wrap existing sync getters: `tokenGetter: async () => syncTokenFn()`.
- **`errorHandler` arity 1.** Was `(error, entity) => void`, now `(error) => void`.
  Use `Error.cause` or a wrapper class to carry entity context if needed.
- **`dialog.confirm` simplified.** Was `confirm({ action, handler, data })` with
  the handler invoked on confirmation; now `confirm(message: string): Promise<boolean>`.
  Migrate handler-on-confirm patterns to explicit `await session.dialog.confirm(msg)`
  + branching at the call-site.
- **`operatorUuid: string` only.** Was `string | ComputedRef<string>` to allow
  Vue reactivity. Vue consumers wrap externally with their own `computed()`.
- **`dataAccessUuid` is method-driven.** No setter; use
  `session.$setDataAccessUuid(uuid | undefined)` to mutate (consistent with
  the `$`-prefixed mutator convention).
- **`'destroy'` event renamed `'destroyed'`** for past-participle consistency
  with `'operator-switched'`. Constants in `SESSION_EVENTS`.
- **`'operator-switched'` event is new.** Orchestra's session was silent on
  operator switches; consumers now receive `{ prev, current }`.

## API

- `new Session(opts: SessionOpts)` — construct with operator identity, token
  getter, dialog, client platform, and optional `errorHandler` /
  `dataAccessUuid`.
- `session.token` — `Promise<string>` resolved via `tokenGetter`.
- `session.operatorUuid` / `operatorType` / `clientPlatform` /
  `clientVersion` / `dialog` / `errorHandler` — read-only accessors.
- `session.dataAccessUuid` — falls back to `operatorUuid` when not
  overridden.
- `session.isOperatorScopeOverridden` — `true` iff `dataAccessUuid` differs
  from `operatorUuid`.
- `session.destroyed` — `true` after `$destroy()` has been called.
- `session.$switchOperator({ _uid, type })` — switch identity, emits
  `operator-switched`.
- `session.$setDataAccessUuid(uuid | undefined)` — override / clear scope.
- `session.$destroy()` — idempotent teardown, emits `destroyed`.
- `session.tenantId` / `projectId` / `spaceId` — optional flat scope tags
  (`string | undefined`).
- `session.getTenantStrict()` — returns `tenantId` or throws
  `UnauthorizedError` (`@gertsai/errors`).
- `session.getProjectStrict()` / `getSpaceStrict()` — return value or throw
  `ValidationError`.

## Events

- `operator-switched` — `{ prev, current }` where each is `{ _uid, type }`.
- `destroyed` — fired once on first `$destroy()`.

Constants are exposed via `SESSION_EVENTS.OPERATOR_SWITCHED` /
`SESSION_EVENTS.DESTROYED` so subscriptions stay strongly typed.

## OperatorType reference

The 25-value `OperatorType` union spans five categories. Pick the closest
fit; consumers needing a value not on the list can extend via TypeScript
declaration merging.

| Category | Value | When to use |
|---|---|---|
| Human surfaces | `web` | Browser-based web app (default for SPAs / SSR clients). |
| Human surfaces | `ios` | Native iOS app. |
| Human surfaces | `android` | Native Android app. |
| Human surfaces | `electron` | Electron desktop wrapper. |
| Human surfaces | `desktop` | Native desktop binary (non-Electron). |
| Human surfaces | `cli` | Command-line tool driven by a human operator. |
| Human surfaces | `tui` | Terminal UI (interactive curses-style client). |
| Human surfaces | `extension` | Browser extension (Chrome / Firefox / etc). |
| Programmatic | `api` | Generic third-party API client. |
| Programmatic | `sdk` | First-party SDK / library consumer. |
| Programmatic | `webhook` | Inbound webhook delivery. |
| Programmatic | `cron` | Scheduled / periodic job runner. |
| Programmatic | `service` | Internal service-to-service request. |
| Programmatic | `auth` | Auth-service callers (token issuance, refresh, revocation). |
| Agent / automation | `ai` | AI runtime making autonomous calls. |
| Agent / automation | `agent` | Generic autonomous agent (non-AI-specific). |
| Agent / automation | `assistant` | Human-supervised assistant (copilot-style). |
| Agent / automation | `bot` | Chat bot or automation script. |
| Protocol bridges | `mcp` | Model Context Protocol bridge. |
| Protocol bridges | `grpc` | gRPC client. |
| Protocol bridges | `graphql` | GraphQL client. |
| System / internal | `system` | System-initiated request (not user-driven). |
| System / internal | `migration` | One-shot data migration. |
| System / internal | `test` | Test runner / fixture harness. |
| System / internal | `unknown` | Origin not yet classified — avoid in production code. |

## License

Apache-2.0
