---
depth: standard
id: SPEC-002
kind: spec
last_modified_at: 2026-05-05T08:55:30.587187+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
status: active
title: Sprint 2 — Decomposition Phase A checklist (api-core subpaths + workflow contracts + tsconfig migration)
---

---
id: SPEC-002
title: "Sprint 2 — Decomposition Phase A checklist (api-core subpaths + workflow contracts + tsconfig migration)"
status: draft
author: explosivebit
created: 2026-05-05
updated: 2026-05-05
prd_ref: PRD-001
adr_ref: ADR-003
type: implementation-checklist
depth: standard
---

# SPEC-002: Sprint 2 — Decomposition Phase A checklist

## Summary

Implementation checklist для Sprint 2 Phase A per ADR-003 (после amendment 2026-05-05). Декомпозиция `@gertsai/api-core` через subpath exports без physical move (barrel reexports), миграция `tsconfig.base.json` на `Bundler` resolution, добавление neutral workflow contracts в `@gertsai/core`, миграция consumers (api-rlr, m9s-example) на subpath imports, hex enforcement enable.

**Sprint 2 — preрequisite**: Sprint 1 done (commit 1f8494e), smoke GREEN (EVID-002).

## Scope

**In-scope** (12 items):

1. **T-1**: `tsconfig.base.json` migration — `moduleResolution: Bundler` (PREREQUISITE для exports работы).
2. **T-2**: `packages/core/src/workflow/` — NEW neutral platform contracts (WorkflowDefinition/Run/Signal/State/StepResult, EventEnvelope).
3. **T-3**: `packages/api-core/src/contracts/index.ts` barrel — reexport из existing lib/error, lib/apiResponse, envelope, openapi.
4. **T-4**: `packages/api-core/src/moleculer/index.ts` barrel — reexport из existing controller, service, config, queue, channel, oauth, gateway.
5. **T-5**: `packages/api-core/src/moleculer/workflow/` — NEW setWorkflows API (initially stub), типизирован через @gertsai/core neutral contracts.
6. **T-6**: `packages/api-core/src/runtime/node/index.ts` — extract loadConfig + createGcpLogger в этот subpath (move existing factories, не дублирование).
7. **T-7**: `packages/api-core/package.json exports` field с тремя subpaths.
8. **T-8**: `packages/api-core/src/index.ts` root — deprecated reexports с JSDoc `@deprecated Use '@gertsai/api-core/{subpath}' instead`.
9. **T-9**: Stale `paths` cleanup во всех 14 `packages/*/tsconfig.json` + `examples/m9s-example/tsconfig.json`.
10. **T-10**: Consumer migration — `api-rlr` импорты на `@gertsai/api-core/contracts`.
11. **T-11**: Consumer migration — `m9s-example` импорты на subpaths (contracts + moleculer).
12. **T-12**: Hex enforcement (per ADR-002) — `.dependency-cruiser.cjs` config + ESLint `no-restricted-imports` для root api-core path.

**Out-of-scope** (откладывается на Sprint 3 / Wave-N):

- ❌ Physical move файлов из `packages/api-core/src/lib/error/` в `src/contracts/error/` — Sprint 2 использует barrel reexports (per I-12 amendment); physical move в Sprint 3 если нужно.
- ❌ ESLint `eslint-plugin-boundaries` IDE-side — установка/конфиг в Sprint 3 (CI gate через dep-cruiser достаточно для первой итерации).
- ❌ `@gertsai/api-moleculer` физический split — Phase B, отдельный ADR (per I-8).
- ❌ Migration `gertsai_codex` consumer — отдельная сессия (per CLAUDE.md красная линия).
- ❌ npm publish — требует explicit user `Y`.

## Data Models

### `tsconfig.base.json` shape (T-1)

```jsonc
{
  "compilerOptions": {
    // BEFORE:
    // "module": "CommonJS",
    // "moduleResolution": "node",

    // AFTER (Bundler):
    "module": "Preserve",          // Bundler-friendly, не enforce'ит .js extensions
    "moduleResolution": "Bundler", // читает package.json exports field
    // ... остальные опции unchanged
  }
}
```

