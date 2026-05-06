---
depth: standard
id: SPEC-008
kind: spec
last_modified_at: 2026-05-05T22:33:48.209982+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-002
  relation: based_on
- target: ADR-005
  relation: based_on
- target: ADR-004
  relation: refines
- target: EVID-008
  relation: informs
- target: EVID-007
  relation: informs
status: active
title: Sprint 3.5 — Wave 4B storage-core/entity-storage/query-dsl + pg-client adapter (3 packages + additive adapter per ADR-005)
---

# SPEC-008: Sprint 3.5 — Wave 4B storage-core/entity-storage/query-dsl + pg-client adapter

## Summary

Implementation checklist для Sprint 3.5 (Wave 4B) per PRD-002 + ADR-005 Decision A. 3 NEW Tier 2-3 packages (`@gertsai/storage-core`, `@gertsai/entity-storage`, `@gertsai/query-dsl`) + additive `PgStorageProvider` adapter в `@gertsai/pg-client` через `./storage` subpath. AgentTeams Phase A staggered (storage-core types first → 2∥ entity-storage + query-dsl) + 1 sequential team-lead Phase B. Result: 22 → 25 physical directories; CLAUDE.md tier table 23 → 26 (matches PRD-002 SC-W4-5 logical count incl. di-enhanced + adapter delivery).

## Pre-Build Audit Convergent Fixes (applied 2026-05-06)

3 reviewers (architect, type-auditor, code-reviewer) verdict: **GO-WITH-FIXES**. Convergent MUST fixes folded:

- **F-T-1**: `StorageMetadata<Read, Write = Read, Indexed extends keyof Read & string = keyof Read & string>`. `defineStorageMetadata<Read>()(<const>{ indexed: [...] as const })` curried-helper.
- **F-A-1 + F-T-3**: Listener methods non-optional in interface; adapters with `capabilities.listeners=false` throw `ListenersNotSupportedError`. Capabilities `as const satisfies StorageCapabilities`.
- **F-A-2**: depcruise rule — `storage-core` MUST NOT depend on `pg-client`.
- **F-CR-3**: pg-client changeset = **minor** (subpath = feature).
- **F-CR-4**: Sample reference test in `packages/pg-client/src/storage-provider.test.ts` (devDep on entity-storage).
- **F-CR-7**: Phase A staggered. storage-core types first (~10 min), then entity-storage + query-dsl 2∥.
- **F-A-5**: `tableMap` default = identity; invalid identifier → throw at constructor.
- **F-T-4**: pg-client `typesVersions: { "*": { "storage": ["./dist/storage.d.ts"] } }` per F-4 pattern.
- **F-T-5**: DI token resolves to `IStorageProvider<any>`; consumers cast at boundary.
- **F-T-7**: `STORAGE_EVENTS` const-object mirroring Wave 4A `SESSION_EVENTS`.
- **F-T-8**: `BaseEntityStorageService extends EventEmitter implements IDestroyable`.
- **F-T-9**: Per-package tsconfig sets `"noUncheckedIndexedAccess": true` (query-dsl + pg-client/storage).
- **F-CR-5/6 + ADR-005 I-5**: README + LICENSE symlink + CHANGELOG.md placeholder; SPDX header on every `.ts`.
- Tenant scoping: NOT in IStorageProvider (BaseEntityStorageService responsibility via Session per ADR-005 A) — design decision, not deficiency.

## Scope

Three new backend-agnostic packages forming the **storage layer** of Wave 4 foundation, plus an **additive** PgStorageProvider adapter in the existing `@gertsai/pg-client` (preserves ADR-011 invariants I-1, I-2, I-3 — existing 3-method PgClient interface unchanged).

Per ADR-005 Decision A — abstract `IStorageProvider<Meta>` interface with optional listeners (capabilities flag), runner-pattern transactions/batches, generic `StorageMetadata<Read, Write, Indexed>`. Concrete adapters live in separate packages.

Per ADR-005 Decision B — Orchestra extraction policy: 1:1 mirror patterns, strip backend coupling, strip framework coupling, generic over implementation, SPDX headers + attribution.

## Out of scope

- Concrete Firestore adapter (deferred to future wave on external demand).
- Multi-master replication / CDC integration helpers (separate wave).
- Schema migration tooling (separate package later).
- Breaking changes to `@gertsai/pg-client` 3-method core interface.
- m9s-example migration to use new storage layer (opportunistic post-Wave 4).

