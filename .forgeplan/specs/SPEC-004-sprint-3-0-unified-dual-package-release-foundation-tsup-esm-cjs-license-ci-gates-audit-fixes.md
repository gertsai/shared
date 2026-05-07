---
depth: standard
id: SPEC-004
kind: spec
last_modified_at: 2026-05-05T12:13:00.213829+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
- target: ADR-003
  relation: refines
status: active
title: Sprint 3.0 — Unified dual-package release foundation (tsup ESM+CJS + license + CI gates + audit fixes)
---

---
id: SPEC-004
title: "Sprint 3.0 — Unified dual-package release foundation"
status: draft
author: explosivebit
created: 2026-05-05
updated: 2026-05-05
prd_ref: PRD-001
adr_ref: ADR-003
audit_ref: audit-pre-sprint-3-1 (5 reviewers, 11+ critical/major findings)
type: implementation-checklist
depth: standard
---

# SPEC-004: Sprint 3.0 — Unified dual-package release foundation

## Summary

Pre-publish hardening sprint адресующий audit-pre-sprint-3-1 findings + устанавливающий **best-practice baseline для первого npm publish** v0.2.0 совместимый с тремя downstream consumers: gertsai_codex (CJS Moleculer pipeline), GertsHub (TypeScript services), external OSS adopters (any).

Ключевое решение: **uniform dual ESM+CJS pattern через `tsup` для всех 14 packages**. Это работает для `import { X } from '@gertsai/api-core/contracts'` (ESM) AND `const { X } = require('@gertsai/api-core/contracts')` (CJS).

Consumer compatibility matrix:

| Consumer | Style | Wave 2 Path |
|----------|-------|-------------|
| gertsai_codex apps/pipeline | CJS Moleculer (legacy) | `require('@gertsai/api-core/moleculer')` → CJS dist |
| GertsHub services | TS+Moleculer modern | `import { ApiController } from '@gertsai/api-core/moleculer'` → ESM dist |
| External OSS / FastAPI clients | Browser/Rust/Go (types only) | `import type { APIError } from '@gertsai/api-core/contracts'` → pure types |

## Scope

**In-scope** (15 task items, organized by phases):

### Phase 1 — Foundation tooling (sequential, team-lead solo, ~30 min)
- **U-1**: Install `tsup`, `@arethetypeswrong/cli`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `dependency-cruiser` в workspace devDeps.
- **U-2**: Create base `tsup.config.ts` template (root) — shared config для всех packages, override per-package если нужно.

### Phase 2 — Package builds migration (4 parallel workers, ~3-4 hours)
- **U-3** (worker tier1-migrator): Migrate Tier 1 packages (`fsm`, `fetch`, `collection`, `m9s-cache`, `ws-rpc`) с tsc → tsup dual ESM+CJS.
- **U-4** (worker tier2-3-migrator): Migrate Tier 2-3 packages (`flux`, `core`, `hsm`) — **core has typia transformer**, требует special tsup config с typia plugin.
- **U-5** (worker tier4-5-migrator): Migrate Tier 4-5 packages (`auth-openfga`, `api-core`, `api-rlr`) — **api-core has typia + typescript-transform-paths** + subpath exports.
- **U-6** (worker existing-dual-aligner): Update existing dual ESM+CJS packages (`llm-costs`, `utils`, `di`) на uniform tsup pattern (replace dual `tsc` calls).

### Phase 3 — Release hygiene (3 parallel workers, ~1 hour)
- **U-7** (worker license-uniformer): License field `"license": "Apache-2.0"` на ВСЕ 14 packages + verify root LICENSE symlinked.
- **U-8** (worker files-restrictor): `"files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"]` на все publishable packages (kill test artifact leaks per audit F-2/F-3/F-4).
- **U-9** (worker ci-builder): GitHub Actions `.github/workflows/ci.yml` extends с jobs: `lint` (eslint), `publint` (publint --strict), `attw` (@arethetypeswrong), `depcruise` (m9s-example).

### Phase 4 — Audit fixes (3 parallel workers, ~1 hour)
- **U-10** (worker diagnostics-fixer): Move `import './builtins'` side-effect из `lib/diagnostics/index.ts` в opt-in `registerBuiltinDiagnostics()` factory (audit F-3).
- **U-11** (worker peer-dep-adder): `@gertsai/api-core` peerDep `@moleculer/workflows` + `peerDependenciesMeta.optional: true` (audit F-1 architect).
- **U-12** (worker rfc-amender): Amend RFC-001 — clarify ApiController hook integration без assumed pre-existing `_attachChannelsToServices` stage (audit F-3 architect).