**Per-package overrides**: уже на Bundler — `examples/m9s-example/tsconfig.json` (после smoke). Остальные 13 — наследуют root.

### `packages/core/src/workflow/` shape (T-2)

```typescript
// packages/core/src/workflow/types.ts
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly version: number;
  readonly handler: (input: TInput, signal: WorkflowSignal) => Promise<TOutput>;
}

export interface WorkflowRun<TInput = unknown> {
  readonly runId: string;
  readonly workflowName: string;
  readonly input: TInput;
  readonly startedAt: Date;
  readonly state: WorkflowState;
}

export type WorkflowState =
  | { kind: 'pending' }
  | { kind: 'running'; step: string }
  | { kind: 'completed'; result: unknown }
  | { kind: 'failed'; error: string }
  | { kind: 'cancelled'; reason: string };

export interface WorkflowSignal {
  readonly runId: string;
  readonly abort: AbortSignal;
  // Future: heartbeat, status update, child workflow spawn
}

export interface WorkflowStepResult<T = unknown> {
  readonly step: string;
  readonly result: T;
  readonly durationMs: number;
}

// packages/core/src/workflow/index.ts — barrel
export * from './types';
```

Add to `packages/core/src/index.ts`:
```typescript
export * from './workflow';
```

### `packages/api-core/src/contracts/index.ts` shape (T-3)

```typescript
// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/contracts
 *
 * Pure TypeScript types and pure functions для API contracts.
 * Zero side effects, zero peer deps на Moleculer/BullMQ/dotenv/GCP.
 * Safe для browser context, FastAPI clients, Rust ts-types.
 */
export * from '../lib/error';
export * from '../lib/apiResponse';
export * from '../lib/envelope';     // если существует
export * from '../lib/openapi';       // если существует
// Add others as discovered through audit
```

### `packages/api-core/src/moleculer/index.ts` shape (T-4)

```typescript
// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/moleculer
 *
 * Moleculer-specific runtime: ApiController, queues (BullMQ), channels, workflows, gateway.
 * Lazy-init; zero module-load side effects.
 * Peer deps: moleculer, bullmq, @moleculer/channels, @moleculer/workflows.
 */
export * from '../lib/controller';
export * from './controller';   // если есть
export { createApiService } from '../api/service';
export { createMoleculerConfig } from './moleculerConfig.template';
export { createGcpLoggerStream } from './moleculerConfig.template'; // moves to runtime/node после Sprint 3
// channels, queues, oauth — existing helpers
export * from './workflow';     // T-5 NEW setWorkflows
```

### `packages/api-core/src/moleculer/workflow/` shape (T-5)

```typescript
// packages/api-core/src/moleculer/workflow/types.ts
import type { WorkflowDefinition } from '@gertsai/core/workflow';

/**
 * Map of workflow name → WorkflowDefinition.
 * Used by ApiController.setWorkflows() to register workflows на broker.
 */
export type WorkflowRegistration = Record<string, WorkflowDefinition>;

// packages/api-core/src/moleculer/workflow/setWorkflows.ts
import type { WorkflowRegistration } from './types';

/**
 * Register workflows на ApiController.
 *
 * IMPLEMENTATION STATUS: experimental stub (ADR-003 §R-4).
 * Wires workflows через @moleculer/workflows mixin когда implementation матуреет.
 * Currently: validates definitions + logs warning if @moleculer/workflows не установлен.
 */
export function setWorkflowsStub(controller: unknown, workflows: WorkflowRegistration): void {
  // TODO: integrate с ApiController.setChannels-like pattern когда @moleculer/workflows stable.
  // For Phase A: validate definitions structure + console.warn experimental status.
  if (!workflows || typeof workflows !== 'object') {
    throw new Error('setWorkflows: workflows must be a non-null object');
  }
  console.warn('[setWorkflows] Workflows API is experimental in Wave 2. See ADR-003 §R-4.');
  // Real implementation в Phase A2 / Wave 3.
}

// packages/api-core/src/moleculer/workflow/index.ts
export * from './types';
export { setWorkflowsStub as setWorkflows } from './setWorkflows';
```