## Per-package strategy markers (per ADR-004 I-2 + ADR-005 I-6)

| Package | Tier | Strategy | Effort |
|---------|------|----------|--------|
| `@gertsai/storage-core` | 2 | F | 10h |
| `@gertsai/entity-storage` | 3 | F | 10h |
| `@gertsai/query-dsl` | 2 | F | 8h |
| `@gertsai/pg-client` | 1 | A | 4h |

## Work Items

### W-4B-1: `@gertsai/storage-core` (Tier 2, F)

Source mirror: `orchlab/storage/src/{IStorageProvider,types,batch,transaction,errors}.ts`.

Extract: IStorageProvider<Meta> interface (mandatory CRUD + optional listeners + capabilities flag + runBatch/runTransaction); StorageMetadata<Read, Write, Indexed> generic; IBatchRunner<Meta>; ITransactionRunner<Meta>; ListenersNotSupportedError; TransactionConflictError; storageProviderIdentifier DI token; defineStorageMetadata helper.

Tests ≥10. Deps: `@gertsai/di`. Subpaths: root only.

### W-4B-2: `@gertsai/entity-storage` (Tier 3, F)

Source mirror: orchlab/storage BaseEntityStorageService + InMemoryStorageProvider.

Extract: abstract BaseEntityStorageService<Meta, UpdateActionTypes> wrapping IStorageProvider with session-aware audit-stamped CRUD/soft-delete/restore + EventEmitter + listener wrappers; class InMemoryStorageProvider<Meta> Map-backed test fixture supporting full listeners + batches + transactions.

Tests ≥15. Deps: storage-core, entity, entity-audit, session, di. Subpaths: root only.

### W-4B-3: `@gertsai/query-dsl` (Tier 2, F)

Source mirror: orchlab/storage/query.

Extract: ValidQueryConstraints<Meta, QC> type-safe builder; constraint factories whereField/orderBy/limit/startAt/startAfter/endAt/endBefore (compile-validated against Meta['indexed']); Query<Meta> type; validateQuery runtime; compileToSql at `./sql` subpath.

Tests ≥10. Deps: storage-core. Subpaths: root + ./sql.

### W-4B-4: `@gertsai/pg-client` adapter (Tier 1, A — additive)

NEW file packages/pg-client/src/storage-provider.ts. Existing src/index.ts unchanged (preserves ADR-011 I-1/I-2 + ADR-005 I-3).

Add: PgStorageProvider<Meta> implements IStorageProvider via raw SQL through compileToSql + mockPgClient-friendly; capabilities { listeners: false, transactions: true, batches: true }; PgBatchRunner; PgTransactionRunner mapping SQLSTATE 40001 → TransactionConflictError; TableMap.

New peer deps: `@gertsai/storage-core`, `@gertsai/query-dsl` (workspace:^).

Subpath: NEW `./storage` export. typesVersions added per Sprint 3.0.1 F-4 pattern.

Tests ≥10.

### W-4B-5 (Phase B): CLAUDE.md tier table update (23 → 26)

### W-4B-6 (Phase B): Integration verify

Full repo: install/build/test/typecheck/lint/publint/depcruise/attw + per-pkg pack dry-run + grep audits (no firestore/firelord/firebase/@vue/runtime-core in core src; no @prisma/drizzle-orm/pg in pg-client) + sample reference test (swap PgStorageProvider ↔ InMemoryStorageProvider, same suite passes).

### W-4B-7 (Phase C): Evidence + activation

3 atomic commits + EVID-009 (verdict=supports, CL3, measurement) linked to SPEC-008/ADR-005/PRD-002/EVID-008/ADR-011 + activate SPEC-008 + Hindsight Group 30.

## Data Models

Public type shapes for the three new packages + pg-client adapter (illustrative — full source ships in implementation).

### `@gertsai/storage-core`

