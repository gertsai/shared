---
depth: standard
id: RFC-001
kind: rfc
last_modified_at: 2026-05-05T11:50:42.145612+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
- target: ADR-003
  relation: refines
status: active
title: Moleculer workflows integration design — controller.setWorkflows full implementation
---

---
id: RFC-001
title: "Moleculer workflows integration design — controller.setWorkflows full implementation"
status: draft
created: 2026-05-05
updated: 2026-05-05
prd_ref: PRD-001
adr_ref: ADR-003
depth: standard
---

# RFC-001: Moleculer workflows integration design

## Summary

Заменить experimental `setWorkflows` stub в `@gertsai/api-core/moleculer/workflow/setWorkflows.ts` на полную интеграцию через `@moleculer/workflows` mixin, чтобы `ApiController.setWorkflows({...})` стал 4-й равноправной поверхностью runtime (наряду с actions / queues / channels). Цель — m9s-example workflow service (`IngestWorkflowService`) переключается с manual `ServiceSchema` registration на ApiController-managed surface, без потери функциональности (replay через Redis event log, journaled `ctx.call`, AbortSignal).

## ⚠️ Amendment 2026-05-05 — ApiController hook integration clarification

Audit-pre-sprint-3-1 (architect-reviewer F-3) выявил: original RFC-001 §ApiController
extension и SPEC-003 §W-4 предполагали «existing .start() pipeline после .setChannels
stage» как готовую инфраструктуру. **Реальность**: текущий `ApiController.class.ts`
имеет `setChannels()` direct method call (не stage в pipeline) и `addStartedHandler()`.
Stage-based start pipeline (типа `_attachChannelsToServices`) НЕ существует.

**Clarification**: `_attachWorkflowsToServices` — это **NEW stage** patterns Sprint 3.1
implements, не extends existing. Workers Sprint 3.1 W-4 должны:

1. Add internal `_pendingWorkflows: Map<string, MoleculerWorkflowSchema>` to ApiController.
2. Add `_registerWorkflow(name, schema)` private method (called by `setWorkflows()` helper).
3. Modify existing `Start({services})` flow OR `addStartedHandler` callback chain
   чтобы attach workflows на synthesized service schema. Choose option:
   (a) Inside `addStartedHandler` — simpler, no pipeline refactor.
   (b) Synthesise extra ServiceSchema из `_pendingWorkflows` и feed в `Start({services: [...]})`.
   (c) Build proper stage-based start pipeline (more invasive — defer Sprint 3.x).

Recommendation: **Option (a)** для Sprint 3.1 — лowest blast radius. Sprint 3.1 W-4
worker должен документировать chosen approach в commit message.

This amendment не меняет API surface (`controller.setWorkflows({...})`), но clarifies
implementation strategy для downstream worker не improviser своё решение.

**Refs**: audit-pre-sprint-3-1 (architect-reviewer F-3), Sprint 3.0 SPEC-004 §U-12.

## Motivation

Текущий Sprint 2 fixated `controller.setWorkflows()` API surface (ADR-003 §I-7), но реализация — stub: только validates input + console.warn experimental. m9s-example registered workflow «вручную» через отдельный Moleculer `ServiceSchema` объект (`services/workflows/ingest-process.workflow.ts:50-60`), который feed'ится в `ApiController.Start({services: [...]})`.

**Что не работает без RFC-001**:

- m9s-example workflow registration делается manually вне controller.register pattern, нарушая «4 surfaces» симметрию RFC-004 GertsHub (actions, queues, channels, workflows).
- Любой новый workflow в любом проекте на @gertsai/* foundation вынужден делать тот же workaround.
- ServiceSchema-based registration не использует neutral `WorkflowDefinition` contract из `@gertsai/core` (T-2) — типы существуют как documentation, не как runtime contract.
- Replay/idempotency wiring (Redis event log через `@moleculer/workflows` middleware) полагается на developer'а вручную добавлять middleware в moleculer.config.ts; нет centralized helper.

**Что работает после RFC-001**:

- `controller.setWorkflows({ 'ingest.process': definition })` синтаксически зеркалирует `setChannels` / `setQueue`.
- Workflow handler accepts `(input, signal: WorkflowSignal)` — сигнатура из `@gertsai/core` contracts, runtime adapter (Moleculer) handles wiring через `@moleculer/workflows`.
- Replay/idempotency wiring centralized в `createMoleculerConfig({workflows: true})` factory.
- m9s-example workflow становится ~30 LOC business logic + 5 LOC registration вместо 100+ LOC ServiceSchema scaffolding.

## Goals

- **G-1**: m9s-example workflow registers через `controller.setWorkflows(...)`, не через separate ServiceSchema.
- **G-2**: WorkflowDefinition handler signature matches `@gertsai/core` neutral contract (input + WorkflowSignal).
- **G-3**: Existing replay/journaled-call behavior preserved (Redis event log via `@moleculer/workflows` v0.2+).
- **G-4**: `pnpm --filter m9s-example test` все passing после migration (12+ tests, no regressions).
- **G-5**: workflow registration zero-impact на существующие 14 packages (additive change в api-core moleculer subpath).

## Non-Goals

- НЕ implement workflow signal protocol beyond AbortSignal (heartbeat, status updates, child workflow spawn — Wave 3+).
- НЕ migrate gertsai_codex apps/pipeline workflows — separate effort после Wave 2 stable.
- НЕ change existing `@moleculer/workflows` API or fork — use upstream v0.2.x as-is (work-in-progress per dd.md).
- НЕ add workflow UI / observability dashboard — отдельный sprint.
- НЕ parallel-runtime workflow contracts (Go/FastAPI/Rust) — neutral `@gertsai/core` types готовы, runtime adapters — отдельные packages.

## Options Considered

### Option A — Wire через `@moleculer/workflows` mixin (this RFC)

**Description**: `ApiController.setWorkflows()` aggregates `WorkflowDefinition[]` registrations, builds Moleculer `ServiceSchema.workflows` shape internally, и при `start()` injects `@moleculer/workflows` middleware в broker config. Workflow handlers wrapped — neutral signature `(input, signal)` маппится на Moleculer ctx-based handler через adapter.

**Pros**:
- API surface остаётся neutral (uses `@gertsai/core` types).
- Реализация изолирована в `@gertsai/api-core/moleculer/workflow/`.
- Backward compatible — никто из 14 packages не affected.
- m9s-example refactor straightforward (~50 LOC delta).

**Cons**:
- Зависит от `@moleculer/workflows` work-in-progress upstream (риск API drift).
- Adapter layer adds slight overhead (~5 LOC per workflow registration).

### Option B — Forks/replaces `@moleculer/workflows`

**Description**: Написать свой workflow runtime в `@gertsai/api-core/moleculer/workflow/` (replay, journaled calls, signal protocol).

**Pros**:
- Full control над API stability.

**Cons**:
- ~500-1000 LOC новой логики (replay state machine, Redis event log, idempotency).
- Дублирует upstream effort (Moleculer team активно work на v0.3+).
- Bug surface увеличивается; Wave 2 не оправдан этот scope.

### Option C — Status quo (manual ServiceSchema)

**Description**: m9s-example продолжает manual registration. setWorkflows stub остаётся как documentation marker.

**Pros**:
- Zero implementation cost.

**Cons**:
- ADR-003 §I-7 (workflow contracts neutral в core) не имеет runtime confirmation.
- Documentation drift: ApiController имеет `setChannels`, `setQueue`, но не `setWorkflows` — асимметрия.
- Каждый новый @gertsai/* consumer повторяет workaround.

## Trade-off Analysis

| Критерий | **Option A (mixin)** | Option B (fork) | Option C (status quo) |
|----------|----------------------|-----------------|------------------------|
| Implementation cost | Low (~150 LOC) | Very High (~800 LOC) | Zero |
| API surface symmetry | High | High | Low |
| Risk (upstream drift) | Medium | Low | N/A |
| Backward compat | High | Medium (different API) | High |
| Wave 2 fit | High | Low | Marginal |
| **Total** | **★★★★★** | ★★ | ★★ |

**Победитель**: **Option A**.

## Proposed Direction

### API surface (in `@gertsai/api-core/moleculer/workflow/`)

```typescript
// types.ts — uses @gertsai/core neutral types
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';
export type WorkflowRegistration = Record<string, WorkflowDefinition<any, any>>;

// setWorkflows.ts (replaces stub)
import type { ApiControllerLike } from '../controller';  // typed shape
import { adaptWorkflowDefinition } from './adapter';

export function setWorkflows(
  controller: ApiControllerLike,
  workflows: WorkflowRegistration,
): void {
  for (const [name, def] of Object.entries(workflows)) {
    controller._registerWorkflow(name, adaptWorkflowDefinition(name, def));
    // _registerWorkflow — internal hook на ApiController, queues
    // workflow для injection при start()
  }
}

// adapter.ts — bridge @gertsai/core types ↔ @moleculer/workflows shape
export function adaptWorkflowDefinition<I, O>(
  name: string,
  def: WorkflowDefinition<I, O>,
): MoleculerWorkflowSchema {
  return {
    name,
    version: def.version,
    handler: async function moleculerHandler(this: ServiceContext, ctx) {
      const signal: WorkflowSignal = {
        runId: ctx.id ?? `${name}-${Date.now()}`,
        abort: ctx.locals?.abortSignal ?? new AbortController().signal,
      };
      return def.handler(ctx.params as I, signal);
    },
    // params — fastestValidator schema если есть; иначе passthrough
  };
}
```

### ApiController extension

`ApiController.class.ts` приобретает private storage + start-time injection:

```typescript
private _pendingWorkflows: Map<string, MoleculerWorkflowSchema> = new Map();

_registerWorkflow(name: string, schema: MoleculerWorkflowSchema): void {
  this._pendingWorkflows.set(name, schema);
}

// в существующем .start() pipeline (после .setChannels, .setQueue stages):
private _attachWorkflowsToServices(): void {
  if (this._pendingWorkflows.size === 0) return;
  // Append workflows: {...} к synthesized ServiceSchema
  // (or create separate workflow-only ServiceSchema если api-core current
  //  pattern uses one schema-per-controller)
}
```

### Broker config helper (in `createMoleculerConfig`)

```typescript
// createMoleculerConfig.ts (existing helper, extend)
import { Middleware as WorkflowsMiddleware } from '@moleculer/workflows';

export function createMoleculerConfig(opts: {
  workflows?: { eventLogStore?: 'redis' | 'memory'; ... };
  // ... existing opts
}): BrokerOptions {
  const middlewares = [
    // ... existing middlewares (channels, etc.)
    ...(opts.workflows ? [WorkflowsMiddleware(opts.workflows)] : []),
  ];
  return { middlewares, /* ... */ };
}
```

### m9s-example refactor (T-11 follow-up)

```typescript
// BEFORE — services/workflows/ingest-process.workflow.ts (separate ServiceSchema, 100+ LOC)
export const IngestWorkflowService: ServiceSchema = {
  name: 'wf-ingest',
  workflows: { 'ingest.process': { handler: async (ctx) => { ... } } },
};

