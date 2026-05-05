---
depth: standard
id: EVID-008
kind: evidence
last_modified_at: 2026-05-05T22:00:49.209727+00:00
last_modified_by: claude-code/2.1.128
links:
- target: SPEC-007
  relation: informs
- target: ADR-005
  relation: informs
- target: PRD-002
  relation: informs
- target: EVID-007
  relation: informs
status: active
title: Sprint 3.4 complete — Wave 4A entity/session/audit + di enhancement shipped (4 packages, 19 → 23)
---

# EVID-008: Sprint 3.4 complete — Wave 4A entity/session/audit + di enhancement

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.4 (SPEC-007) — Wave 4A foundation extraction shipped per PRD-002 + ADR-005. 3 new Tier 1-2 packages (entity, session, entity-audit) + additive enhancement to existing @gertsai/di. All 4 packages mirror Orchestra orchlab/{core,di} patterns 1:1 с stripped backend / framework coupling per ADR-005 Decision B. Monorepo grew **19 → 23 packages**. AgentTeams 3∥ workers Phase A + 1 sequential di-worker + team-lead Phase B/C.

**Branch**: `feat/api-core-decomposition` (Sprint 2 + 3.0 + 3.1 + 3.0.1 + scope redesign + Sprint 3.2 + Sprint 3.4 combined; **22 commits ahead of `main`**).

## Measurement (full repo verify)

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ clean (workspace 23 packages + m9s-example + root) |
| `pnpm build` | ✅ 23 packages + m9s-example green (ESM+CJS+dts) |
| `pnpm test` | ✅ **4194 passed / 103 skipped** (Sprint 3.2 baseline 4099 + 95 new Wave 4A) |
| `pnpm typecheck` | ✅ all 23 + m9s-example green |
| `pnpm run lint` | ✅ All good |
| `pnpm run publint` | ✅ All good (api-core, api-rlr, auth-openfga, hsm, config) |
| `pnpm run depcruise` | ✅ 0 violations (98 modules, 192 deps cruised) |
| Per-package `pnpm pack --dry-run` × 4 new | ✅ 0 leak (only dist + README + LICENSE + CHANGELOG) |
| grep firestore/firelord/firebase/firebase-admin × 3 packages | ✅ 0 matches |
| grep @vue/runtime-core in entity core | ✅ 0 hard imports (only JSDoc comment + /vue subpath lazy require) |

## Implementation evidence per task

### W-4A-1 — `@gertsai/entity` (Tier 1, F fresh, 32 tests, c19e12a)

`packages/entity/` multi-subpath shape. **Mirrors Orchestra orchlab/core** (Entity, OrchestraEntity, OrchestraModel) с stripped Vue/xid/lodash:

- `Model` extends EventEmitter — base lifecycle (`$session`, `$operatorUuid`, `$destroy`, idempotent).
- `Entity<Data>` — abstract data + uid management; `$patch(partial)` emits `'patched'`; throws after destroy.
- `EntityWithMetadata<Data, Metadata, Typename>` — adds `$metadata`, `$isMockup` (optimistic UI), `$isStaled` (cache invalidation), `$markSaved/$markStaled/$markFresh/$setMetadata` events.
- **`ReactiveAdapter` interface (3 methods)**: `reactive`, `markRaw`, `isReactive`. Default `plainReactiveAdapter` (pass-through). Subpath `/vue` lazy-requires `@vue/runtime-core` (peer-dep optional). 
- `UuidProvider` injectable (default `crypto.randomUUID()`).
- Vendored compact `deepEqual` (no lodash dependency).
- Re-exports `Session` type from `@gertsai/session` (workspace dep added Phase B for proper Session integration).

**Trimmed Orchestra surface** (per ADR-005 Decision B):
- Dropped `globalSession` singleton — explicit-or-null session passing only.
- Dropped `_uid_path` Firestore-specific.
- Dropped `$patch(check=true)` deep-equal short-circuit.
- Dropped `toJSON`/`toJSONObject` (Firelord Timestamp.toDate dependent).
- Dropped `$generateUid` xid-ts static.

**README multi-framework adapters section** — ready-to-paste snippets для React (useSyncExternalStore), Svelte (writable), Solid (createStore + reconcile), MobX (observable + isObservable), Preact signals, Nano Stores / Zustand / Valtio / Jotai patterns. Roadmap: dedicated packages `@gertsai/entity-{vue,react,svelte,solid}` в Wave 5+.

### W-4A-2 — `@gertsai/session` (Tier 1, F fresh, 16 tests, c19e12a)

`packages/session/` single-entry. **Mirrors Orchestra OrchestraSession** с Vue + Orchestra-DI couplings stripped:

- `Session extends EventEmitter` — operatorUuid, operatorType, tokenGetter callback (async refresh), dialog (`AbstractDialog` interface), clientPlatform, clientVersion, errorHandler (silent no-op default), optional dataAccessUuid.
- `dataAccessUuid` getter falls back к operatorUuid (AI agent acting on behalf of user scenario). `isOperatorScopeOverridden` boolean exposes когда override active.
- `$switchOperator({ _uid, type })` emits `'operator-switched'` event с `{prev, current}`. `$setDataAccessUuid` mutates without event. `$destroy` emits `'destroyed'` + removes listeners; subsequent ops throw.

**`OperatorType` union expanded 9 → 24 values** в 5 категорий — broader OSS coverage:
- Human surfaces: `web | ios | android | electron | desktop | cli | tui | extension`
- Programmatic: `api | sdk | webhook | cron | service`
- Agent / automation: `ai | agent | assistant | bot` (соответствует Orchestra UserType + AgentType enums)
- Protocol bridges: `mcp | grpc | graphql`
- System / internal: `system | migration | test | unknown`

**Decisions**: synchronous `() => string` tokenGetter Orchestra style → async `() => Promise<string>` (safer для refresh flows + matches api-core integration).

### W-4A-3 — `@gertsai/entity-audit` (Tier 1, F fresh, 18 tests, c19e12a)

`packages/entity-audit/` single-entry. **Mirrors Orchestra orchlab/core/meta** + builders:

- Types: `MutationMarks` (created/updated/deleted × at/by_uuid/by_platform), generic `Timestamp` interface (replaces Firelord ServerTimestamp), `TimestampProvider` injectable (default `defaultTimestampProvider` Date.now()-based с seconds + nanoseconds), `UpdateAction { type, params, timestamp }`, extensible `UpdateActionMap` interface (module-augmentation pattern), `EntityBasicStatus` ('active'|'archived'|'deleted'), `EntityData<Data>`, `EntityDataCreate<Data>`, `EntityDataUpdate<Data>`, `EntityMetaType<Data, Status>`.
- Pure builder functions (session-aware via assertSession() throws on null):
  - `buildDataForSet(data, session, opts?)` — fills all created_* + updated_* + null deleted_*.
  - `buildDataForUpdate(partial, session, opts?)` — fills only updated_*.
  - `buildDataForDelete(session, opts?)` — fills deleted_* + updated_*.
  - `buildDataForRestore(session, opts?)` — clears deleted_* + refreshes updated_*.
- Helpers: `timestampToMillis`, `timestampFromDate`.

OperatorType reused from `@gertsai/session` — `MutationMarks.created_by_platform` etc. typed canonically (24-value union) instead of parallel string type.

### W-4A-4 — `@gertsai/di` enhancement (Tier 2, E enhancement, +29 tests / 114 total, c19e12a)

`packages/di/` — strictly additive cherry-picks from Orchestra orchlab/di. **Existing 85 tests preserved + new functionality**:

NEW files:
- `src/guards.ts` (99 LOC): `isDestroyable`, `isServiceIdentifier`, `assertServiceIdentifier`. Type-narrowing runtime guards.
- `src/destroy.ts` (113 LOC): `safeDestroy(obj)` (try/catch wraps `$destroy`), `safeDestroyAll(iterable)` returns `SafeDestroyResult[]` с failure isolation. Iterable input (not just Array).
- `src/inference.ts` (60 LOC): `InferServiceFromIdentifier<I>`, `AnyServiceIdentifier` type aliases.

NEW tests: 14 guards + 10 destroy + 5 inference = 29.

**Skipped (intentional, preserved zero breaking changes per ADR-005 R-3)**:
- Args-bearing `ServiceIdentifier<T, Args>` — would force 2nd type param on existing brand → breaks 14 existing tests + every existing consumer.
- Args-bearing `ServiceFactory<S, Args>` — same blast radius.
- `ServiceDirectory.getAll(id)` + reshape — coupled с args-bearing redesign.

Documented as "deferred to dedicated major-bump sprint or new export name" — coherent breaking redesign requires different framing.

**Existing-file edit**: `src/index.ts` — additive 4-line block (3 re-exports + 1 comment marker). Zero name collisions verified.

### Phase B — CLAUDE.md tier table 19 → 23 (W-4A-5, f200fd2)

Atomic with Phase B commit:
- Project description: 19 → 23 packages с reference на ADR-005.
- Tier 1 row added: `@gertsai/session` (F), `@gertsai/entity-audit` (F).
- Tier 2 row added: `@gertsai/entity` (F); `@gertsai/di` annotated "(enhanced Sprint 3.4 W-4A-4 E)".
- Strategy markers legend extended: + E (enhancement of existing) + A (additive non-breaking adapter extension).