```typescript
export interface StorageMetadata<
  ReadType = unknown,
  WriteType = ReadType,
  IndexedFields extends string = string,
> {
  readonly read: ReadType;
  readonly write: WriteType;
  readonly indexed: IndexedFields;
}

export interface StorageCapabilities {
  readonly listeners: boolean;
  readonly transactions: boolean;
  readonly batches: boolean;
}

export interface IStorageProvider<Meta extends StorageMetadata> {
  readonly capabilities: StorageCapabilities;
  set(path: string, id: string, data: Meta['write']): Promise<void>;
  getDoc(path: string, id: string): Promise<Meta['read'] | null>;
  getDocs(path: string, query?: Query<Meta>): Promise<Meta['read'][]>;
  count(path: string, query?: Query<Meta>): Promise<number>;
  update(path: string, id: string, partial: Partial<Meta['write']>): Promise<void>;
  delete(path: string, id: string): Promise<void>;
  runBatch<R>(fn: (batch: IBatchRunner<Meta>) => Promise<R>): Promise<R>;
  runTransaction<R>(fn: (tx: ITransactionRunner<Meta>) => Promise<R>): Promise<R>;
  onDocumentSnapshot?(path: string, id: string, cb: (doc: Meta['read'] | null) => void): () => void;
  onCollectionSnapshot?(path: string, query: Query<Meta>, cb: (docs: Meta['read'][]) => void): () => void;
}

export interface IBatchRunner<Meta extends StorageMetadata> {
  set(path: string, id: string, data: Meta['write']): void;
  update(path: string, id: string, partial: Partial<Meta['write']>): void;
  delete(path: string, id: string): void;
}

export interface ITransactionRunner<Meta extends StorageMetadata> {
  get(path: string, id: string): Promise<Meta['read'] | null>;
  set(path: string, id: string, data: Meta['write']): void;
  update(path: string, id: string, partial: Partial<Meta['write']>): void;
  delete(path: string, id: string): void;
}

export class ListenersNotSupportedError extends Error {}
export class TransactionConflictError extends Error {}
```

### `@gertsai/entity-storage`

```typescript
export abstract class BaseEntityStorageService<
  Meta extends StorageMetadata,
  UpdateActionTypes extends string = never,
> extends EventEmitter {
  constructor(opts: {
    provider: IStorageProvider<Meta>;
    session: Session;
    path?: string;
  });

  set(entity: Meta['write']): Promise<void>;
  update(uid: string, partial: Partial<Meta['write']>, opts?: { action?: UpdateActionTypes; params?: unknown }): Promise<void>;
  delete(uid: string): Promise<void>;
  restore(uid: string): Promise<void>;
  get(uid: string): Promise<Meta['read'] | null>;
  list(query?: Query<Meta>): Promise<Meta['read'][]>;
  count(query?: Query<Meta>): Promise<number>;
  $destroy(): void;
}

export class InMemoryStorageProvider<Meta extends StorageMetadata>
  implements IStorageProvider<Meta>
{
  capabilities: { listeners: true; transactions: true; batches: true };
}
```

### `@gertsai/query-dsl`

```typescript
export type WhereOp =
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';
export type Direction = 'asc' | 'desc';

export interface WhereConstraint<Meta extends StorageMetadata, F extends Meta['indexed']> {
  readonly kind: 'where';
  readonly field: F;
  readonly op: WhereOp;
  readonly value: unknown;
}

export type QueryConstraint<Meta extends StorageMetadata> =
  | WhereConstraint<Meta, Meta['indexed']>
  | OrderByConstraint<Meta, Meta['indexed']>
  | LimitConstraint<Meta>;

export type Query<Meta extends StorageMetadata> = ReadonlyArray<QueryConstraint<Meta>>;

export function whereField<Meta extends StorageMetadata, F extends Meta['indexed']>(field: F, op: WhereOp, value: unknown): WhereConstraint<Meta, F>;
export function orderBy<Meta extends StorageMetadata, F extends Meta['indexed']>(field: F, dir?: Direction): OrderByConstraint<Meta, F>;
export function limit<Meta extends StorageMetadata>(n: number): LimitConstraint<Meta>;
export function compileToSql<Meta extends StorageMetadata>(query: Query<Meta>, table: string): { sql: string; params: unknown[] };
```

### `@gertsai/pg-client/storage` (additive subpath)

```typescript
import type { PgClient } from '@gertsai/pg-client';
import type { IStorageProvider, StorageMetadata } from '@gertsai/storage-core';

export interface TableMap { readonly [path: string]: string }

export class PgStorageProvider<Meta extends StorageMetadata>
  implements IStorageProvider<Meta>
{
  constructor(opts: { client: PgClient; tableMap?: TableMap });
  readonly capabilities: { listeners: false; transactions: true; batches: true };
}
```