### Phase 5 — Verify + commit (sequential, team-lead solo, ~1 hour)
- **U-13**: Full repo verify — pnpm install/build/test/typecheck + new lint/publint/attw/depcruise jobs зелёные.
- **U-14**: EVID-004 (Sprint 3.0 hardening evidence) с structured fields + link → SPEC-004 + PRD-001 + ADR-003.
- **U-15**: Atomic commit или phased commits + activate SPEC-004.

**Out-of-scope** (Sprint 3.1+ или later):
- ❌ License legacy oauth2-server v3.1.1 deprecation — Wave 4 follow-up.
- ❌ BYPASS_AUTH escape hatch hardening — Wave 4.
- ❌ Workflow setWorkflows full impl — Sprint 3.1 (RFC-001).
- ❌ Foundation libs extraction (config, tenant, observe, queue) — Sprint 3.2+.
- ❌ Phase B physical split api-moleculer — отложено per ADR-003.

## Data Models

### `tsup.config.ts` template (U-2, root)

```typescript
// tsup.config.ts (root, shared)
import { defineConfig, type Options } from 'tsup';

/**
 * Shared tsup configuration для всех @gertsai/* packages.
 * Per-package configs могут override через `tsup.config.ts` в каждом packages/*.
 */
export const baseTsupConfig: Options = {
  format: ['esm', 'cjs'],     // Dual: emit both .mjs/ESM + .cjs/CJS
  outDir: 'dist',
  dts: true,                   // Generate .d.ts files
  sourcemap: true,             // For debugging
  clean: true,                 // Clean dist before each build
  splitting: false,            // Keep single file per entry
  treeshake: true,
  target: 'node22',            // Node 22 LTS minimum
  external: [/^@gertsai\//],   // Don't bundle workspace deps
};

export default defineConfig(baseTsupConfig);
```

### Per-package `tsup.config.ts` (e.g., api-core с subpaths)

```typescript
// packages/api-core/tsup.config.ts
import { defineConfig } from 'tsup';
import { baseTsupConfig } from '../../tsup.config';

export default defineConfig({
  ...baseTsupConfig,
  entry: {
    'index': 'src/index.ts',
    'contracts/index': 'src/contracts/index.ts',
    'moleculer/index': 'src/moleculer/index.ts',
    'runtime/node/index': 'src/runtime/node/index.ts',
  },
  // typia/typescript-transform-paths plugins via tsup esbuildPlugins:
  esbuildPlugins: [
    // ... typia plugin if available
  ],
});
```

### `package.json` shape (uniform после Sprint 3.0)

```jsonc
{
  "name": "@gertsai/api-core",
  "version": "0.2.0",
  "license": "Apache-2.0",                    // U-7: unified
  "private": false,
  "publishConfig": { "access": "public" },
  "type": "module",                            // U-3..U-6: ESM-default
  "main": "./dist/index.cjs",                  // CJS entry для require()
  "module": "./dist/index.js",                 // ESM entry для import (легаси)
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./contracts": {
      "import": { "types": "./dist/contracts/index.d.ts", "default": "./dist/contracts/index.js" },
      "require": { "types": "./dist/contracts/index.d.cts", "default": "./dist/contracts/index.cjs" }
    },
    "./moleculer": {
      "import": { "types": "./dist/moleculer/index.d.ts", "default": "./dist/moleculer/index.js" },
      "require": { "types": "./dist/moleculer/index.d.cts", "default": "./dist/moleculer/index.cjs" }
    },
    "./runtime/node": {
      "import": { "types": "./dist/runtime/node/index.d.ts", "default": "./dist/runtime/node/index.js" },
      "require": { "types": "./dist/runtime/node/index.d.cts", "default": "./dist/runtime/node/index.cjs" }
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"],   // U-8: kill test leaks
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "sideEffects": false                         // After U-10: contracts truly pure
}
```

### Diagnostics builtins fix (U-10)

```typescript
// packages/api-core/src/lib/diagnostics/index.ts (BEFORE)
import './builtins';        // ← SIDE EFFECT on import

// AFTER
export { DIAGNOSTIC_BUILTINS } from './builtins';   // Just export the data
export { DiagnosticRegistry } from './registry';
export function registerBuiltinDiagnostics(): void {
  DiagnosticRegistry.register(...DIAGNOSTIC_BUILTINS);
}
// Consumer who wants builtins calls registerBuiltinDiagnostics() explicitly.
```

### CI workflow extension (U-9)

