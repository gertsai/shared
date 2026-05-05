# @gertsai/session

Backend-agnostic `Session` class with operator + data-access identity scoping.

Mirrors the Orchestra `OrchestraSession` lifecycle 1:1 with all Vue
(`@vue/runtime-core`) and Orchestra-DI (`@orchlab/di`) dependencies stripped
per ADR-005. Per PRD-002 FR-W4-004..006.

## Install

```bash
pnpm add @gertsai/session
```

## Usage

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
- `session.$switchOperator({ _uid, type })` — switch identity, emits
  `operator-switched`.
- `session.$setDataAccessUuid(uuid | undefined)` — override / clear scope.
- `session.$destroy()` — idempotent teardown, emits `destroyed`.

## Events

- `operator-switched` — `{ prev, current }` where each is `{ _uid, type }`.
- `destroyed` — fired once on first `$destroy()`.

## License

Apache-2.0
