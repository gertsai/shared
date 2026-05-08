---
depth: standard
id: SPEC-010
kind: spec
last_modified_at: 2026-05-06T10:38:36.927503+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-002
  relation: based_on
- target: ADR-005
  relation: based_on
- target: EVID-011
  relation: refines
status: active
title: Sprint 3.5.2 — m9s-example Wave 4 migration (Entity envelope + Session-aware Repository)
---

# SPEC-010: Sprint 3.5.2 — m9s-example Wave 4 migration

## Summary

Migrate `examples/m9s-example/` к canonical Wave 4 stack — `BaseEntityStorageService<DocumentMeta>` + `InMemoryStorageProvider<DocumentMeta>` + `Session`-aware audit propagation. Preserves hexagonal port contract (`IDocumentStore`); Wave 4 plumbing lives entirely в `infrastructure/` layer. Demonstrates "build any app" pattern в reference example.

Per PRD-002 G-5 (originally opportunistic post-Wave 4); user explicitly greenlit 2026-05-06: «нужно это делать и делай качественно».

## Scope

### Track 1: Repository pattern + types (T1)
- W-S2-1: Add Wave 4 deps к `examples/m9s-example/package.json` (`@gertsai/{entity-audit, session, storage-core, entity-storage}`).
- W-S2-2: Verify `src/domain/document.ts` shape stays UNCHANGED — port contract preservation = key DDD insight.
- W-S2-3: NEW `src/infrastructure/document.repository.ts` — `DocumentRepository extends BaseEntityStorageService<DocumentMeta> implements IDocumentStore`. Wave 4 envelope (DocumentReadShape с MutationMarks) — internal type. Domain port unchanged.
- W-S2-4: DELETE `src/infrastructure/memory-document.store.ts` (superseded).

### Track 2: Composition + lifecycle (T2, blockedBy T1)
- W-S2-5: `src/composition/infrastructure.ts` — wire `InMemoryStorageProvider<DocumentMeta>` + system-level `Session`. Replace `new MemoryDocumentStore()` с `new DocumentRepository(provider, systemSession)`.
- W-S2-6: `src/services/ingest/lifecycle.ts` — preserve module-load registration semantics; Repository singleton continues working since `infrastructure` уже singleton-pattern (composition root). NO changes needed beyond verifying existing code still compiles. Per-request session scoping = future enhancement (not in this sprint).

### Track 3: Tests (T3, blockedBy T1)
- W-S2-7: NEW `tests/audit-propagation.test.ts` (3+ tests):
  - ingest a document → assert stored row carries `creator_uuid === session.operatorUuid`.
  - ingest twice → assert `updated_*` triplet refreshed on re-ingest.
  - subscribe `STORAGE_EVENTS.ENTITY_CREATED` → assert event fires post-ingest.
- W-S2-8: Verify existing `ingest-use-case.test.ts` + `search-use-case.test.ts` + `e2e.test.ts` STAY UNCHANGED (port mocks via `vi.fn()` are repository-shape-agnostic).

### Track 4: README documentation (T4, parallel-safe с T1)
- W-S2-9: `examples/m9s-example/README.md` — NEW "Wave 4 stack reference" section explaining canonical pattern (DocumentData/DocumentReadShape/DocumentMeta + Repository + Provider + Session propagation). Cross-link к Wave 4 packages.

### Track 5: Phase B Integration verify (team-lead solo)
- W-S2-10: Full repo verify — `pnpm install/build/test/typecheck/lint/publint/depcruise`. Test count target: Sprint 3.5.1 baseline 4439 → ≥4442 (+3 audit-propagation tests).

### Track 6: Phase C Evidence + commit (team-lead solo)
- W-S2-11: SPEC-010 active + EVID-012 (verdict=supports, CL3, measurement) linked PRD-002 + ADR-005 + EVID-011.
- W-S2-12: Single atomic commit `feat(m9s-example): Sprint 3.5.2 — migrate to Wave 4 stack`.
- W-S2-13: Hindsight Group 34 retain.

## Out of scope

- Postgres adapter for Document (Phase 6 deferred — pgvector ADR needed).
- Query DSL refactor of cosine similarity (Phase 5 deferred — domain-specific).
- Per-request session scoping в lifecycle (out of scope; system session sufficient для example).
- BullMQ queue refactor (Sprint 3.x candidate).
- `IPermissionGate` deeper integration with `@gertsai/auth-openfga`.
- Cross-package: ZERO modifications to `packages/*/`.

## Strategy markers

All work strictly **F+ (Fix on existing — example app migration)**. No new packages.

## Data Models

### `DocumentRepository` internal types (NEW в `src/infrastructure/document.repository.ts`)

```typescript
import type { StorageMetadata } from '@gertsai/storage-core';
import type { MutationMarks, EntityBasicStatus, UpdateAction } from '@gertsai/entity-audit';

// Write-side: domain shape passed to repository.set()
interface DocumentWriteShape {
  readonly text: string;
  readonly metadata?: DocumentMetadata;
}

// Read-side: stored shape returned by repository.get(); carries audit
interface DocumentReadShape extends DocumentWriteShape, MutationMarks {
  readonly _uid: string;
  readonly status: EntityBasicStatus;
  readonly update_action?: UpdateAction;
}

// Storage metadata
type DocumentMeta = StorageMetadata<DocumentReadShape, DocumentWriteShape, '_uid' | 'status'>;
```

