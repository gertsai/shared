---
depth: standard
id: SPEC-005
kind: spec
last_modified_at: 2026-05-05T19:55:22.892055+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
- target: EVID-005
  relation: based_on
- target: ADR-002
  relation: refines
- target: ADR-003
  relation: refines
status: active
title: Sprint 3.0.1 — convergent fix sprint pre-publish hardening (audit-pre-sprint-3-2 mandatory fixes)
---

---
id: SPEC-005
title: "Sprint 3.0.1 — convergent fix sprint pre-publish hardening (audit-pre-sprint-3-2 mandatory fixes)"
status: draft
author: explosivebit
created: 2026-05-05
updated: 2026-05-05
prd_ref: PRD-001
adr_ref: ADR-002,ADR-003
type: implementation-checklist
depth: standard
---

# SPEC-005: Sprint 3.0.1 — convergent fix sprint (pre-publish hardening)

## Summary

Audit-pre-sprint-3-2 (5 reviewers, 2026-05-05) обнаружил 6 convergent findings (≥2 reviewers) + 1 critical type-system leak (F-T-1). Per Group 21 pattern: mandatory fix-sprint INSERT перед v0.2.0 publish + Sprint 3.2. SPEC-005 — checklist на 11 task items (F-1..F-11) на feature branch off `feat/api-core-decomposition`.

Architect NO-GO scope critical (F-A-1, F-A-2, F-A-3 — observe/database/auth-moleculer naming) — addressed в SEPARATE artifact (PRD-001 amendment + ADR-012), не здесь. SPEC-005 = type-system + DX + publish hardening только.

## Scope

**In-scope** (11 items, MUST для v0.2.0 publish):

1. **F-1 (F-T-1)**: Hide `ApiController._registerWorkflow` from emitted `.d.ts`. Implementation: brand `ApiControllerInternalHook` через unique Symbol-keyed property OR replace `public _registerWorkflow` с private + module-scoped registry pattern. Verify через `cat packages/api-core/dist/index.d.ts | grep _registerWorkflow` returns empty.

2. **F-2 (F-T-2 + F-CR-9)**: Tighten `WorkflowDefinition.params` and `MoleculerWorkflowSchema.params` from `object` → `Readonly<Record<string, unknown>>`. Both stay optional. Non-breaking — `as const` literal records satisfy.

3. **F-3 (F-T-3 + F-CR-2)**: Replace `WorkflowRegistration = Record<string, WorkflowDefinition<any, any>>` с typed mapped form. `setWorkflows<M extends WorkflowRegistration>`. ApiController formally `implements ApiControllerInternalHook` so consumers don't need `as unknown as` cast.

4. **F-4 (F-T-4 + F-P-1)**: Add `typesVersions` fallback в `packages/core/package.json` и `packages/api-core/package.json` для всех subpath exports. Verify `pnpm run attw` shows 0 💀.

5. **F-5 (F-CR-1)**: Delete legacy `.eslintrc.cjs`. Flat config canonical.

6. **F-6 (F-CR-3 + F-P-6)**: Move `setWorkflows(...)` в m9s-example `lifecycle.ts` из module-load в `addStartedHandler`-deferred. Replace static `import` of `@moleculer/workflows` в `moleculer.config.ts` с `createMoleculerConfig({workflows: {...}})` lazy path.

