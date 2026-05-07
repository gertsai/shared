---
depth: standard
id: SPEC-007
kind: spec
last_modified_at: 2026-05-05T21:26:26.789955+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-002
  relation: based_on
- target: ADR-005
  relation: based_on
- target: ADR-004
  relation: refines
status: active
title: Sprint 3.4 — Wave 4A entity/session/entity-audit/di-enhancement (4 packages per ADR-005)
---

# SPEC-007: Sprint 3.4 — Wave 4A foundation extraction

## Summary

Implementation checklist для Sprint 3.4 (Wave 4A) per PRD-002 + ADR-005. 4 new Tier 1-2 packages mirroring Orchestra patterns (orchlab/core, orchlab/di) с строгим stripping backend/framework coupling. AgentTeams 3∥ workers + 1 sequential. Result: monorepo grows 19 → 23.

## Scope

### W-4A-1: `@gertsai/entity` (Tier 1, **F**)

**Source mirror**: `/Users/explosovebit/Work/Orchestra/orchdev/orchestra/orchlab/core/src/{Entity,OrchestraEntity,OrchestraModel,types}.ts`

**Extract**:
- `Model` (was OrchestraModel) — base class: EventEmitter integration, `_session` reference, `$operatorUuid` getter, `$destroy()` lifecycle.
- `Entity<Data>` — extends Model: `_data` reactive, `_uid` (UuidProvider injectable), `$patch(partial)` mutation API, `$defaultData()` abstract.
- `EntityWithMetadata<Data, Metadata, Typename>` (was OrchestraEntity) — extends Entity: `$metadata`, `$isMockup`, `$isStaled`, `$markStaled()`, `$setMetadata()`, `__typename` для discriminated unions.
- `WithTypename<T, Name>` type helper.

**Replace per ADR-005 Decision B**:
- `@vue/runtime-core shallowReactive` → pluggable `ReactiveAdapter` interface; default plain-object impl (or Proxy-based shim) в `src/adapters/plain.ts`. Vue adapter в `src/adapters/vue.ts` (subpath `@gertsai/entity/vue`, peer-dep optional).
- `xid-ts` → `UuidProvider` interface; default impl via `crypto.randomUUID()` (Node 18+); user может swap на xid-ts/nanoid через DI.
- `lodash.isequal` → use `@gertsai/utils` `deepEqual` if exists; otherwise vendor compact impl in `src/internal/deep-equal.ts`.
- `markRaw` → custom `markRaw(obj)` symbol-based marker.

**Subpath exports**:
- `.` (root) — Model, Entity, EntityWithMetadata, types.
- `./vue` — Vue reactive adapter (peer-dep `@vue/runtime-core` optional).

**Tests** (≥10): entity lifecycle ($patch + change events), $isMockup mockup→saved transition, $markStaled invalidation, $setMetadata reactivity, $destroy cleanup, EventEmitter listener add/remove, WithTypename discriminated union, default reactive adapter (plain-object), markRaw, deepEqual integration.

**Deps**: `@gertsai/session` (for _session typing), Node `events.EventEmitter`. Peer optional: `@vue/runtime-core` (только в `/vue` subpath).

### W-4A-2: `@gertsai/session` (Tier 1, **F**)

**Source mirror**: `orchlab/core/src/session/OrchestraSession.class.ts` + `session/types.ts`

**Extract**:
- `Session` (was OrchestraSession) — class extending EventEmitter:
  - Constructor params: `operatorUuid`, `operatorType`, `tokenGetter` callback, `dialog: AbstractDialog`, `clientPlatform`, `clientVersion`, `errorHandler`, optional `dataAccessUuid`.
  - Getters: `token` (async via tokenGetter), `operatorUuid`, `operatorType`, `dialog`, `clientPlatform`, `clientVersion`, `errorHandler`, `dataAccessUuid` (returns `dataAccessUuid` OR fallback к `operatorUuid`).
  - `$switchOperator({ _uid, type })` — mutation, fires `'operator-switched'` event.
  - `$destroy()` — cleanup.
- `AbstractDialog` interface (stub-friendly: `confirm(message): Promise<boolean>`, `alert(message): void`, `error(err): void`).
- `OperatorType` enum/union: `'web' | 'ios' | 'android' | 'electron' | 'api' | 'ai' | 'bot' | 'mcp'`.
- `ClientPlatform` type.

**Replace per ADR-005**:
- Vue `shallowReactive` → plain object (session state не нуждается в reactivity для most consumers; UI-side wraps externally).
- Lodash → none used.