## Acceptance Checklist

- [ ] W-4B-1 storage-core: IStorageProvider, StorageMetadata, runners, errors, DI token, capabilities flag, ≥10 tests.
- [ ] W-4B-2 entity-storage: BaseEntityStorageService + InMemoryStorageProvider, EventEmitter, session-aware audit CRUD + soft-delete, ≥15 tests.
- [ ] W-4B-3 query-dsl: 7 constraint factories, validateQuery, compileToSql at ./sql subpath, ≥10 tests.
- [ ] W-4B-4 pg-client /storage subpath: PgStorageProvider, capabilities listeners=false, transaction conflict mapping, ≥10 tests. Existing root surface unchanged.
- [ ] W-4B-5 CLAUDE.md tier table 23 → 26.
- [ ] W-4B-6 Full repo verify green.
- [ ] W-4B-7 3 atomic commits + EVID-009 + SPEC-008 active + Hindsight Group 30.
- [ ] Per-package pnpm pack --dry-run: 0 leak.
- [ ] grep audit: 0 forbidden imports.
- [ ] Sample reference test: swap PgStorageProvider ↔ InMemoryStorageProvider, both green.

## Sprint 3.5 acceptance bundle

1. All W-4B-* acceptance.
2. Monorepo has 25 packages physical.
3. Test count: ≥4194 baseline + ~50 new = ~4244 passed.
4. Zero regression on Sprint 3.4 baseline.
5. All CI gates green.
6. Changesets: 4 new entries.
7. EVID-009 active linked SPEC-008 + ADR-005 + PRD-002 + ADR-011 + EVID-008.

## Risks (Sprint 3.5)

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | Listeners semantic mismatch with SQL backends | capabilities flag; ListenersNotSupportedError documented |
| R-2 | PgStorageProvider drags Prisma/Drizzle/pg | Strict deps audit; mockPgClient sufficient for tests |
| R-3 | Type-safe query DSL hard to type | Mirror Firestore-tested shapes; expectTypeOf; document limitations |
| R-4 | InMemoryStorageProvider listener emit semantics differ | Document: synchronous emit; consumers wrap if needed |
| R-5 | Transaction conflict retry not part of interface | Document: callers handle retry |
| R-6 | Adapter subpath duplicates type imports | tsup external() declared; verified via attw |
| R-7 | path → tableName confusion | Default identity; TableMap override documented |

## Implementation Plan — sequenced для AgentTeams

Phase A (3∥ workers parallel, disjoint package directories):

- storage-core-worker (W-4B-1): packages/storage-core/. Subagent: typescript-pro.
- entity-storage-worker (W-4B-2): packages/entity-storage/. Subagent: coder.
- query-dsl-worker (W-4B-3): packages/query-dsl/. Subagent: typescript-pro.

Phase B (team-lead solo, sequential):
- W-4B-4: pg-client adapter additive.
- W-4B-5: CLAUDE.md tier table 23 → 26.
- W-4B-6: full repo verify.

Phase C (team-lead solo):
- W-4B-7: 3 atomic commits + EVID-009 + activate SPEC-008 + Hindsight Group 30 retain.

## Affected Files

- packages/storage-core/** (NEW, ~12 files)
- packages/entity-storage/** (NEW, ~12 files)
- packages/query-dsl/** (NEW, ~10 files)
- packages/pg-client/src/storage-provider.ts (NEW, additive adapter)
- packages/pg-client/src/storage-provider.test.ts (NEW)
- packages/pg-client/package.json (additive subpath + peerDeps)
- packages/pg-client/tsup.config.ts (additive entry)
- CLAUDE.md (tier table 23 → 26)
- pnpm-lock.yaml (regenerated)
- .changeset/sprint-3-5-{storage-core,entity-storage,query-dsl,pg-client-storage}.md (4 new)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-002 | PRD | based_on |
| ADR-005 | ADR | based_on |
| ADR-004 | ADR | refines |
| ADR-003 | ADR | informs |
| ADR-002 | ADR | informs |
| EVID-008 | Evidence | informs |
| EVID-007 | Evidence | informs |
| Orchestra orchlab/storage | external | informs |

> Next step: SPEC-008 → forgeplan_validate → Pre-Build audit → forgeplan_activate → Phase A → Phase B → Phase C.