// AFTER — services/ingest/lifecycle.ts (5 LOC delta)
import { ingestProcessWorkflow } from '../../application/IngestProcessWorkflow';

controller.setWorkflows({
  'ingest.process': ingestProcessWorkflow,  // WorkflowDefinition<IngestInput, IngestResult>
});

// application/IngestProcessWorkflow.ts (NEW — pure business logic)
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';

export const ingestProcessWorkflow: WorkflowDefinition<IngestInput, IngestResult> = {
  name: 'ingest.process',
  version: 1,
  handler: async (input, signal: WorkflowSignal) => {
    // existing logic from ingest-process.workflow.ts handler
    // signal.abort instead of manual ctx.abort plumbing
  },
};
```

`services/workflows/ingest-process.workflow.ts` файл удаляется или замещается на `services/workflows/registration.ts` (5 LOC composition glue).

## Risks & Open Questions

- **R-1**: `@moleculer/workflows` v0.2.x has known bugs (per dd.md «work-in-progress»). Mitigation: pin upstream version, add integration test in m9s-example для replay scenario.
- **R-2**: Adapter `params` mapping (typia → fastestValidator) — workflow middleware uses fastestValidator. Mitigation: pass-through schema; document, что typia static types на input — for dev-time only.
- **R-3**: ApiController private hook `_registerWorkflow` — internal API; не expose в public reexports. Mitigation: TypeScript private modifier + JSDoc `@internal`.
- **OQ-1**: WorkflowDefinition `params` field (input schema) — добавлять в neutral contract сейчас или позже? → resolved here: **add optional `params?: object` field в WorkflowDefinition в @gertsai/core** (additive, не breaking).
- **OQ-2**: должен ли setWorkflows возвращать что-то (handle, run-id getter)? → resolved: returns void для симметрии с setChannels.

## Implementation Phases

### Phase 1 — Adapter + setWorkflows full impl

- [ ] `packages/api-core/src/moleculer/workflow/adapter.ts` (NEW)
- [ ] `packages/api-core/src/moleculer/workflow/setWorkflows.ts` (replace stub)
- [ ] ApiController gains `_registerWorkflow(name, schema)` hook + `_attachWorkflowsToServices()` start-stage
- [ ] `createMoleculerConfig({workflows: true})` extends middleware list

### Phase 2 — m9s-example refactor

- [ ] `examples/m9s-example/src/application/IngestProcessWorkflow.ts` (NEW pure WorkflowDefinition)
- [ ] `examples/m9s-example/src/services/ingest/lifecycle.ts` calls `controller.setWorkflows(...)`
- [ ] `examples/m9s-example/src/services/workflows/ingest-process.workflow.ts` (DELETE) или replace на minimal registration glue
- [ ] m9s-example tests pass (12+, including any workflow-specific test)

### Phase 3 — @gertsai/core: optional `params` field в WorkflowDefinition

- [ ] `packages/core/src/workflow/types.ts` add `params?: object` field (optional, не breaking)
- [ ] Bump `@gertsai/core` patch (additive type extension)

### Phase 4 — ESLint boundaries plugin

- [ ] Install `eslint-plugin-boundaries` (devDep root)
- [ ] Update `.eslintrc.cjs` — boundaries config зеркало `.dependency-cruiser.cjs` rules
- [ ] m9s-example tests с ESLint verify

## Affected Files

- `packages/api-core/src/moleculer/workflow/adapter.ts` (NEW)
- `packages/api-core/src/moleculer/workflow/setWorkflows.ts` (REWRITE)
- `packages/api-core/src/moleculer/workflow/types.ts` (extend if needed)
- `packages/api-core/src/lib/controller/ApiController.class.ts` (add _registerWorkflow hook)
- `packages/api-core/src/moleculer/moleculerConfig.template.ts` (createMoleculerConfig extends middleware)
- `packages/core/src/workflow/types.ts` (add `params?: object` field)
- `examples/m9s-example/src/application/IngestProcessWorkflow.ts` (NEW)
- `examples/m9s-example/src/services/ingest/lifecycle.ts` (call setWorkflows)
- `examples/m9s-example/src/services/workflows/ingest-process.workflow.ts` (DELETE or replace)
- `package.json` root (add eslint-plugin-boundaries devDep)
- `.eslintrc.cjs` (root, extend с boundaries rules)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 | PRD | based_on |
| ADR-003 (Platform Runtime Boundaries) | ADR | based_on (§R-4 deferred workflow stub → this RFC implements full) |
| ADR-002 (Hex layer enforcement) | ADR | informs (Phase 4 ESLint boundaries complement dep-cruiser) |
| SPEC-002 (Sprint 2 checklist) | Spec | informs (Sprint 2 created stub; Sprint 3.1 finalizes) |
| EVID-003 (Sprint 2 complete) | Evidence | informs (foundation для Sprint 3.1) |

> **Next step**: SPEC-003 (Sprint 3.1 implementation checklist) → Sprint 3.1 implementation team.