### `packages/api-core/src/runtime/node/` shape (T-6)

```typescript
// packages/api-core/src/runtime/node/index.ts
// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/runtime/node
 *
 * Node.js-specific factories. Opt-in side effects (только при явном вызове).
 * Peer deps: dotenv, @google-cloud/logging.
 */
export { loadConfig } from './config';   // move from current location
export { createGcpLoggerStream } from './logger';  // move from src/moleculer/moleculerConfig.template
```

(Реализация: existing files создаются в `src/runtime/node/config.ts` + `src/runtime/node/logger.ts` через barrel reexports или physical move per worker decision.)

### `packages/api-core/package.json` exports (T-7)

```json
{
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./contracts": {
      "types": "./dist/src/contracts/index.d.ts",
      "default": "./dist/src/contracts/index.js"
    },
    "./moleculer": {
      "types": "./dist/src/moleculer/index.d.ts",
      "default": "./dist/src/moleculer/index.js"
    },
    "./runtime/node": {
      "types": "./dist/src/runtime/node/index.d.ts",
      "default": "./dist/src/runtime/node/index.js"
    },
    "./package.json": "./package.json"
  }
}
```

### Root `packages/api-core/src/index.ts` (T-8)

```typescript
// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core
 *
 * Legacy root export — backward compat для v0.1.x consumers.
 * NEW CODE: импортите из subpaths:
 *   - @gertsai/api-core/contracts   — pure types (APIError, ResponseCode, envelope, openapi)
 *   - @gertsai/api-core/moleculer    — Moleculer runtime (ApiController, queues, channels, workflows)
 *   - @gertsai/api-core/runtime/node — Node side-effects (loadConfig, createGcpLoggerStream)
 *
 * @deprecated Root export will warn в v0.3.x и stop в v1.0.0. Use subpaths.
 */
export * from './contracts';
export * from './moleculer';
// Note: runtime/node НЕ reexport'нут из root (eager dotenv/gcp side effects unwanted).
```

### Stale `paths` cleanup (T-9)

```bash
# Find:
grep -rn '"paths"' packages/*/tsconfig.json examples/m9s-example/tsconfig.json

# Expected stale patterns (per smoke finding):
# {
#   "paths": {
#     "@gertsai/api-core": ["../api-core/dist/index.d.ts"]
#   }
# }
# pnpm workspace + symlinks + package.json exports = эти paths не нужны.

# Action: удалить целиком блок `"paths"` если он только дублирует workspace resolution.
```

### Consumer subpath imports (T-10, T-11)

**api-rlr** (T-10):
```typescript
// packages/api-rlr/src/utils/validations.ts
// BEFORE:
import { APIError, ResponseCode } from '@gertsai/api-core';
// AFTER:
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';

// packages/api-rlr/src/errors/RateLimitError.ts — analogously
```

**m9s-example** (T-11):
```typescript
// examples/m9s-example/src/lib/example-controller.ts
// BEFORE:
import { ApiController } from '@gertsai/api-core';
// AFTER:
import { ApiController } from '@gertsai/api-core/moleculer';

// Audit все imports `@gertsai/api-core` в m9s-example/src/ + tests/, переключить на правильный subpath:
// - errors/types/envelope → /contracts
// - ApiController/Service/Config/queue/channel/workflow → /moleculer
// - loadConfig → /runtime/node
```

### Hex enforcement config (T-12)

`.dependency-cruiser.cjs` — пока **только в `examples/m9s-example/`** (per ADR-002 I-5: hex применяется к hex-shaped packages).

