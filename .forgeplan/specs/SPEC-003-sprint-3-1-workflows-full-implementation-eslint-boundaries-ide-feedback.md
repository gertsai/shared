---
depth: standard
id: SPEC-003
kind: spec
last_modified_at: 2026-05-05T11:52:00.176725+00:00
last_modified_by: claude-code/2.1.128
links:
- target: RFC-001
  relation: based_on
- target: PRD-001
  relation: based_on
status: draft
title: Sprint 3.1 — workflows full implementation + ESLint boundaries IDE feedback
---

---
id: SPEC-003
title: "Sprint 3.1 — workflows full implementation + ESLint boundaries IDE feedback"
status: draft
author: explosivebit
created: 2026-05-05
updated: 2026-05-05
prd_ref: PRD-001
rfc_ref: RFC-001
adr_ref: ADR-002,ADR-003
type: implementation-checklist
depth: standard
---

# SPEC-003: Sprint 3.1 implementation checklist

## Summary

Implementation checklist для Sprint 3.1 per RFC-001 (workflows full impl) + ADR-002 (hex enforcement IDE-side completion). 8 task items на feature branch off main. Sprint 2 completion follow-up.

## Scope

**In-scope** (8 items):

1. **W-1**: `@gertsai/core` extends `WorkflowDefinition` с optional `params?: object` field (additive).
2. **W-2**: `@gertsai/api-core/moleculer/workflow/adapter.ts` (NEW) — bridge `WorkflowDefinition` ↔ `MoleculerWorkflowSchema`.
3. **W-3**: `@gertsai/api-core/moleculer/workflow/setWorkflows.ts` REPLACE stub с full implementation (registers через ApiController hook).
4. **W-4**: `@gertsai/api-core/lib/controller/ApiController.class.ts` adds `_registerWorkflow` private hook + `_attachWorkflowsToServices` start-stage.
5. **W-5**: `@gertsai/api-core/moleculer/moleculerConfig.template.ts` extends `createMoleculerConfig` с `workflows?: {...}` option (injects `@moleculer/workflows` middleware).
6. **W-6**: `examples/m9s-example/src/application/IngestProcessWorkflow.ts` (NEW pure `WorkflowDefinition`) + `services/ingest/lifecycle.ts` calls `controller.setWorkflows(...)`.
7. **W-7**: `examples/m9s-example/src/services/workflows/ingest-process.workflow.ts` DELETE (replaced by W-6 registration glue) или replace на minimal `controller.setWorkflows({...})` invocation.
8. **W-8**: `eslint-plugin-boundaries` installed + `.eslintrc.cjs` extends с layer rules mirroring `examples/m9s-example/.dependency-cruiser.cjs`.

**Out-of-scope** (Sprint 3.2+):

- ❌ Foundation libs extraction (`@gertsai/config`, `@gertsai/tenant`, etc.) — Sprint 3.2.
- ❌ Workflow signal protocol beyond AbortSignal (heartbeat, status updates) — Wave 3+.
- ❌ Migration gertsai_codex apps/pipeline workflows.
- ❌ npm publish.

## Data Models

### `@gertsai/core` extension (W-1)

```typescript
// packages/core/src/workflow/types.ts (extend existing)
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly version: number;
  readonly handler: (input: TInput, signal: WorkflowSignal) => Promise<TOutput>;
  /** Optional: fastestValidator schema для input validation в @moleculer/workflows */
  readonly params?: object;
}
```

### `@gertsai/api-core/moleculer/workflow/adapter.ts` (W-2)

```typescript
// SPDX-License-Identifier: Apache-2.0
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';
import type { Context } from 'moleculer';

/** Shape ожидаемая @moleculer/workflows runtime */
export interface MoleculerWorkflowSchema {
  name: string;
  version: number;
  params?: object;
  handler: (this: unknown, ctx: Context) => Promise<unknown>;
}

export function adaptWorkflowDefinition<I, O>(
  name: string,
  def: WorkflowDefinition<I, O>,
): MoleculerWorkflowSchema {
  return {
    name,
    version: def.version,
    params: def.params,
    handler: async function moleculerHandler(this: unknown, ctx: Context) {
      const signal: WorkflowSignal = {
        runId: (ctx.id as string) ?? `${name}-${Date.now()}`,
        abort: (ctx as unknown as { locals?: { abortSignal?: AbortSignal } }).locals?.abortSignal
          ?? new AbortController().signal,
      };
      return def.handler(ctx.params as I, signal);
    },
  };
}
```

