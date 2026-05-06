---
depth: standard
id: ADR-005
kind: adr
last_modified_at: 2026-05-05T21:17:39.705327+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-002
  relation: based_on
- target: ADR-004
  relation: refines
- target: ADR-003
  relation: refines
status: active
title: Storage-core architecture — abstract IStorageProvider, pg-client as adapter, Orchestra extraction policy
---

# ADR-005: Storage-core architecture + Orchestra extraction policy

## Context

Wave 4 (PRD-002) extracts entity/session/audit/storage abstractions from Orchestra (`/Users/explosovebit/Work/Orchestra/orchdev/orchestra/orchlab/`). Two architectural decisions need fixation **до** SPEC-007 / SPEC-008 implementation kicks off:

1. **Storage architecture**: каким будет abstract IStorageProvider interface, как @gertsai/pg-client (агностичный 3-method интерфейс per ADR-011) интегрируется с новым @gertsai/storage-core, и как избежать backend-coupling в abstract types.

2. **Orchestra extraction policy**: какие принципы применяются при "1:1 mirroring" Orchestra patterns — что ОК копировать, что заменять generic abstraction, как обращаться с reactivity layer и UUID generation utilities.

Без явного ADR на эти решения — workers Sprint 3.4/3.5 будут импровизировать, drift обеспечен (как обнаружил architect-reviewer F-A-7 audit-pre-sprint-3-2).

## Decision

### Decision A — Storage architecture

@gertsai/storage-core (Sprint 3.5) ships **abstract IStorageProvider<Meta> interface** — backend-agnostic CRUD + listeners + batch + transaction abstractions. Concrete adapters живут в **отдельных packages** (@gertsai/pg-client extends to provide PgStorageProvider; future Firestore adapter; built-in InMemoryStorageProvider в @gertsai/entity-storage test fixtures).

**Key design choices**:

1. **StorageMetadata<Read, Write, Indexed> generic interface** заменяет concrete-backend MetaType — pure TypeScript types, no ORM-specific runtime concepts.

2. **Listeners** (onDocumentSnapshot, onCollectionSnapshot) — **part of the interface**, но **optional** (adapter может бросать ListenersNotSupportedError). SQL adapters могут эмулировать через CDC (Postgres LISTEN/NOTIFY, MySQL binlog), realtime backends нативно поддерживают, in-memory легко эмулирует.

3. **Transactions / batches**: IBatchRunner + ITransactionRunner — runner pattern, не magic globals. Каждый adapter реализует runner shape.

4. **PgStorageProvider** (Sprint 3.5 W-4B-1 Phase B) добавляется к @gertsai/pg-client **additive** — existing 3-method PgClient interface не меняется (preserves ADR-011 invariants I-1, I-2). New adapter wraps PgClient для реализации IStorageProvider.

5. **DI integration**: storageProviderIdentifier token в @gertsai/storage-core (uses @gertsai/di); consumers register provider implementation via DI container.

### Decision B — Orchestra extraction policy

При extraction patterns из Orchestra (orchlab/core, orchlab/storage, orchlab/di) применяются следующие правила:

1. **1:1 mirror** patterns — общий design лифтится без креативных модификаций. Class names, method signatures, lifecycle hooks ($destroy, $patch, $markStaled) сохраняются как есть.