**Tests** (≥10): construction with all/minimal params, $switchOperator emits event + updates state, dataAccessUuid fallback к operatorUuid, dataAccessUuid override scenarios (AI agent acting on behalf of user), tokenGetter async, errorHandler invocation, dialog.confirm/alert/error, $destroy emits 'destroyed' + removes listeners, event subscriptions (on/off/emit), multi-platform clientPlatform values.

**Deps**: Node `events.EventEmitter`. NO @gertsai/* deps в Wave 4A initial release (avoid circular).

### W-4A-3: `@gertsai/entity-audit` (Tier 1, **F**)

**Source mirror**: `orchlab/core/src/meta.ts` + `orchlab/core/src/builders/*.ts`

**Extract**:
- Types: `MutationMarks { created_at, created_by_uuid, created_by_platform, updated_at, updated_by_uuid, updated_by_platform, deleted_at, deleted_by_uuid, deleted_by_platform }`.
- `Timestamp` interface (generic — replace Firelord ServerTimestamp): `{ seconds: number; nanoseconds: number }` OR Date; provider-pluggable via `TimestampProvider`.
- `UpdateAction { type: string; params?: unknown; timestamp: Timestamp }`.
- `UpdateActionMap` extensible interface (module-augmentation pattern):
  ```typescript
  export interface UpdateActionMap {} // consumers extend via declare module
  export type UpdateActionType = UpdateActionMap[keyof UpdateActionMap]['type'];
  ```
- `EntityBasicStatus = 'active' | 'archived' | 'deleted'`.
- `EntityMetaType<Data, Status>`, `EntityData<Data>`, `EntityDataCreate<Data>`, `EntityDataUpdate<Data>`.

**Builder functions** (pure, session-aware):
- `buildDataForSet(data, session, opts?)` → `EntityDataCreate<Data>` с заполненными created_* fields.
- `buildDataForUpdate(partial, session, opts?)` → updated_* fields.
- `buildDataForDelete(session, opts?)` → deleted_* fields.
- `buildDataForRestore(session, opts?)` → clears deleted_*, refreshes updated_*.

**Replace**:
- Firelord `ServerTimestamp` → `Timestamp` interface + `TimestampProvider` (default impl: `() => ({ seconds: Date.now()/1000, nanoseconds: 0 })`).

**Tests** (≥12): each builder function with valid session, builder с absent session (throws), Timestamp default impl, custom TimestampProvider, UpdateActionMap module-augmentation example, soft-delete + restore round-trip, EntityBasicStatus transitions, MutationMarks shape verification, builder с update_action emitted, deeply-nested data preservation, optional fields skipped, builder идемпотентность.

**Deps**: `@gertsai/session` (Session type для builder signatures).

### W-4A-4: `@gertsai/di` enhancement (Tier 2, **E** — sequential)

**Source review**: `/Users/explosovebit/Work/Orchestra/orchdev/orchestra/orchlab/di/src/**`

**Cherry-pick** patterns не присутствующих в существующем `@gertsai/di`:
- `createIdentifier<T>(name: string): symbol` для type-safe DI keys (если ещё нет).
- `IDestroyable` interface (`{ $destroy(): void }`) + DI container destroy chain.
- `IGlobalService` decorator/marker для лazy-init singletons (если patterns сходятся с существующим).
- Sub-container scoping (если нет).

**Verification process**:
1. Read existing `packages/di/src/**` first (current API).
2. Diff vs orchlab/di patterns.
3. Cherry-pick **только** non-conflicting additions. Existing API surface preserved (per ADR-005 R-3).
4. Add tests covering new functionality (≥6 tests).

**Deps**: existing `@gertsai/di` — no new external deps.

### W-4A-5 (team-lead Phase B): CLAUDE.md tier table update

Update CLAUDE.md tier table:
- Tier 1: + `@gertsai/entity` (F), `@gertsai/session` (F), `@gertsai/entity-audit` (F).
- Tier 2 row update: `@gertsai/di` add note "(enhanced Sprint 3.4)".
- Project description: 19 → 23 packages.

### W-4A-6 (team-lead Phase B): Integration verify

Full repo: install/build/test/typecheck/lint/publint/depcruise/attw + per-package `pnpm pack --dry-run` + grep audit (no firestore/firelord/firebase/@vue/runtime-core in entity/session/entity-audit src).

### W-4A-7 (team-lead Phase C): Evidence + activation

3 atomic commits:
- `feat(monorepo): Sprint 3.4 Phase A — Wave 4A entity/session/audit + di enhancement (W-4A-1..W-4A-4)`
- `chore(monorepo): Sprint 3.4 Phase B — CLAUDE.md tier table 19 → 23 (W-4A-5)`
- `docs(forgeplan): Sprint 3.4 Phase C — EVID-008 + SPEC-007 active + state (W-4A-7)`

EVID-008 (verdict=supports, CL3, measurement) + activate SPEC-007. Hindsight Group 27 retain.

## Out of scope

- ❌ `@gertsai/storage-core` / `@gertsai/entity-storage` / `@gertsai/query-dsl` — Sprint 3.5 (Wave 4B).
- ❌ pg-client adapter — Sprint 3.5.
- ❌ Vue adapter beyond stub `/vue` subpath — full Vue integration в follow-up.
- ❌ React/Solid/MobX adapters — future waves.
- ❌ m9s-example migration — opportunistic post-Wave 4.

## Data Models / Code shape

### `@gertsai/entity` — Model + Entity + EntityWithMetadata

```typescript
// src/Model.ts
export class Model extends EventEmitter {
  protected _session: Session | null;
  get $operatorUuid(): string | null { return this._session?.operatorUuid ?? null; }
  $destroy(): void { this.removeAllListeners(); this._session = null; }
}

// src/Entity.ts
export abstract class Entity<Data extends object> extends Model {
  protected _data: Data;
  protected _uid: string;
  constructor(opts: { data?: Partial<Data>; uid?: string; session?: Session; reactive?: ReactiveAdapter }) {
    super();
    this._uid = opts.uid ?? defaultUuidProvider();
    const adapter = opts.reactive ?? defaultReactiveAdapter;
    this._data = adapter.reactive({ ...this.$defaultData(), ...opts.data });
    this._session = opts.session ?? null;
  }
  abstract $defaultData(): Data;
  $patch(partial: Partial<Data>): void {
    Object.assign(this._data, partial);
    this.emit('patched', { partial });
  }
}

// src/EntityWithMetadata.ts
export abstract class EntityWithMetadata<Data extends object, Metadata extends object, Typename extends string> extends Entity<Data> {
  protected _metadata: Metadata;
  protected _isMockup: boolean;
  protected _isStaled: boolean;
  readonly __typename: Typename;
  // ... $isMockup getter, $isStaled getter, $markStaled, $setMetadata, etc.
}
```

### `@gertsai/session` — Session class

```typescript
export interface AbstractDialog {
  confirm(message: string): Promise<boolean>;
  alert(message: string): void;
  error(err: Error | unknown): void;
}

export type OperatorType = 'web' | 'ios' | 'android' | 'electron' | 'api' | 'ai' | 'bot' | 'mcp';

export class Session extends EventEmitter {
  constructor(opts: SessionOpts) { /* … */ }
  get token(): Promise<string> { return this._tokenGetter(); }
  get operatorUuid(): string;
  get dataAccessUuid(): string { return this._dataAccessUuid ?? this.operatorUuid; }
  $switchOperator(operator: { _uid: string; type: OperatorType }): void { /* emit, update */ }
  $destroy(): void { /* … */ }
}
```

### `@gertsai/entity-audit` — Builders

```typescript
export interface Timestamp { readonly seconds: number; readonly nanoseconds: number; }
export type TimestampProvider = () => Timestamp;
export const defaultTimestampProvider: TimestampProvider = () => ({ seconds: Math.floor(Date.now()/1000), nanoseconds: (Date.now() % 1000) * 1e6 });