```javascript
// examples/m9s-example/.dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: 'no-services-to-infrastructure-direct',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^src/infrastructure/' },
      comment: 'Services must wire infrastructure через composition root, not direct import. ADR-002.'
    },
    {
      name: 'no-domain-to-anything-runtime',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^(src/domain/|node_modules/typescript)' },
      comment: 'Domain depends only on stdlib + @gertsai/core types. ADR-002.'
    },
    {
      name: 'no-application-to-infrastructure',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^src/infrastructure/' },
      comment: 'Application depends only on domain (ports). ADR-002.'
    },
    {
      name: 'no-root-api-core-import',
      severity: 'warn',
      from: { path: '^src/' },
      to: { path: '^@gertsai/api-core$' },
      comment: 'Use subpath imports (@gertsai/api-core/contracts|moleculer|runtime/node). ADR-003.'
    }
  ]
};
```

ESLint `no-restricted-imports` — root `.eslintrc.cjs`:
```javascript
module.exports = {
  rules: {
    'no-restricted-imports': ['warn', {
      paths: [{
        name: '@gertsai/api-core',
        message: 'Use subpath imports: @gertsai/api-core/contracts | /moleculer | /runtime/node. See ADR-003.'
      }]
    }]
  }
};
```

## Acceptance Checklist

### T-1 — tsconfig.base.json Bundler migration

**Acceptance**:
- [ ] `cat tsconfig.base.json | jq '.compilerOptions.moduleResolution'` → `"Bundler"`
- [ ] `pnpm install` зелёный
- [ ] `pnpm build` зелёный для всех 14 packages + m9s-example
- [ ] `pnpm test` зелёный (3488+ tests pass, как baseline после Sprint 1)

**Effort**: 5 min edit + 5 min verify. **Risk**: low (smoke confirmed).

---

### T-2 — Neutral workflow contracts в @gertsai/core

**Acceptance**:
- [ ] Файлы существуют: `packages/core/src/workflow/types.ts`, `packages/core/src/workflow/index.ts`
- [ ] `packages/core/src/index.ts` экспортирует workflow types
- [ ] Types compile без errors
- [ ] `pnpm --filter @gertsai/core build` + `test` зелёные

**Effort**: 30 min. **Risk**: low (новый изолированный модуль).

---

### T-3..T-6 — api-core subpath structure

**Acceptance**:
- [ ] Файлы существуют:
  - `packages/api-core/src/contracts/index.ts`
  - `packages/api-core/src/moleculer/index.ts`
  - `packages/api-core/src/moleculer/workflow/index.ts` + `setWorkflows.ts` + `types.ts`
  - `packages/api-core/src/runtime/node/index.ts`
- [ ] Каждый barrel reexports из правильных existing файлов
- [ ] `pnpm --filter @gertsai/api-core build` зелёный
- [ ] `pnpm --filter @gertsai/api-core test` зелёный (370/370 pass)
- [ ] `node -e "require('@gertsai/api-core/contracts')"` НЕ выводит warnings

**Effort**: 1.5-2 часа (4 subpath barrels + workflow stub). **Risk**: low-medium (build coordination).

---

### T-7 — package.json exports field

**Acceptance**:
- [ ] `cat packages/api-core/package.json | jq '.exports'` соответствует §Data Models §T-7
- [ ] `pnpm dlx publint --strict packages/api-core` — no errors про exports
- [ ] Existing root import `import X from '@gertsai/api-core'` всё ещё работает (compat)
- [ ] Subpath import `import X from '@gertsai/api-core/contracts'` работает

**Effort**: 10 min. **Risk**: low.

---

### T-8 — Root index.ts deprecated reexports

**Acceptance**:
- [ ] `packages/api-core/src/index.ts` reexports из `./contracts` + `./moleculer` (НЕ runtime/node)
- [ ] JSDoc `@deprecated` warning присутствует
- [ ] Existing tests pass без изменений (compat сохранён)

**Effort**: 10 min. **Risk**: zero.

---

### T-9 — Stale paths cleanup

**Acceptance**:
- [ ] `grep -rn '"paths"' packages/*/tsconfig.json examples/*/tsconfig.json` — все остающиеся `paths` имеют explicit comment объясняющий why
- [ ] `pnpm build` зелёный после cleanup
- [ ] `pnpm test` зелёный