7. **F-7 (F-CR-4)**: Pin TypeScript workspace-wide. Address `@ryoppippi/unplugin-typia` peer mismatch (KNOWN-ISSUES #7).

8. **F-8 (F-CR-5)**: Standardize package.json scripts. Required keys: `build`, `clean`, `test`, `typecheck`, `lint`. Verify `pnpm -r run typecheck` covers 14/14.

9. **F-9 (F-S-1)**: Additive `WorkflowSignal.meta?: Readonly<{ tenantId?: string; userId?: string; correlationId?: string }>`. Adapter reads from `ctx.meta`. Forestalls Sprint 3.2 forced minor bump.

10. **F-10 (F-T-5)**: Add optional `workflows?` field в `CoreServiceSchema` тип; remove triple `as unknown as` casts в `ApiController.class.ts:487, 1460`.

11. **F-11 (F-P-1 doc + F-P-4)**: KNOWN-ISSUES entry на subpath moduleResolution recommendation + console.log noise note для `oauth.class.ts:151..174`.

**Out-of-scope** (separate artifacts):

- ❌ PRD-001 amendment + ADR-012 (Sprint 3.2 scope redesign).
- ❌ Sprint 3.2 implementation.
- ❌ npm publish v0.2.0.
- ❌ F-T-6 strict-mode flags (deferred).
- ❌ F-S-3 auth-provider DI replacement.
- ❌ F-S-4 getRandomId crypto sibling.

## Data Models / Code shape

### F-1 — Hide internal hook (Symbol-keyed)

```typescript
// packages/api-core/src/moleculer/workflow/setWorkflows.ts
const REGISTER_WORKFLOW = Symbol.for('@gertsai/api-core:registerWorkflow');

export interface ApiControllerInternalHook {
  [REGISTER_WORKFLOW](name: string, schema: MoleculerWorkflowSchema): void;
}
```

```typescript
// packages/api-core/src/lib/controller/ApiController.class.ts
class ApiController implements ApiControllerInternalHook {
  private _pendingWorkflows = new Map<string, MoleculerWorkflowSchema>();
  [REGISTER_WORKFLOW](name: string, schema: MoleculerWorkflowSchema): void {
    this._pendingWorkflows.set(name, schema);
  }
}
```

### F-3 — Typed registration

```typescript
export type WorkflowRegistration = Readonly<Record<string, WorkflowDefinition<unknown, unknown>>>;

export function setWorkflows<M extends WorkflowRegistration>(
  controller: ApiControllerInternalHook,
  workflows: M,
): void { /* ... */ }
```

### F-4 — typesVersions

```jsonc
// packages/core/package.json
"typesVersions": {
  "*": {
    "rag": ["./dist/rag/index.d.ts"],
    "llm": ["./dist/llm/index.d.ts"]
  }
}

// packages/api-core/package.json
"typesVersions": {
  "*": {
    "contracts": ["./dist/contracts/index.d.ts"],
    "moleculer": ["./dist/moleculer/index.d.ts"],
    "runtime/node": ["./dist/runtime/node/index.d.ts"]
  }
}
```

### F-9 — WorkflowSignal.meta

```typescript
export interface WorkflowSignalMeta {
  readonly tenantId?: string;
  readonly userId?: string;
  readonly correlationId?: string;
}

export interface WorkflowSignal {
  readonly runId: string;
  readonly abort: AbortSignal;
  readonly meta?: WorkflowSignalMeta;
}
```

## Acceptance Checklist

- [ ] **F-1**: `cat packages/api-core/dist/index.d.ts packages/api-core/dist/moleculer/index.d.ts | grep -c '_registerWorkflow'` returns 0 (после rebuild).
- [ ] **F-2**: `WorkflowDefinition.params` + `MoleculerWorkflowSchema.params` оба `Readonly<Record<string, unknown>>`. m9s-example `as const` validates.
- [ ] **F-3**: Generic `setWorkflows<M extends WorkflowRegistration>(...)` accepts m9s-example без `as unknown as`. ApiController `implements ApiControllerInternalHook`.
- [ ] **F-4**: `pnpm run attw` exits 0 (no 💀); typesVersions present.
- [ ] **F-5**: `.eslintrc.cjs` deleted; `pnpm run lint` green.
- [ ] **F-6**: m9s-example setWorkflows внутри addStartedHandler. moleculer.config.ts use lazy path OR explicit comment.
- [ ] **F-7**: Single TS version pinned. `pnpm why typescript` shows single. KNOWN-ISSUES #7 updated.
- [ ] **F-8**: All 14 packages имеют scripts: build, clean, test, typecheck, lint. `pnpm -r --parallel run typecheck` covers 14/14.
- [ ] **F-9**: `WorkflowSignal.meta?` field added; adapter wires from `ctx.meta`.
- [ ] **F-10**: `as unknown as ServiceSchema` casts либо удалены через extended type, либо имеют `// reason: ...` comment.
- [ ] **F-11**: KNOWN-ISSUES.md updated.

## Sprint 3.0.1 acceptance bundle

Sprint 3.0.1 завершён, когда:

1. ✅ Все 11 F-items acceptance отмечены.
2. ✅ `pnpm install` зелёный.
3. ✅ `pnpm build` зелёный (14 + m9s-example).
4. ✅ `pnpm test` зелёный (≥4048 passed; 0 regression).
5. ✅ `pnpm typecheck` зелёный (14/14).
6. ✅ `pnpm run lint` зелёный.
7. ✅ `pnpm run publint` All good.
8. ✅ `pnpm run depcruise` 0 violations.
9. ✅ `pnpm run attw` exits 0.
10. ✅ Changeset entry для api-core (patch) + core (minor если F-9).
11. ✅ EVID-006 created с structured fields + linked + SPEC-005 activated.

## Risks (Sprint 3.0.1)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | TypeScript pin (F-7) ломает unplugin-typia peer | Medium | Medium | Если 5.9.3 unsupportable — закрепить 5.8.x; document outcome |
| R-2 | Symbol-keyed hook (F-1) меняет import shape | Low | Low | Internal API; m9s-example uses setWorkflows() helper, not the hook |
| R-3 | F-3 generic ломает m9s-example registration | Low | Low | Generic с vacuous bound preserves backward compat |
| R-4 | typesVersions (F-4) не покрывает все scenarios | Medium | Low | Если attw still 💀 — document как Sprint 3.2 follow-up |

## Implementation Plan — sequenced для AgentTeams

**Phase A** (parallel, 3 disjoint workers):
- **type-system-worker**: F-1, F-2, F-3, F-9, F-10. Files: `packages/core/src/workflow/types.ts`, `packages/api-core/src/moleculer/workflow/{adapter,setWorkflows,index,types}.ts`, `packages/api-core/src/lib/controller/ApiController.class.ts`.
- **packaging-worker**: F-4 (typesVersions), F-7 (TS pin), F-8 (scripts). Files: `package.json` (root), `packages/*/package.json`.
- **example-and-config-worker**: F-5 (.eslintrc.cjs DELETE), F-6 (m9s-example), F-11 (KNOWN-ISSUES). Files: `.eslintrc.cjs`, `examples/m9s-example/src/services/ingest/lifecycle.ts`, `examples/m9s-example/moleculer.config.ts`, `KNOWN-ISSUES.md`.

**Phase B** (team-lead solo verify):
- Full repo install + build + test + typecheck + lint + publint + depcruise + attw.
- Changeset.
- Atomic commits per phase.
- EVID-006 + activate SPEC-005.

## Affected Files

- `packages/core/src/workflow/types.ts` (F-2, F-9)
- `packages/core/package.json` (F-4, F-7?, F-8)
- `packages/api-core/src/moleculer/workflow/adapter.ts` (F-2, F-9)
- `packages/api-core/src/moleculer/workflow/setWorkflows.ts` (F-1, F-3)
- `packages/api-core/src/moleculer/workflow/index.ts` (F-3 reexport)
- `packages/api-core/src/lib/controller/ApiController.class.ts` (F-1 implements; F-10 cast removal)
- `packages/api-core/package.json` (F-4, F-7?, F-8)
- `packages/{12 others}/package.json` (F-7, F-8)
- `examples/m9s-example/src/services/ingest/lifecycle.ts` (F-6)
- `examples/m9s-example/moleculer.config.ts` (F-6)
- `package.json` (root) (F-7)
- `.eslintrc.cjs` (F-5 DELETE)
- `KNOWN-ISSUES.md` (F-11)
- `.changeset/sprint-3-0-1-pre-publish-hardening.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 | PRD | based_on |
| EVID-005 (Sprint 3.1 complete) | Evidence | based_on |
| audit-pre-sprint-3-2 (5 reviewers) | external | drives all F-items |
| ADR-002 (Hex layer enforcement) | ADR | refines (F-5 cleanup) |
| ADR-003 (Platform Runtime Boundaries) | ADR | refines (F-1, F-4) |

> **Next step**: После approve SPEC-005 — Sprint 3.0.1 implementation team.