```yaml
# .github/workflows/ci.yml (extend existing)
jobs:
  build-test:
    # ... existing
  lint:
    runs-on: ubuntu-latest
    steps:
      - checkout/install/...
      - run: pnpm exec eslint . --max-warnings 0
  publint:
    runs-on: ubuntu-latest
    steps:
      - checkout/install/build
      - run: pnpm dlx publint --strict packages/*
  attw:
    runs-on: ubuntu-latest
    steps:
      - checkout/install/build
      - run: |
          for pkg in packages/*/; do
            pnpm dlx @arethetypeswrong/cli --pack "$pkg" --ignore-rules cjs-resolves-to-esm
          done
  depcruise:
    runs-on: ubuntu-latest
    steps:
      - checkout/install
      - run: pnpm dlx dependency-cruiser examples/m9s-example/src/index.ts
```

## Acceptance Checklist

### U-1: Foundation devDeps installed
- [ ] `pnpm ls -w | grep -E "tsup|arethetypeswrong|eslint|@typescript-eslint|dependency-cruiser"` shows all installed
- [ ] `pnpm-lock.yaml` updated

### U-2: Base tsup config exists
- [ ] `tsup.config.ts` file at repo root
- [ ] exports `baseTsupConfig: Options` reusable

### U-3..U-6: All 14 packages on tsup dual ESM+CJS
- [ ] Each `packages/<pkg>/package.json` has `"type": "module"`
- [ ] Each has `exports` field with `import` + `require` conditions
- [ ] Each has `tsup.config.ts` (extends base)
- [ ] Build script = `tsup` (not `tsc`)
- [ ] `dist/` after build contains both `.js` (ESM) AND `.cjs` (CJS) outputs
- [ ] `dist/` after build contains both `.d.ts` AND `.d.cts` (для types per format)
- [ ] **node CJS smoke**: `node -e "require('./packages/<pkg>/dist/index.cjs')"` succeeds (no SyntaxError)
- [ ] **node ESM smoke**: `node --input-type=module -e "import('./packages/<pkg>/dist/index.js')"` succeeds

### U-7: License Apache-2.0 unified
- [ ] All 14 `package.json` имеют `"license": "Apache-2.0"`
- [ ] Each `packages/<pkg>/LICENSE` exists (symlink на root LICENSE OK)
- [ ] No package имеет `"license": "MIT"` или missing field

### U-8: Files restricted
- [ ] All publishable packages (14) имеют `"files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"]` (или extended для special cases like api-rlr Lua scripts)
- [ ] `pnpm pack --dry-run packages/<pkg>` показывает 0 test files

### U-9: CI gates active
- [ ] `.github/workflows/ci.yml` имеет 4 new jobs (lint, publint, attw, depcruise)
- [ ] Все 4 пройдут на текущем коде (после Phase 4 fixes)
- [ ] Branch protection — добавление этих job'ов как required checks (post-PR-merge)

### U-10: Diagnostics opt-in
- [ ] `packages/api-core/src/lib/diagnostics/index.ts` НЕ имеет `import './builtins'` side-effect
- [ ] Exports `registerBuiltinDiagnostics()` function
- [ ] `node -e "require('@gertsai/api-core/contracts')"` НЕ triggers DiagnosticRegistry.register
- [ ] `package.json sideEffects: false` для api-core can be set safely

### U-11: api-core peer dep
- [ ] `packages/api-core/package.json` имеет `peerDependencies: { "@moleculer/workflows": "^0.2.0" }` (или соответствующая опубликованная version после verify)
- [ ] `peerDependenciesMeta: { "@moleculer/workflows": { "optional": true } }`

### U-12: RFC-001 amendment
- [ ] RFC-001 имеет section `## Amendment 2026-05-05 — ApiController hook integration clarification`
- [ ] Specifies что `_attachWorkflowsToServices` это **новый** stage (не «после setChannels stage» implying pre-existing pipeline)
- [ ] Sprint 3.1 W-4 будет implementing новый stage pattern, not extending existing

### U-13: Full repo verify
- [ ] `pnpm install` зелёный
- [ ] `pnpm build` зелёный (14 + m9s-example, dual ESM+CJS outputs)
- [ ] `pnpm test` зелёный (3488+ passed)
- [ ] `pnpm typecheck` зелёный
- [ ] `pnpm exec eslint .` 0 errors
- [ ] `pnpm dlx publint --strict packages/*` 0 errors
- [ ] `pnpm dlx @arethetypeswrong/cli --pack packages/*` clean (allowing cjs-resolves-to-esm where intended)
- [ ] m9s-example dep-cruiser clean

### U-14: EVID-004 created
- [ ] EVID-004 with structured fields (verdict=supports, CL3, measurement)
- [ ] Linked to SPEC-004 + PRD-001 + ADR-003
- [ ] Documents convergent audit fixes