### `setWorkflows` full impl (W-3)

```typescript
// packages/api-core/src/moleculer/workflow/setWorkflows.ts
// SPDX-License-Identifier: Apache-2.0
import type { ApiControllerInternalHook } from '../../lib/controller/internal-types';
import type { WorkflowRegistration } from './types';
import { adaptWorkflowDefinition } from './adapter';

/**
 * Register one or more workflows на ApiController.
 * Registrations are attached to the synthesized service schema(s) at controller.start().
 */
export function setWorkflows(
  controller: ApiControllerInternalHook,
  workflows: WorkflowRegistration,
): void {
  if (!workflows || typeof workflows !== 'object') {
    throw new Error('setWorkflows: workflows must be a non-null object');
  }
  for (const [name, def] of Object.entries(workflows)) {
    controller._registerWorkflow(name, adaptWorkflowDefinition(name, def));
  }
}
```

### `ApiController` extension (W-4)

```typescript
// packages/api-core/src/lib/controller/ApiController.class.ts (selectively shown)

private _pendingWorkflows: Map<string, MoleculerWorkflowSchema> = new Map();

/** @internal Used by setWorkflows() helper. NOT a public API. */
public _registerWorkflow(name: string, schema: MoleculerWorkflowSchema): void {
  this._pendingWorkflows.set(name, schema);
}

/** Called from existing .start() pipeline после .setChannels stage */
private _attachWorkflowsToServices(synthSchema: ServiceSchema): void {
  if (this._pendingWorkflows.size === 0) return;
  const workflowsBlock: Record<string, MoleculerWorkflowSchema> = {};
  for (const [name, schema] of this._pendingWorkflows) {
    workflowsBlock[name] = schema;
  }
  // Attach to synthesized schema:
  (synthSchema as unknown as { workflows: Record<string, MoleculerWorkflowSchema> }).workflows = workflowsBlock;
}
```

### `createMoleculerConfig` extension (W-5)

```typescript
// packages/api-core/src/moleculer/moleculerConfig.template.ts (extend)

interface CreateMoleculerConfigOpts {
  /** Existing options... */
  workflows?: {
    eventLogStore?: 'redis' | 'memory';
    redis?: { host: string; port?: number; db?: number };
    /** ... other @moleculer/workflows opts passthrough */
  };
}

export function createMoleculerConfig(opts: CreateMoleculerConfigOpts): BrokerOptions {
  const middlewares: Middleware[] = [];
  // ... existing middlewares (channels etc.)
  if (opts.workflows) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Middleware: WorkflowsMiddleware } = require('@moleculer/workflows');
    middlewares.push(WorkflowsMiddleware(opts.workflows));
  }
  return { middlewares, /* ... existing fields */ };
}
```

### m9s-example refactor (W-6, W-7)

```typescript
// examples/m9s-example/src/application/IngestProcessWorkflow.ts (NEW)
// SPDX-License-Identifier: Apache-2.0
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';

interface IngestInput {
  docId: string;
  text: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}
interface IngestResult {
  docId: string;
  chunkCount: number;
  status: 'completed' | 'skipped-empty';
}

export const ingestProcessWorkflow: WorkflowDefinition<IngestInput, IngestResult> = {
  name: 'ingest.process',
  version: 1,
  params: {
    docId: 'string',
    text: 'string',
    userId: { type: 'string', optional: true },
    metadata: { type: 'object', optional: true },
  },
  handler: async (input: IngestInput, signal: WorkflowSignal): Promise<IngestResult> => {
    // existing logic из ingest-process.workflow.ts handler
    // signal.abort вместо manual ctx.abort plumbing
    if (!input.text || input.text.length === 0) {
      return { docId: input.docId, chunkCount: 0, status: 'skipped-empty' };
    }
    // ... validation, chunking, embed via journaled call, store via journaled call
    return { docId: input.docId, chunkCount: 0, status: 'completed' };
  },
};
```