2. **Strip backend coupling** — заменить:
   - Concrete backend SDK types (Firestore/Firelord MetaType) → @gertsai/storage-core StorageMetadata<> generic.
   - firebase-admin / @firebase/* imports → не extract'ить вообще.
   - ServerTimestamp → generic Timestamp interface.
   - Backend-specific query types → @gertsai/query-dsl ValidQueryConstraints.

3. **Strip framework coupling**:
   - UI framework runtime imports (@vue/runtime-core shallowReactive) → pluggable reactive layer:
     - **Default**: plain object с manual change tracking (or Proxy-based shim).
     - **Optional subpath** @gertsai/entity/<framework> — UI framework adapter (peer-dep optional).
   - markRaw → as never cast или custom marker.

4. **Generic over implementation**:
   - xid-ts UUID v4 → UuidProvider interface; default impl via xid-ts. Consumers могут заменить на crypto.randomUUID() или nanoid.
   - lodash.isequal → use @gertsai/utils deepEqual (or vendored compact impl).
   - Internal EventEmitter from Node events → keep (это Node builtin, не зависимость).

5. **Naming consistency**:
   - Strip implementation prefix from class names: e.g. OrchestraEntity → Entity. Document mapping в README.

6. **Tests**:
   - Lift tests 1:1 где они не зависят от concrete backend.
   - Где зависят — replace fixture с in-memory adapter from @gertsai/entity-storage.

7. **License / Attribution**:
   - Apply `// SPDX-License-Identifier: Apache-2.0` header на каждый new .ts file.
   - Где код существенно lifted (≥50% of file) — add attribution comment near top referencing upstream source.
   - User confirmed contributor consent в conversation 2026-05-06.

8. **Strategy markers** per ADR-004 I-2: все Wave 4 packages маркируются. New marker **E** = enhancement of existing package. New marker **A** = additive (non-breaking) extension.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| A — Tightly couple storage-core к одному backend | Rejected | Wave 2 цель = library-first, multi-backend. Tight coupling = противоречие. |
| B — Skip storage-core entirely; ship только pg-client | Rejected | PRD-002 vision = build any app. Без storage-core невозможно написать backend-agnostic repository. |
| **C — Abstract IStorageProvider + pg-client adapter (additive)** | **Chosen** | Resolves Wave 4 vision; preserves pg-client invariants; future-proofs other backend adapters. |
| D — Storage-core but lock in UI framework reactivity для entity layer | Rejected | UI framework dependency = 100KB+ runtime cost для consumers без него. Pluggable reactivity = right tradeoff. |
| E — Lift Orchestra code verbatim (including backend-specific parts, mark as deprecated) | Rejected | Adds dist size, confusion, deprecation lifecycle work. Better to abstract clean from start. |

## Consequences

### Positive

- Wave 4 packages remain backend-agnostic для v0.x lifecycle.
- @gertsai/pg-client adapter pattern doesn't break existing consumers (additive only).
- Future Firestore / SQLite / MySQL adapters — straightforward, не требует переоткрытия abstractions.
- Reactivity pluggable — Vue/React/Solid/MobX — все могут потреблять @gertsai/entity без mandatory dependency.
- Orchestra patterns preserved 1:1 где это OSS-friendly.
- Test fixtures (in-memory adapter) — unblock unit tests без external backends.

### Negative (trade-offs)

- Listeners interface не universally supported — SQL adapters требуют extra work (CDC) или throws. Document semantic gap.
- Reactivity abstraction adds layer — default plain-object impl менее ergonomic чем direct UI-framework reactive. Consumers с UI-framework должны явно installить subpath.
- @gertsai/pg-client API surface растёт (low-level PgClient + new PgStorageProvider). Documentation must clearly distinguish use cases.
- Orchestra attribution comments — slight noise in src files; mitigated by single-line per file convention.

### Risks

- **R-1**: Pluggable reactivity contract leaks abstraction. Mitigation: minimal contract surface (reactive(obj), markRaw(obj), isReactive(obj) — три метода).
- **R-2**: Listeners semantic mismatch (realtime backends vs SQL polling) — surprises consumers. Mitigation: clear documentation, provider.capabilities.listeners boolean flag.
- **R-3**: PgStorageProvider implementation становится heavy → drags transitive deps. Mitigation: keep @gertsai/pg-client invariant I-3 (NO Prisma/Drizzle); adapter uses raw SQL templates only.
- **R-4**: Orchestra contributor consent issue arises later. Mitigation: user confirmed; SPDX + attribution + Apache 2.0 are correct.

## Invariants

I-1: @gertsai/storage-core MUST NOT import concrete backend SDK (firebase-admin, @firebase/*, firelord, @orchlab/firelord, или any other vendor-specific SDK). Generic StorageMetadata types only.

I-2: @gertsai/entity MUST NOT have hard dependency on UI framework runtime. Pluggable reactivity layer. Default impl works without UI framework.

I-3: @gertsai/pg-client core 3-method interface ($queryRaw, $executeRaw, $disconnect) MUST remain unchanged. PgStorageProvider adapter добавляется additively (новый export, новый class), не modifies existing interface.

I-4: @gertsai/storage-core listener methods MUST be optional in implementations — adapter может throw ListenersNotSupportedError. Interface declares optional support via provider.capabilities.listeners.

I-5: Orchestra-extracted files MUST start с SPDX header + (если ≥50% of file lifted) Orchestra attribution comment.

I-6: Per-package strategy markers (P/F/S/P+F/F+S/E/A) per ADR-004 I-2 + this ADR's extension MUST appear в SPEC-007 / SPEC-008 prior to Build phase.

I-7: Tests requiring storage MUST use InMemoryStorageProvider from @gertsai/entity-storage test fixtures (NOT real backend). Integration tests с real backends — отдельный CI job, gated by env vars (HAS_PG=1).

## Evidence Requirements

- E-1: SPEC-007 (Sprint 3.4 Wave 4A) активирован с per-package strategy markers (F/E) + cross-reference на ADR-005.
- E-2: SPEC-008 (Sprint 3.5 Wave 4B) активирован с per-package markers (F/A) + import direction (pg-client → storage-core, not vice versa).
- E-3: pnpm pack --dry-run для каждого нового Wave 4 package — 0 leak, 0 forbidden imports references.
- E-4: grep -rE 'firestore|firelord|@firebase|firebase-admin|@vue/runtime-core' packages/{entity,session,entity-audit,storage-core,entity-storage,query-dsl}/src returns 0 matches — automated audit.
- E-5: @gertsai/pg-client adapter (Sprint 3.5 Phase B) — existing tests still green; new tests cover PgStorageProvider interface conformance.
- E-6: Sample reference: write one BaseEntityStorageService subclass, swap between PgStorageProvider и InMemoryStorageProvider без code change в repository class.

## Implementation Plan

### Phase 0: Pre-conditions
- [ ] **0.1** PRD-002 active.
- [ ] **0.2** ADR-005 active.

### Phase 1: Sprint 3.4 Wave 4A (4 packages)
- [ ] **1.1** SPEC-007 draft с W-4A items + per-package strategy markers (F for entity/session/entity-audit, E for di).
- [ ] **1.2** SPEC-007 validate + activate.
- [ ] **1.3** AgentTeams 4 workers Phase A; team-lead Phase B/C.
- [ ] **1.4** EVID-008 + activate SPEC-007.

### Phase 2: Sprint 3.5 Wave 4B (3 packages + pg-client adapter)
- [ ] **2.1** SPEC-008 draft с W-4B items + strategy markers (F for storage-core/entity-storage/query-dsl, A for pg-client adapter).
- [ ] **2.2** SPEC-008 validate + activate.
- [ ] **2.3** AgentTeams 3 workers Phase A; team-lead Phase B (pg-client adapter additive); Phase C verify.
- [ ] **2.4** EVID-009 + activate SPEC-008.

### Phase 3: m9s-example reference impl (опционально, post-Wave 4)
- [ ] **3.1** m9s-example migrates one entity к новому @gertsai/entity + BaseEntityStorageService.
- [ ] **3.2** Documentation: "Build any app" tutorial.

## Affected Files (predicted)

- packages/entity/** (NEW Wave 4A)
- packages/session/** (NEW Wave 4A)
- packages/entity-audit/** (NEW Wave 4A)
- packages/di/src/** (Wave 4A enhancement)
- packages/storage-core/** (NEW Wave 4B)
- packages/entity-storage/** (NEW Wave 4B + InMemoryStorageProvider fixture)
- packages/query-dsl/** (NEW Wave 4B)
- packages/pg-client/src/storage-provider.ts (NEW Wave 4B adapter, additive)
- packages/pg-client/package.json (Wave 4B subpath export ./storage)
- CLAUDE.md (tier table 19 → 26)
- pnpm-lock.yaml
- .changeset/wave-4a-*.md × 4
- .changeset/wave-4b-*.md × 4

## Admissibility

NOT admissible под этим ADR:

- NOT: Импортировать concrete backend SDK в @gertsai/{entity,session,entity-audit,storage-core,entity-storage,query-dsl} core.
- NOT: Hard UI framework runtime import в @gertsai/entity core (только в subpath adapter).
- NOT: Изменять @gertsai/pg-client 3-method interface (only additive adapter).
- NOT: Lift Orchestra business entities (Spaces/Chats/Messages) — pure abstractions only.
- NOT: Lift Orchestra-specific enums в Wave 4.
- NOT: Skip SPDX headers / Orchestra attribution в файлах с ≥50% lifted code.
- NOT: Required listeners support — adapters могут throw ListenersNotSupportedError.

## Rollback Plan

**Triggers**:
- Sprint 3.4 Phase A reveals UI-framework reactivity abstraction слишком ergonomically painful → revert default impl к direct UI-framework dependency.
- Sprint 3.5 Phase B reveals что PgStorageProvider adapter драгает Prisma/Drizzle (нарушение pg-client I-3) → defer adapter в Sprint 3.6 + redesign.
- Orchestra owner withdraws contributor consent → re-evaluate which files to keep / fork.

**Steps**:
1. Open ADR-005 amendment с motivation.
2. Если reactivity rolled back: @gertsai/entity declares UI framework runtime peer-dep; default impl removed.
3. Если pg-client adapter rolled back: remove packages/pg-client/src/storage-provider.ts; future adapter в новом package.
4. Если Orchestra consent withdrawn: cherry-pick clean re-implementation; remove attribution.

**Blast Radius**: medium. Wave 4 packages еще unpublished во время потенциального rollback. After publish — semver minor break possible.

## Affected Files

| File | Baseline Hash |
|------|---------------|
| packages/{entity,session,entity-audit,storage-core,entity-storage,query-dsl}/** | (NEW — no baseline) |
| packages/pg-client/src/storage-provider.ts | (NEW — no baseline) |
| packages/pg-client/package.json | post-Sprint 3.2 |
| packages/di/src/** | post-Sprint 3.2 |
| CLAUDE.md | post-Sprint 3.2 |

## AI Guidance

> Правила для AI-агентов при работе с ADR-005:

- При extraction Orchestra файла: проверь grep на forbidden imports PRIOR to copy. Замени на abstractions per Decision B.
- При написании entity/storage code: НЕ импортируй ничего из vendor-specific namespace. Если pattern требует — поднимай вопрос → может ли быть generic'd.
- Для UI framework users: subpath @gertsai/entity/<framework>; никогда не hard-import в core.
- Для pg-client adapter (Sprint 3.5): НЕ trogai existing PgClient interface. Add NEW PgStorageProvider class в новый файл. Both exist параллельно.
- Tests: используй InMemoryStorageProvider test fixture; integration с real backend — separate CI job с env gate.
- При conflict с ADR-005 invariants: STOP, raise to user, suggest amendment vs new ADR.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | based_on |
| ADR-004 (Foundation libs naming + extraction strategy) | ADR | refines (per-package strategy markers extension: E = enhancement, A = additive adapter) |
| ADR-003 (Platform Runtime Boundaries) | ADR | refines (subpath patterns) |
| ADR-002 (Hex layer enforcement) | ADR | informs |
| ADR-011 (api-rlr / pg-client agnostic invariants) | external (Hub) | informs |
| EVID-007 (Sprint 3.2 complete) | Evidence | informs |

> **Next step**: Activate PRD-002 → Activate ADR-005 → SPEC-007 → Build → SPEC-008 → Build.