export interface MutationMarks {
  created_at: Timestamp; created_by_uuid: string; created_by_platform: string;
  updated_at: Timestamp; updated_by_uuid: string; updated_by_platform: string;
  deleted_at?: Timestamp | null; deleted_by_uuid?: string | null; deleted_by_platform?: string | null;
}

export interface UpdateActionMap {} // consumers extend
export type UpdateActionType = keyof UpdateActionMap extends never ? string : keyof UpdateActionMap;

export function buildDataForSet<Data>(data: Data, session: Session, opts?: { timestampProvider?: TimestampProvider }): Data & MutationMarks { /* … */ }
export function buildDataForUpdate<Data>(partial: Partial<Data>, session: Session, opts?): Partial<Data> & Pick<MutationMarks, 'updated_at'|'updated_by_uuid'|'updated_by_platform'> { /* … */ }
export function buildDataForDelete(session: Session, opts?): Pick<MutationMarks, 'deleted_at'|'deleted_by_uuid'|'deleted_by_platform'|'updated_at'|'updated_by_uuid'|'updated_by_platform'> { /* … */ }
export function buildDataForRestore(session: Session, opts?): { /* clears deleted_*, refreshes updated_* */ }
```

## Acceptance Checklist

- [ ] **W-4A-1** @gertsai/entity: Model + Entity + EntityWithMetadata classes, ReactiveAdapter pluggable, default plain-object impl, /vue subpath stub, ≥10 tests pass, grep audit (0 @vue/runtime-core in core src).
- [ ] **W-4A-2** @gertsai/session: Session class, AbstractDialog interface, OperatorType union, dataAccessUuid scoping, ≥10 tests pass.
- [ ] **W-4A-3** @gertsai/entity-audit: MutationMarks + Timestamp + UpdateActionMap + 4 builder functions, ≥12 tests pass.
- [ ] **W-4A-4** @gertsai/di: existing API surface preserved (regression tests pass), enhancements (createIdentifier/IDestroyable/etc.) added with ≥6 new tests.
- [ ] **W-4A-5** CLAUDE.md tier table updated 19 → 23 packages atomic с Phase B commit.
- [ ] **W-4A-6** Full repo verify green (build/test/typecheck/lint/publint/depcruise/attw).
- [ ] **W-4A-7** 3 atomic commits + EVID-008 + SPEC-007 active + Hindsight Group 27.
- [ ] Per-package `pnpm pack --dry-run`: 0 leak.
- [ ] grep audit: `grep -rE 'firestore|firelord|@firebase|firebase-admin|@vue/runtime-core' packages/{entity,session,entity-audit}/src` returns 0 matches (vue allowed only в `/vue` subpath).

## Sprint 3.4 acceptance bundle

1. ✅ All W-4A-* acceptance.
2. ✅ Monorepo has **23 packages**.
3. ✅ Test count: ≥4099 baseline + new tests (~38-50 new).
4. ✅ Zero regression на Sprint 3.2 baseline.
5. ✅ All CI gates green.
6. ✅ Changesets: 4 new minor entries (entity, session, entity-audit, di).
7. ✅ EVID-008 active linked SPEC-007 + ADR-005 + PRD-002.

## Risks (Sprint 3.4)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | ReactiveAdapter interface design diverges from Vue patterns → consumers confused | Medium | Medium | Mirror Vue API shape (reactive, markRaw, isReactive); document mapping in README |
| R-2 | UpdateActionMap module-augmentation unsupported by some bundlers | Low | Low | Provide non-augmented fallback API (`UpdateActionGeneric { type: string }`) |
| R-3 | DI enhancement (W-4A-4) breaks existing consumers | Low | High | Strict additive only; regression tests; PR audit before merge |
| R-4 | crypto.randomUUID() not available in older Node versions → default UuidProvider fails | Low | Low | Node 18+ supported per Sprint 3.0 baseline; document; consumer can swap |
| R-5 | EventEmitter listener leaks в Entity.$destroy | Low | Low | Tests cover removeAllListeners; lint rule for missing $destroy |

## Implementation Plan — sequenced для AgentTeams

**Phase A** (3∥ workers parallel):
- **entity-worker (W-4A-1)**: `packages/entity/`.
- **session-worker (W-4A-2)**: `packages/session/`.
- **audit-worker (W-4A-3)**: `packages/entity-audit/` (depends on session interface — но Worker can use stub Session type, integration в Phase B).

**Phase A-tail** (sequential, after parallel workers):
- **di-worker (W-4A-4)**: `packages/di/` enhancement (avoids touching DI mid-build).

**Phase B** (team-lead solo):
- W-4A-5 CLAUDE.md update.
- W-4A-6 full repo verify.

**Phase C** (team-lead solo):
- W-4A-7 atomic commits + EVID-008 + activate SPEC-007 + Hindsight retain.

## Affected Files

- `packages/entity/**` (NEW, ~14 files)
- `packages/session/**` (NEW, ~10 files)
- `packages/entity-audit/**` (NEW, ~12 files)
- `packages/di/src/**` (enhancement)
- `CLAUDE.md` (tier table)
- `pnpm-lock.yaml` (regenerated)
- `.changeset/sprint-3-4-{entity,session,entity-audit,di}.md` (4 new)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | based_on |
| ADR-005 (Storage-core architecture + extraction policy) | ADR | based_on |
| ADR-004 (Foundation libs naming) | ADR | refines |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs |
| EVID-007 (Sprint 3.2 complete) | Evidence | informs |
| Orchestra orchlab/core, orchlab/di | external | informs (extraction reference) |

> **Next step**: SPEC-007 → AgentTeams Phase A 3∥ + sequential di → Phase B → Phase C.