```typescript
// examples/m9s-example/src/services/ingest/lifecycle.ts (extend existing)
import { setWorkflows } from '@gertsai/api-core/moleculer';
import { ingestProcessWorkflow } from '../../application/IngestProcessWorkflow';

controller.addStartedHandler(async (ctx) => {
  // ... existing logic
  setWorkflows(controller as any, {
    'ingest.process': ingestProcessWorkflow,
  });
});
```

### ESLint boundaries config (W-8)

```javascript
// .eslintrc.cjs (extend existing)
module.exports = {
  // ... existing rules
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'domain', pattern: '**/src/domain/**' },
      { type: 'application', pattern: '**/src/application/**' },
      { type: 'infrastructure', pattern: '**/src/infrastructure/**' },
      { type: 'services', pattern: '**/src/services/**' },
      { type: 'lib', pattern: '**/src/lib/**' },
      { type: 'mol-services', pattern: '**/src/mol-services/**' },
      { type: 'composition', pattern: '**/src/composition/**' },
    ],
  },
  rules: {
    // ... existing no-restricted-imports
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: 'domain', allow: [] },
        { from: 'application', allow: ['domain'] },
        { from: 'infrastructure', allow: ['domain'] },
        { from: 'services', allow: ['application', 'infrastructure', 'lib', 'composition'] },
        { from: 'lib', allow: ['lib'] },
        { from: 'mol-services', allow: ['services', 'lib'] },
        { from: 'composition', allow: ['domain', 'application', 'infrastructure', 'lib'] },
      ],
    }],
  },
};
```

## Acceptance Checklist

### W-1 — `@gertsai/core` WorkflowDefinition.params добавлен
- [ ] `WorkflowDefinition` имеет `readonly params?: object` field
- [ ] `pnpm --filter @gertsai/core build` зелёный
- [ ] `pnpm --filter @gertsai/core test` зелёный (1107+ tests pass)

### W-2 — adapter.ts создан
- [ ] Файл `packages/api-core/src/moleculer/workflow/adapter.ts` существует
- [ ] Exports `MoleculerWorkflowSchema` interface + `adaptWorkflowDefinition` function
- [ ] `pnpm --filter @gertsai/api-core build` зелёный

### W-3 — setWorkflows full impl
- [ ] `setWorkflows.ts` больше не stub — registers через `_registerWorkflow` hook
- [ ] Old `console.warn('experimental')` удалён
- [ ] Backward-compat: `setWorkflows({})` или `null` throws с понятным error

### W-4 — ApiController gains _registerWorkflow + _attachWorkflowsToServices
- [ ] ApiController.class.ts имеет private `_pendingWorkflows: Map<string, MoleculerWorkflowSchema>`
- [ ] `_registerWorkflow` method (с `@internal` JSDoc)
- [ ] `_attachWorkflowsToServices` called в start() pipeline после setChannels stage
- [ ] No regression в existing actions/queues/channels behavior

### W-5 — createMoleculerConfig extends с workflows option
- [ ] Optional `workflows: { eventLogStore?, redis? }` в config opts
- [ ] При `workflows` set — `@moleculer/workflows` middleware injected
- [ ] При `workflows` undefined/false — middleware не loaded (lazy require)

### W-6 — IngestProcessWorkflow в application layer
- [ ] `examples/m9s-example/src/application/IngestProcessWorkflow.ts` существует
- [ ] Exports `ingestProcessWorkflow: WorkflowDefinition<IngestInput, IngestResult>`
- [ ] Pure business logic; no Moleculer imports
- [ ] Hex layer compliant (application zone)

### W-7 — m9s-example uses controller.setWorkflows
- [ ] `services/ingest/lifecycle.ts` calls `setWorkflows(controller, {...})`
- [ ] `services/workflows/ingest-process.workflow.ts` deleted ИЛИ replaced на minimal registration glue (5 LOC max)
- [ ] `pnpm --filter m9s-example test` зелёный (12+ tests pass)
- [ ] `pnpm --filter m9s-example typecheck` зелёный

