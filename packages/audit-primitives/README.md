# @gertsai/audit-primitives

Pure backend-agnostic audit primitives for the `@gertsai/*` ecosystem —
[ADR-007](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-007-runtime-context-session-guard-audit-primitives-extraction-policy.md)
Decision C + invariants I-7 (zero internal deps), I-14 (TimestampProvider
shape parity with `entity-audit`). The package exposes the canonical
`Timestamp` shape, generic `AuditMarks`, the `TimestampProvider`
call-signature alias, and a small set of conversion helpers. It carries
**no internal dependencies** so any storage backend (Postgres, Firestore,
DynamoDB, in-memory) can consume it without pulling the session-bound
`MutationMarks` builders that live in `@gertsai/entity-audit`.

## Install

```bash
pnpm add @gertsai/audit-primitives
```

## Quickstart

```ts
import {
  type Timestamp,
  type AuditMarks,
  type TimestampProvider,
  dateTimestampProvider,
  fixedTimestampProvider,
  timestampToMillis,
  timestampFromDate,
  timestampFromMillis,
  timestampCompare,
} from '@gertsai/audit-primitives';

// Inject a clock (production = wall-clock, tests = pinned).
const now: TimestampProvider = process.env.NODE_ENV === 'test'
  ? fixedTimestampProvider({ seconds: 1_700_000_000, nanoseconds: 0 })
  : dateTimestampProvider;

// Build minimal audit marks for a record.
const marks: AuditMarks = {
  created_at: now(),
  updated_at: now(),
};

// Adapter side: convert to wire format / SQL TIMESTAMPTZ.
const ms: number = timestampToMillis(marks.created_at);
const fromDate: Timestamp = timestampFromDate(new Date());
const fromMs: Timestamp = timestampFromMillis(Date.now());

// Total ordering for sort / dedupe / replay.
[marks.created_at, marks.updated_at].sort(timestampCompare);
```

## API

| Export | Kind | Purpose |
|---|---|---|
| `Timestamp` | type | Backend-agnostic `{ seconds, nanoseconds }` shape (Firestore-compatible) |
| `AuditMarks` | type | `created_at` + `updated_at` + optional `deleted_at` (no session fields) |
| `TimestampProvider` | type | Call-signature alias `() => Timestamp` (per ADR-007 Amendment 1.1.3) |
| `dateTimestampProvider` | const | Default provider — wraps `Date.now()` (ms-resolution) |
| `fixedTimestampProvider(ts)` | function | Test fixture — returns the same `Timestamp` on every call |
| `timestampToMillis(ts)` | function | Convert to integer millis-since-epoch |
| `timestampFromDate(d)` | function | Build from a JS `Date` |
| `timestampFromMillis(ms)` | function | Build from millis-since-epoch |
| `timestampCompare(a, b)` | function | Total ordering: returns `-1` / `0` / `1` |

## Backend-agnostic notes

- **Firestore mapping** — the `{ seconds, nanoseconds }` shape is
  on-the-wire compatible with Firestore / protobuf / gRPC `Timestamp`,
  so round-trips through those transports are lossless. This package
  carries **no runtime dependency** on Firestore SDKs.
- **SQL `TIMESTAMPTZ` mapping** — convert with `timestampToMillis()` and
  pass the integer millis to the adapter. Postgres example:
  `SELECT to_timestamp($1::double precision / 1000)`. The reverse path
  (`timestampFromMillis`) recovers a `Timestamp` from the wire-format
  millis the driver returns.
- **Replay-attack note (P2-2)** — `dateTimestampProvider` is a
  ms-resolution wall-clock source. It is **not** a monotonic clock and
  must not be used as a freshness primitive against attacker-controlled
  request timestamps. For replay-resistant audit (idempotency keys,
  nonces, anti-replay windows) layer a separate freshness check on top.
  Sub-millisecond precision is always 0; do not assume nanosecond
  uniqueness when correlating events on the same machine.

## Cross-references

- [ADR-007 — runtime-context / session-guard / audit-primitives extraction
  policy](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-007-runtime-context-session-guard-audit-primitives-extraction-policy.md)
  (Decision C, invariants I-7 / I-14, Amendment 1.1.3)
- [PRD-003 — Wave 5 foundation](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)
- For session-bound audit (creator_uuid, `*_by_platform`, lifecycle
  builders `buildDataForSet` / `buildDataForUpdate` /
  `buildDataForDelete` / `buildDataForRestore`), see
  [`@gertsai/entity-audit`](../entity-audit/README.md). That package
  re-exports `Timestamp` / `TimestampProvider` from here so a single
  shape circulates through both layers.

## License

Apache-2.0. The `LICENSE` file is a symlink to the repository root.