### Phase B — Integration verify (W-4A-6, this evidence section "Measurement")

All 8 gates green. Per-package `pnpm pack --dry-run` × 4 new — confirms 0 source/test/.env/tsconfig leak across all 4 tarballs (only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`).

### Phase C — Evidence + activation (W-4A-7, this commit)

3 atomic commits:
```
<this>   docs(forgeplan): Sprint 3.4 Phase C — EVID-008 + SPEC-007 active + state
f200fd2 chore(monorepo): Sprint 3.4 Phase B — CLAUDE.md tier table 19 → 23 packages (W-4A-5)
c19e12a feat(monorepo): Sprint 3.4 Phase A — Wave 4A entity/session/audit + di enhancement (W-4A-1..W-4A-4)
```

4 changeset entries: `sprint-3-4-{entity,session,entity-audit,di}.md` — each minor (entity/session/entity-audit 0.0.0 → 0.1.0; di 0.1.0 → 0.2.0).

## Decisions made during Sprint 3.4

- **W-4A-1 entity-worker chose Symbol-keyed adapter pattern + crypto.randomUUID default** для UuidProvider (Node 18+, no extra dep).
- **W-4A-2 session-worker async tokenGetter** vs Orchestra synchronous — safer для refresh flows.
- **W-4A-3 OperatorType reuse from @gertsai/session** — single canonical 24-value union, не parallel string type.
- **W-4A-4 di-worker SKIPPED args-bearing identifier redesign** — would force breaking changes на existing 85 tests + consumers. Preserved strictly additive contract per ADR-005 R-3.
- **Phase B variance fix (Session integration)**: entity-worker создал local Session interface stub; team-lead в Phase B заменил на `import type { Session } from '@gertsai/session'` + workspace dep. Test stubs cast `as unknown as Session` для structural unit isolation.
- **Phase B vue.ts diagnostic resolved**: original `if (_shallowReactive) return;` hit TS2774 (always-true). entity-worker уже refactored к `let _x: Fn | undefined` + `loadVue()` pattern — diagnostic clean post-rebuild.
- **Phase B inference.test.ts deprecated API fix**: `toMatchTypeOf` deprecated в vitest 3+. Replaced с `toEqualTypeOf` + `toExtend` (correct generic-form assertions). Imported `expect` for runtime assertion в generic-position type test.
- **OperatorType expansion driven by user request** (added `cli` + 14 other variants) — broader OSS coverage без waiting на Wave 5 scoping.
- **README multi-framework adapter section** — addresses user's request "если есть что-то для vue то было бы сразу это тоже взять но как расширение... может быть не vue а напрмиер svetle or react" — снippets для React/Svelte/Solid/MobX/Preact/etc. в README; dedicated packages в Wave 5+.

## Wave 5 research findings (NOT in Sprint 3.4 scope, captured для следующих sprints)

3 deep findings via Explore agent + summarized в Hindsight Group 27:

1. **Production-ready framework adapter packages** (Wave 5 / Sprint 3.8): `@gertsai/entity-vue` (Medium 6-10h), `@gertsai/entity-react` (Medium 6-10h), `@gertsai/entity-svelte` (Low 3-4h), `@gertsai/entity-solid` (Medium 6-8h). Each peer-dep optional, version-independent от core. Total ~25-32h via 4∥ AgentTeams.

2. **Session tenant/project/space scoping** (Wave 5 / Sprint 3.6): additive minor bump — SessionOpts adds `tenantId?`, `projectId?`, `spaceId?`. Methods `$switchTenant`, `$setProject`, `$setSpace`. Events TENANT_SWITCHED / PROJECT_SWITCHED / SPACE_SWITCHED. 5 use case scenarios documented (single-tenant SaaS, multi-tenant с project switcher, AI agent в проекте, workspace navigation, multi-tenant admin). Effort 8-12h.

3. **`@gertsai/runtime-context` НОВЫЙ Tier 4 пакет** (Wave 5 / Sprint 3.7): unified RequestContext API mirroring gertsai_codex `apps/pipeline/src/lib/request-context.ts:580-729` + 19 helpers (`getTenantIdStrict`, `resolveTenantIdForS2S`, `requireTenantId`, etc.) + 5 security-aware error classes (anti-enumeration). Subpath `/moleculer` для sessionMiddleware factory + tenantMiddleware + MoleculerMeta type + signed `ctx.meta[SESSION_META_KEY]` HMAC-SHA256 с timestamp + nonce. Pluggable `tenantConfigLoader: (tenantId) => Promise<TenantConfig>` — НЕ Firestore-locked. Discovery: gertsai_codex имеет 7-слойный config layer (env / app / session / TenantConfig / FeatureFlags / ProviderContext / action overrides). Effort 16-24h.

Hindsight Group 27 retains full handoff state с next-session prompt включая `/forgeplan-methodology`, `/forge-cycle`, `/forge` skill invocation reminders.

## Commits на feature branch (Sprint 3.4)

```
<this>   docs(forgeplan): Sprint 3.4 Phase C — EVID-008 + SPEC-007 active + state (W-4A-7)
f200fd2 chore(monorepo): Sprint 3.4 Phase B — CLAUDE.md tier table 19 → 23 packages (W-4A-5)
c19e12a feat(monorepo): Sprint 3.4 Phase A — Wave 4A entity/session/audit + di enhancement (W-4A-1..W-4A-4)
7e9e763 docs(forgeplan): Wave 4 Plan + Shape — PRD-002 + ADR-005 active
ba3b792 docs(forgeplan): Sprint 3.2 Phase C — EVID-007 + SPEC-006 active + state (W-8)
```

## AgentTeams metrics (Sprint 3.4)

- 3 phases (Phase A 3∥ workers + 1 sequential di-worker + Phase B/C team-lead).
- 4 unique workers: entity-worker (W-4A-1), session-worker (W-4A-2), audit-worker (W-4A-3), di-worker (W-4A-4 sequential).
- Wall-clock: Phase A 3∥ ~25 min (largest worker); sequential di-worker ~5 min; Phase B/C team-lead ~30 min (verify + CLAUDE.md + 3 commits + EVID).
- Disjoint scope: 3 NEW package directories + 1 additive-only enhancement of existing — 0 conflicts.
- Emergent worker decisions:
  - entity-worker chose to trim Orchestra surface (globalSession singleton, _uid_path, etc.) per ADR-005 Decision B explicitly.
  - session-worker async tokenGetter over sync Orchestra style (justified for refresh flows).
  - audit-worker UpdateActionMap module-augmentation `// eslint-disable @typescript-eslint/no-empty-interface` (required для extension pattern).
  - di-worker REFUSED breaking args-bearing identifier redesign, deferred to dedicated sprint — exemplary discipline aligned with ADR-005 R-3.

## Verdict rationale

`supports` SPEC-007 + ADR-005 + PRD-002 + ADR-004 + EVID-007:
- All W-4A-1..W-4A-7 acceptance met.
- Zero test regressions (4194 = Sprint 3.2 baseline 4099 + 95 new Wave 4A).
- All CI gates green.
- Per-package `pnpm pack --dry-run` × 4: 0 leak.
- All ADR-005 invariants verified (I-1: no concrete-backend SDK in core; I-2: no UI-framework runtime hard-import; I-3: pg-client untouched; I-5: SPDX + Orchestra attribution headers; I-6: strategy markers F/E applied).
- DI worker preserved zero breaking changes (existing 85 tests pass).

`congruence_level: 3` (CL3): full repo measurements on real workspace, real tests, real CI gate runs, all 23 + m9s-example.

`evidence_type: measurement`: structured measurement (test counts, build outputs, commit hashes, CI gate exit codes, tarball audit grep, multi-format diagnostics resolution).

## Decisions driven by this evidence

- SPEC-007 ready to activate (already activated при creation per `--force` через standard gate-skip — review PASS, can_activate=true post-evidence-link).
- Sprint 3.5 Wave 4B ready to start (storage-core + entity-storage + query-dsl + pg-client adapter additive).
- v0.2.0 publish technically unblocked (post-Sprint 3.5).
- Wave 5 plan (PRD-003 + ADR-006 + Sprints 3.6/3.7/3.8) ready для drafting after v0.2.0 ship.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-007 (Sprint 3.4 — Wave 4A foundation extraction checklist) | Spec | informs (full implementation evidence) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | informs (strategies F/E applied; invariants I-1..I-7 verified) |
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | informs (Wave 4A FR-W4-001..009 fulfilled; Wave 4B остаётся для Sprint 3.5) |
| ADR-004 (Foundation libs naming) | ADR | informs (per-package P/F/S/E markers extended) |
| EVID-007 (Sprint 3.2 complete) | Evidence | informs (foundation libs Wave 1 baseline) |
| Orchestra orchlab/{core,di} | external | informs (extraction reference, contributor consent confirmed 2026-05-06) |

> **Next step**: Activate EVID-008 (this artifact draft → active) → Sprint 3.5 SPEC-008 + Build (Wave 4B storage layer).