**Effort**: 30 min (audit + fix per package). **Risk**: low-medium (per-package verify).

---

### T-10 — api-rlr subpath migration

**Acceptance**:
- [ ] `grep -rn "from '@gertsai/api-core'" packages/api-rlr/src/` → 0 root imports (все на subpaths)
- [ ] `pnpm --filter @gertsai/api-rlr build` зелёный
- [ ] `pnpm --filter @gertsai/api-rlr test` зелёный (289 passed / 48 skipped baseline)

**Effort**: 15 min. **Risk**: low.

---

### T-11 — m9s-example subpath migration

**Acceptance**:
- [ ] `grep -rn "from '@gertsai/api-core'" examples/m9s-example/src/ examples/m9s-example/tests/` → 0 root imports
- [ ] `pnpm --filter m9s-example typecheck` зелёный
- [ ] `pnpm --filter m9s-example test` зелёный (12 passed / 1 skipped baseline)
- [ ] `pnpm --filter m9s-example dev` boots, REST endpoints respond

**Effort**: 30-45 min (audit larger surface). **Risk**: low-medium.

---

### T-12 — Hex enforcement (m9s-example)

**Acceptance**:
- [ ] `examples/m9s-example/.dependency-cruiser.cjs` существует с 4 rules per §Data Models §T-12
- [ ] `pnpm dlx dependency-cruiser examples/m9s-example/src/` runs без errors на текущем коде (baseline green)
- [ ] Root `.eslintrc.cjs` имеет `no-restricted-imports` rule для `@gertsai/api-core`
- [ ] Synthetic test (manually): добавить violating import → dep-cruiser должен fail (не committed, только smoke)

**Effort**: 30-45 min (config + test). **Risk**: low-medium.

---

## Sprint 2 acceptance bundle

Sprint 2 считается **завершённым**, когда:

1. ✅ Все 12 acceptance check-boxes выше отмечены.
2. ✅ `pnpm install` зелёный, no new warnings.
3. ✅ `pnpm build` (все 14 + m9s-example) зелёный.
4. ✅ `pnpm test` зелёный (≥3488 passed).
5. ✅ `pnpm typecheck` зелёный.
6. ✅ `pnpm dlx publint --strict packages/api-core` — no errors про exports field.
7. ✅ EVID-003 создан с structured fields (verdict, CL3, measurement) + linked SPEC-002 + ADR-003.
8. ✅ Один commit-набор / single PR (или несколько mini-commits если worker'ы делают phased).
9. ✅ Changeset entry `feat: Sprint 2 — api-core decomposition Phase A` (minor bump для api-core, api-rlr, core, m9s-example).

После Sprint 2 — `npm publish` НЕ выполняется автоматически.

## Risks (Sprint 2)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | tsconfig migration ломает edge package (typia / ts-patch related) | Low | Medium | Per-package build verify в T-1; rollback к node + per-consumer override |
| R-2 | Stale paths cleanup выявляет hidden imports | Medium | Low | Per-package build/test после edit |
| R-3 | Worker conflict при параллельной работе (api-core barrel structure pa) | Low | Medium | Sequence: T-1 → (T-2 ∥ T-3..T-8) → (T-9 ∥ T-10 ∥ T-11) → T-12 |
| R-4 | setWorkflows stub оказывается слишком абстрактным; consumers ожидают real implementation | Low | Low | Documented as experimental в ADR-003 §R-4; full implementation в Phase A2 / Wave 3 |
| R-5 | Dep-cruiser config правила слишком строгие; legitimate refactors blocked | Low | Low | Initial mode `severity: warn` для new rule; escalate to error в follow-up |

## Implementation Plan — sequenced для AgentTeams parallelism

Phases с conflict-free worker scope:

### Phase 1 (sequential prereq, ~10 min)
- **T-1** by **team-lead**: `tsconfig.base.json` bump → Bundler. Verify install + build + test зелёные.

### Phase 2 (parallel, ~1-1.5 часа, 3 disjoint workers)
- **T-2** by **core-workflow-worker**: `packages/core/src/workflow/**` + index.ts export.
- **T-3..T-8** by **api-core-decomposer**: `packages/api-core/src/**` (contracts + moleculer + runtime/node barrels + workflow stub + package.json exports + root deprecation).
- **T-9** by **tsconfig-cleaner**: stale `paths` audit + cleanup в `packages/*/tsconfig.json` + `examples/m9s-example/tsconfig.json`.

### Phase 3 (parallel, ~1 час, 2 disjoint workers — depend on Phase 2)
- **T-10** by **api-rlr-migrator**: `packages/api-rlr/src/**` subpath imports.
- **T-11** by **m9s-migrator**: `examples/m9s-example/src/** + tests/**` subpath imports.

### Phase 4 (sequential, ~30 min)
- **T-12** by **team-lead**: `.dependency-cruiser.cjs` + ESLint config.

### Phase 5 (sequential, ~30 min)
- **team-lead**: full repo verify (build/test/typecheck/publint).
- **team-lead**: changeset + atomic commit (or 2-3 commits per phase для cleaner history).
- **team-lead**: EVID-003 create + link + activate ADR-003 + activate SPEC-002.

**Total estimated time**: 3.5-4 часа wall-clock с parallelism.

## Affected Files (full list)

- `tsconfig.base.json` (T-1)
- `packages/core/src/workflow/types.ts` (T-2 NEW)
- `packages/core/src/workflow/index.ts` (T-2 NEW)
- `packages/core/src/index.ts` (T-2 export)
- `packages/api-core/src/contracts/index.ts` (T-3 NEW)
- `packages/api-core/src/moleculer/index.ts` (T-4 NEW)
- `packages/api-core/src/moleculer/workflow/types.ts` (T-5 NEW)
- `packages/api-core/src/moleculer/workflow/setWorkflows.ts` (T-5 NEW)
- `packages/api-core/src/moleculer/workflow/index.ts` (T-5 NEW)
- `packages/api-core/src/runtime/node/index.ts` (T-6 NEW)
- `packages/api-core/src/runtime/node/config.ts` (T-6 — extract loadConfig)
- `packages/api-core/src/runtime/node/logger.ts` (T-6 — extract createGcpLoggerStream)
- `packages/api-core/package.json` (T-7 exports)
- `packages/api-core/src/index.ts` (T-8 deprecated reexports)
- `packages/*/tsconfig.json` × 14 (T-9 stale paths cleanup)
- `examples/m9s-example/tsconfig.json` (T-9)
- `packages/api-rlr/src/utils/validations.ts` (T-10 subpath)
- `packages/api-rlr/src/errors/RateLimitError.ts` (T-10 subpath)
- `examples/m9s-example/src/**` (T-11 subpath audit)
- `examples/m9s-example/tests/**` (T-11 если есть `@gertsai/api-core` imports)
- `examples/m9s-example/.dependency-cruiser.cjs` (T-12 NEW)
- `.eslintrc.cjs` (root, T-12)
- `.changeset/sprint-2-decomposition-phase-a.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 | PRD | based_on |
| ADR-003 (Platform Runtime Boundaries) | ADR | based_on (Sprint 2 — Phase A implementation) |
| ADR-002 (Hex layer enforcement) | ADR | informs (T-12 implements ADR-002 в m9s-example) |
| SPEC-001 (Sprint 1 hygiene) | Spec | informs (Sprint 1 = preрequisite) |
| EVID-001 (Sprint 1 fixes applied) | Evidence | informs (foundation для Sprint 2) |
| EVID-002 (smoke typia + subpath) | Evidence | informs (доказывает что Phase A safe) |
| docs/dd.md | external doc | informs |

> **Next step**: после approve этого SPEC-002 — запустить Sprint 2 implementation team (Phase 1 → 2 → 3 → 4 → 5).





