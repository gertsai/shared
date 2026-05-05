# @gertsai/entity-audit

Audit trail types and builder functions for backend-agnostic entity mutation tracking.

Provides:

- `MutationMarks` — created/updated/deleted timestamps + operator uuid + platform.
- `UpdateAction` + `UpdateActionMap` — extensible (via module augmentation) catalogue
  of business-meaningful update actions.
- `buildDataForSet` / `buildDataForUpdate` / `buildDataForDelete` / `buildDataForRestore`
  — pure builder functions stamped with the `Session` operator identity.
- `Timestamp` — generic `{ seconds, nanoseconds }` shape (replaces Firelord
  `ServerTimestamp`); pluggable `TimestampProvider` for deterministic tests.

Mirrors Orchestra `orchlab/core/src/meta.ts` patterns 1:1 with all
Firestore / Firelord couplings stripped per ADR-005.

## Install

```sh
pnpm add @gertsai/entity-audit
```

Peer: `@gertsai/session` (provides the `Session` operator identity passed
to every builder).

## Usage

```ts
import { Session } from '@gertsai/session';
import {
  buildDataForSet,
  buildDataForUpdate,
  buildDataForDelete,
  buildDataForRestore,
} from '@gertsai/entity-audit';

const created = buildDataForSet({ name: 'Alice' }, session);
const patch = buildDataForUpdate({ name: 'Bob' }, session);
const tomb = buildDataForDelete(session);
const live = buildDataForRestore(session);
```

### Custom timestamp source

```ts
const fixedProvider = () => ({ seconds: 1700000000, nanoseconds: 0 });
const created = buildDataForSet(data, session, { timestampProvider: fixedProvider });
```

### Extending the action catalogue

```ts
declare module '@gertsai/entity-audit' {
  interface UpdateActionMap {
    invite_sent: { type: 'invite_sent'; params: { email: string } };
  }
}
```

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