### Domain `Document` (UNCHANGED — port contract)

```typescript
export interface Document {
  readonly id: string;        // Stays — domain identity
  readonly text: string;
  readonly metadata?: DocumentMetadata;
}
```

### `DocumentRepository` port adaptation

```typescript
class DocumentRepository
  extends BaseEntityStorageService<DocumentMeta>
  implements IDocumentStore
{
  constructor(provider: IStorageProvider<DocumentMeta>, session: Session) {
    super({ provider, session, path: 'documents' });
  }

  async save(doc: Document): Promise<void> {
    // Upsert semantic preserved: branch on existence to avoid re-stamping created_at
    const existing = await this.get(doc.id);
    if (existing) {
      await this.update(doc.id, { text: doc.text, metadata: doc.metadata });
    } else {
      await this.set({ _uid: doc.id, text: doc.text, metadata: doc.metadata });
    }
  }

  async findById(id: string): Promise<Document | null> {
    const stored = await this.get(id);
    if (!stored) return null;
    return { id: stored._uid, text: stored.text, metadata: stored.metadata };
  }
}
```

## Acceptance Checklist

- [ ] T1 (W-S2-1..4): deps added, document.ts unchanged, DocumentRepository created, MemoryDocumentStore deleted.
- [ ] T2 (W-S2-5..6): composition uses InMemoryStorageProvider + Session; lifecycle compiles unchanged.
- [ ] T3 (W-S2-7..8): audit-propagation.test.ts (3+ tests) green; existing tests unchanged + green.
- [ ] T4 (W-S2-9): README has Wave 4 reference section.
- [ ] T5 (W-S2-10): full repo verify — 4439 baseline → ≥4442 tests; all CI gates green; smoke.sh OK.
- [ ] T6 (W-S2-11..13): EVID-012 active; SPEC-010 active; commit; Hindsight Group 34.

## Sprint 3.5.2 acceptance bundle

1. m9s-example uses `BaseEntityStorageService<DocumentMeta>` instead of plain Map.
2. Audit fields (`creator_uuid`, `created_at`, `_uid`) populated automatically via Wave 4 builders.
3. Existing 12 tests + 3 new audit-propagation tests = 15 tests pass.
4. `IDocumentStore` port contract unchanged → use case unchanged → use case tests unchanged.
5. Single atomic commit; clean rollback via `git revert`.
6. Branch state: 30+ commits ahead of main.

## Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | `BaseEntityStorageService.set` re-stamps `created_at` on re-ingest (upsert semantics differ от `MemoryDocumentStore.byId.set`) | DocumentRepository.save branches `get → update vs set` to preserve original semantic |
| R-2 | Module-load `IngestDocumentUseCase` instantiation needs same `infrastructure` singleton | Composition root unchanged in this sprint — `infrastructure` IS the singleton; Repository continues to work |
| R-3 | `tspc` (typia transformer) build breaks due to new generic types | Verify in Phase B; typia handles `interface` shapes natively |
| R-4 | `MemoryVectorStore` unchanged (Chunk не migrated) creates apparent inconsistency | Documented в README as intentional v1 scope; Phase 5 follow-up |

## Implementation Plan — sequenced для AgentTeams

**Wave 1 (parallel, 2 teammates)**:
- **infra-types-worker** (T1): S-1, S-2 (verify), S-3, S-4 file delete. Subagent: `agents-domain:typescript-pro`.
- **readme-worker** (T4): S-7. Subagent: `agents-pro:documentation-engineer`. Doesn't read source code shapes, fully parallel-safe.

**Wave 2 (parallel, 2 teammates, blockedBy Wave 1's T1)**:
- **wiring-worker** (T2): S-4 composition update, S-5 lifecycle verify. Subagent: `agents-domain:typescript-pro`.
- **audit-tests-worker** (T3): S-6 audit-propagation.test.ts NEW. Subagent: `agents-core:tester`.

**Wave 3 (team-lead solo)**:
- T5: full repo verify — install/build/test/typecheck/lint/publint/depcruise.

**Wave 4 (team-lead solo)**:
- T6: EVID-012 + SPEC-010 activate + commit + Hindsight.

## Affected Files (predicted)

**Wave 1 + 2 modify**:
- `examples/m9s-example/package.json`
- `examples/m9s-example/src/infrastructure/document.repository.ts` (NEW)
- `examples/m9s-example/src/infrastructure/memory-document.store.ts` (DELETE)
- `examples/m9s-example/src/composition/infrastructure.ts`
- `examples/m9s-example/tests/audit-propagation.test.ts` (NEW)
- `examples/m9s-example/README.md`

**Phase C**:
- `.changeset/sprint-3-5-2-m9s-example.md` (NEW — patch bump m9s-example, but it's `private: true` so no publish)
- `.forgeplan/evidence/EVID-012-sprint-3-5-2-shipped.md` (NEW)
- pnpm-lock.yaml (regenerated)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-002 | PRD | based_on |
| ADR-005 | ADR | based_on |
| EVID-011 | Evidence | refines (Sprint 3.5.1 baseline) |
| Plan file `/Users/explosovebit/.claude/plans/iterative-percolating-koala.md` | external | Sprint 3.5.2 plan, user-approved |
| `examples/m9s-example/` | external | Migration target |

> Next step: SPEC-010 force-activate (validate gate over-fits для example migration), spawn Wave 1 teammates, then Wave 2, then team-lead Phase B/C.