### U-15: Activation + commit
- [ ] SPEC-004 activated (R_eff > 0)
- [ ] Atomic commits per phase (5 commits) или single squash
- [ ] Changeset entry `feat: sprint 3.0 — unified dual-package release foundation`

## Sprint 3.0 acceptance bundle

Sprint 3.0 завершён, когда:

1. ✅ Все 15 U-items checklist отмечены.
2. ✅ Full repo build зелёный с dual outputs.
3. ✅ All 14 packages publish-ready: `pnpm pack --dry-run packages/<pkg>` clean (no test files).
4. ✅ CI gates: 4 new jobs зелёные.
5. ✅ Both `import` AND `require()` from any subpath работают для api-core.
6. ✅ EVID-004 linked + activated SPEC-004.
7. ✅ Documented changeset entry для v0.2.0.

После Sprint 3.0 → **publish-ready foundation** для consumers (gertsai_codex, GertsHub, external).

## Risks (Sprint 3.0)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | tsup не handles typia transformer (api-core, core) | Medium | High | Test early на core (U-4); если фейл — keep tspc для core/api-core, tsup для остальных |
| R-2 | Subpath exports tsup multiple entries не работают консистентно | Low | Medium | Verify per-package с small smoke (require + import) |
| R-3 | dual ESM+CJS in some package breaks downstream consumer | Low | High | publint + attw catch это; CI gates required check |
| R-4 | Package size growth (dual outputs) | Low | Low | Acceptable — both formats нужны |
| R-5 | Sprint 3.0 scope creep если найдём ещё issues | Medium | Medium | Strict scope в этом SPEC; новые findings → Sprint 3.x |

## Implementation Plan — sequenced для AgentTeams

### Phase 1 (sequential, ~30 min, team-lead solo)
1. team-lead installs devDeps + creates base tsup.config.ts.

### Phase 2 (parallel, ~3-4 hours, 4 disjoint workers)
**Disjoint scope** — каждый worker трогает только свои packages:
- worker `tier1-migrator`: `packages/{fsm,fetch,collection,m9s-cache,ws-rpc}/**`
- worker `tier2-3-migrator`: `packages/{flux,core,hsm}/**`
- worker `tier4-5-migrator`: `packages/{auth-openfga,api-core,api-rlr}/**`
- worker `existing-dual-aligner`: `packages/{llm-costs,utils,di}/**`

### Phase 3 (parallel, ~1 hour, 3 disjoint workers)
- worker `license-uniformer`: всех 14 `packages/*/package.json` license field + LICENSE files
- worker `files-restrictor`: всех 14 `packages/*/package.json` files field
- worker `ci-builder`: `.github/workflows/ci.yml`

### Phase 4 (parallel, ~1 hour, 3 disjoint workers)
- worker `diagnostics-fixer`: `packages/api-core/src/lib/diagnostics/**`
- worker `peer-dep-adder`: `packages/api-core/package.json` (только peer dep changes — не conflicts с files/license workers если они в Phase 3 already done)
- worker `rfc-amender`: `.forgeplan/rfcs/RFC-001-*.md`

### Phase 5 (sequential, ~1 hour, team-lead solo)
1. Verify all gates.
2. Create EVID-004.
3. Commit (atomic or per-phase).
4. Activate SPEC-004.

## Affected Files (full list)

- `package.json` (root) — devDeps add (U-1)
- `tsup.config.ts` (root, NEW) (U-2)
- `pnpm-lock.yaml` (regenerated)
- `packages/*/package.json` × 14 (U-3..U-8: type, main, module, exports, files, license, scripts)
- `packages/*/tsup.config.ts` × 14 NEW (U-3..U-6)
- `packages/*/LICENSE` × 14 (some may need symlink) (U-7)
- `packages/api-core/src/lib/diagnostics/index.ts` (U-10)
- `packages/api-core/src/lib/diagnostics/builtins.ts` (verify export structure for U-10)
- `.github/workflows/ci.yml` (U-9)
- `.forgeplan/rfcs/RFC-001-*.md` (U-12 amendment)
- `.changeset/sprint-3-0-unified-release-foundation.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 | PRD | based_on |
| ADR-003 | ADR | refines (subpath exports теперь dual) |
| ADR-002 | ADR | informs (eslint/dep-cruiser теперь актуально wired) |
| RFC-001 | RFC | amendment (U-12) |
| SPEC-002 | Spec | informs (Sprint 2 fixes) |
| SPEC-003 | Spec | informs (Sprint 3.1 — будет реализован после Sprint 3.0) |
| EVID-001/002/003 | Evidence | informs (foundation context) |
| audit-pre-sprint-3-1 (5 reviewers) | external | informs (drives SPEC-004 scope) |

> **Next step**: Phase 1 (foundation tooling) — start now.