### W-8 — eslint-plugin-boundaries enabled
- [ ] `eslint-plugin-boundaries` installed как devDep root
- [ ] `.eslintrc.cjs` extends с `plugins: ['boundaries']` + settings + rules
- [ ] Run `pnpm dlx eslint examples/m9s-example/src` — 0 boundary violations (baseline green)

## Sprint 3.1 acceptance bundle

Sprint 3.1 завершён, когда:

1. ✅ Все 8 W-items acceptance отмечены.
2. ✅ `pnpm install` зелёный.
3. ✅ `pnpm build` зелёный (14 + m9s-example).
4. ✅ `pnpm test` зелёный (≥3488 passed).
5. ✅ `pnpm typecheck` зелёный.
6. ✅ `pnpm dlx eslint examples/m9s-example/src` — 0 errors.
7. ✅ `pnpm dlx dependency-cruiser` (existing) — 0 violations.
8. ✅ Changeset entry `feat: sprint 3.1 — workflows full impl + eslint boundaries`.
9. ✅ EVID-004 created с structured fields + linked + RFC-001/SPEC-003 activated.

## Risks (Sprint 3.1)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | `@moleculer/workflows` v0.2.x bugs (per dd.md WIP status) ломают m9s-example replay | Medium | Medium | Pin upstream version; integration test для replay scenario; fallback к stub если critical bug |
| R-2 | `_registerWorkflow` private hook leaks в public TypeScript API | Low | Low | Явное `@internal` JSDoc + private modifier; не reexport в public surface |
| R-3 | ESLint boundaries plugin slow build перформанс | Low | Low | Initial scope только m9s-example; CI gate уже через dep-cruiser |
| R-4 | Adapter params (typia → fastestValidator) несовместимость | Medium | Medium | Pass-through schema; document expected shapes |

## Implementation Plan — sequenced для AgentTeams

Phase A (parallel, 3 disjoint workers):
- **W-1+W-3** by **core+api-core-worker**: WorkflowDefinition.params field + setWorkflows full impl + adapter.ts
- **W-4+W-5** by **controller-extender**: ApiController hooks + createMoleculerConfig extension
- **W-8** by **eslint-boundaries-worker**: eslint-plugin-boundaries install + config

Phase B (sequential after Phase A — depends on api-core ready):
- **W-6+W-7** by **m9s-workflow-migrator**: application IngestProcessWorkflow + lifecycle.ts setWorkflows + delete old service file

Phase C (sequential by team-lead):
- Verify (build/test/typecheck/eslint/dep-cruiser)
- Changeset
- Atomic or per-phase commits
- EVID-004 + activate RFC-001 + SPEC-003

## Affected Files

- `packages/core/src/workflow/types.ts` (W-1)
- `packages/api-core/src/moleculer/workflow/adapter.ts` (W-2 NEW)
- `packages/api-core/src/moleculer/workflow/setWorkflows.ts` (W-3 REWRITE)
- `packages/api-core/src/lib/controller/ApiController.class.ts` (W-4)
- `packages/api-core/src/lib/controller/internal-types.ts` (NEW or extend, для ApiControllerInternalHook)
- `packages/api-core/src/moleculer/moleculerConfig.template.ts` (W-5)
- `examples/m9s-example/src/application/IngestProcessWorkflow.ts` (W-6 NEW)
- `examples/m9s-example/src/services/ingest/lifecycle.ts` (W-7)
- `examples/m9s-example/src/services/workflows/ingest-process.workflow.ts` (W-7 DELETE)
- `examples/m9s-example/src/index.ts` (W-7 — possibly remove import)
- `package.json` root (W-8 devDep eslint-plugin-boundaries)
- `.eslintrc.cjs` (W-8 extend)
- `.changeset/sprint-3-1-workflows-eslint-boundaries.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 | PRD | based_on |
| RFC-001 (Moleculer workflows integration design) | RFC | based_on |
| ADR-002 (Hex enforcement) | ADR | informs (W-8) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (§R-4 stub deferred → теперь implemented) |
| SPEC-002 (Sprint 2 checklist) | Spec | informs (Sprint 2 stub → Sprint 3.1 finalize) |
| EVID-003 (Sprint 2 complete) | Evidence | informs |

> **Next step**: после approve SPEC-003 — Sprint 3.1 implementation team на feat/sprint-3-1-workflows.



