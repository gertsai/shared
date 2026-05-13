---
depth: standard
id: RFC-012
kind: rfc
last_modified_at: 2026-05-13T23:12:52.731983+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-017
  relation: refines
status: active
title: Wave 9.0.1 strategy — replace schema literal with typia + autoAliases /openapi route + diagnose e2e
---

# RFC-012: Wave 9.0.1 strategy — direct team-lead implementation (no AgentsTeam)

## Summary

Wave 9.0.1 has 3 small surgical fixes. Direct team-lead implementation (no AgentsTeam) — scope is too small for parallel teammates (~150 LOC total, all in same file region or with tight coupling). Standard depth: PRD-017 + this RFC + EVID-032. Single branch `chore/wave-9-0-1-maintenance` chained on post-PR-#15 main.

## Motivation

AgentsTeam pattern proven for Wave 7.4 / 7.5 / 8.1 / 8.3 / 9 (3+ teammates, disjoint files). Wave 9.0.1's three fixes:

1. Schema typia replacement — single file `src/openapi/schema.ts`
2. Route fix — single file `src/mol-services/api.service.ts`
3. e2e diagnostic — likely 1-2 files in action handler chain

All three CAN coexist in disjoint file ownership BUT total LOC ~150 falls below the AgentsTeam efficient minimum (typically 100+ per teammate). 3 teammates × 50 LOC = orchestration overhead exceeds parallel gain. Single-brain direct implementation faster.

## Goals

- **RG-1** — Close all 3 EVID-031 §Wave 9.0.1 items in single PR
- **RG-2** — Live `GET /openapi/schema.json` verified end-to-end (curl + jq)
- **RG-3** — Strict floor + lint + check all green
- **RG-4** — Backwards compat: 9 openapi-schema tests + 6 currently-passing e2e tests + 56 other tests = 71 tests pass (target: NEW result 71/71 after Wave 9.0.1 fix vs Wave 9 status 69/71)
- **RG-5** — Audit trail closure on EVID-031 deferred-items table

## Non-Goals

- Promoting api-types pkg to shared monorepo (Wave 11+ separate decision)
- Wave 10 features (separate PRD-016 → PRD-018+ flow)
- Refactoring beyond the 3 targeted fixes (e.g. extract route layout to constants — out of scope)

## Options Considered

### Option A — Direct team-lead implementation (CHOSEN)

**Description**: Team-lead implements 3 fixes sequentially on `chore/wave-9-0-1-maintenance` branch. Smoke after each fix. EVID + activate + commit + PR.

**Pros**: Fastest path (no teammate spawn overhead). Tight coordination between fixes (e.g. typia call uses correct ApiEndpoints shape, route fix references typia output). Single review surface.

**Cons**: Sequential execution (no parallelism). Maximum wall-clock ~30 min.

### Option B — 3 teammates each owning 1 fix

**Description**: AgentsTeam: A (typia), B (route), C (e2e diagnostic).

**Pros**: Parallel; familiar pattern from Wave 7-9.

**Cons**: ~50 LOC per teammate violates AgentsTeam efficient minimum. Orchestration overhead > parallel gain.

### Option C — Defer e2e fix to Wave 9.0.2 separate sprint

**Description**: Wave 9.0.1 = items 1+2 only. e2e diagnostic spun off.

**Pros**: Smaller blast radius per sprint.

**Cons**: Splits EVID-031 deferred-items table across 2 PRs. e2e diagnostic might surface action-handler issue that informs the route fix design — coupling lost.

**Decision**: Option A. Single sprint, direct implementation, single PR.

## Proposed Direction

### Phase 1 — typia auto-derive replacement (~50 LOC delta)

`src/openapi/schema.ts` REPLACE entire body with:

```ts
// SPDX-License-Identifier: Apache-2.0
import typia from 'typia';
import {
  generateOpenAPISchema,
  type OpenApiMapper,
  type ApiEndpointsGenerator,
} from '@gertsai-examples/m9s-example-api-types/openapi';

import config from '../../project.config';

// Import action namespaces — typia introspects their action `register`
// shapes to derive request/response types.
import * as IngestEndpoints from '../services/ingest';
import * as SearchEndpoints from '../services/search';

type ApiEndpoints = typeof IngestEndpoints & typeof SearchEndpoints;

export function buildOpenApiSchema() {
  const schema = typia.json.schema<
    OpenApiMapper<ApiEndpointsGenerator<ApiEndpoints>>,
    '3.1'
  >();

  return generateOpenAPISchema({
    schema,
    servers: [{ url: `http://localhost:${config.WEB_SERVER_PORT}`, description: 'Local dev' }],
    info: {
      title: 'm9s-example',
      version: config.APP_VERSION,
      description: '`@gertsai/*` reference application — Wave 9 full-stack pattern',
    },
  });
}
```

**Risk validation**: existing 9 openapi-schema tests MUST still pass. If typia generates structurally different output (e.g. different `$ref` style, missing description fields), either update tests OR adjust generic parameters. PRD-017 R-1 anticipates this.

**Fallback if typia generic doesn't resolve to a valid OpenAPI**: keep Wave 9 hand-curated `buildOpenApiSchema()` as `buildOpenApiSchemaLegacy()` exported alongside. Document divergence in EVID-032. Re-prioritize for Wave 9.0.2 with deeper typia investigation.

### Phase 2 — /openapi HTTP route fix (~20 LOC delta)

`src/mol-services/api.service.ts`: REPLACE the static `/openapi` route handler (lines 121-147 approx — the inline `aliases: { 'GET /': (_req, res) => {...} }`) with a proper route:

```ts
{
  path: '/openapi',
  autoAliases: true,
  bodyParsers: {
    json: { strict: false, limit: '1MB' },
  },
  // v2.openapi.schema.aggregated has rest: 'GET /schema.json'
  // v2.openapi.schema.local has rest: 'GET /schema.local.json'
  // autoAliases maps both into this route.
  whitelist: ['v2.openapi.**'],
  authentication: false,
  authorization: false,
},
```

Static placeholder JSON deleted. Live curl smoke:

```bash
pnpm --filter @gertsai-examples/m9s-example dev &
sleep 8
curl -sf http://localhost:3031/openapi/schema.json | jq '.openapi, .info.title, (.paths | keys)'
# Expected: "3.1.0", "m9s-example", ["/api/v1/ingest/document", "/api/v1/search/query"]
```

### Phase 3 — e2e session-guard diagnostic + fix

Read failing test bodies. Investigate action handler chain — likely `ingest-document.action.ts` catch block missing `instanceof AuthenticationRequiredError` / `TenantScopeViolationError` mapping to APIError. Mirror Wave 8.2 ValidationError pattern from `search-query.action.ts`.

Steps:

1. Run failing tests in isolation: `pnpm test e2e -t "destroyed session"`
2. Read stack trace + assertion
3. Verify action handler catches AuthenticationRequiredError + TenantScopeViolationError and re-throws as APIError(UNAUTHORIZED) / APIError(FORBIDDEN)
4. If missing, add catch block per Wave 8.2 pattern
5. Re-run tests, verify PASS

If root cause is deeper (e.g. sessionMiddleware preprocessing), defer to Wave 9.0.2 separate sprint and document in EVID-032 as "root cause not in action handler — needs broader investigation". Don't expand Wave 9.0.1 scope.

### Phase 4 — Smoke + EVID + ship

```bash
pnpm --filter @gertsai-examples/m9s-example exec tspc --noEmit                # 0
pnpm --filter @gertsai-examples/m9s-example test                              # 71/71
pnpm --filter @gertsai-examples/m9s-example build                             # 0
pnpm --filter @gertsai-examples/m9s-example-api-types build                   # 0 (unchanged)
pnpm --filter @gertsai-examples/m9s-example-web check                         # 0 (unchanged)
pnpm lint                                                                     # 0
# Live curl smoke per Phase 2
```

Single feat-fix-fix commit OR three small commits if logical separation helps PR review. Activate PRD-017 + RFC-012 + EVID-032.

## Invariants

- **I-1** — All Wave 9 invariants preserved (SvelteKit web + api-types pkg untouched)
- **I-2** — Wave 8.x invariants preserved (composition facade, shared/errors kernel, hex inversion, embedder DI)
- **I-3** — SPEC-019 OpenAPI contract shape maintained — if typia output diverges, SPEC-019 updated separately (additive change, no breaking)
- **I-4** — Strict floor: tsc + lint + check all 0 errors
- **I-5** — 9 openapi-schema tests still PASS (regression guard for SPEC-019 conformance)
- **I-6** — No @gertsai/* package source modification — Wave 9.0.1 is m9s-example backend only
- **I-7** — Wave 10 PRD-016 stub untouched

## Acceptance Test (per PRD-017 FRs)

- FR-1 ✓ — `src/openapi/schema.ts` body is the typia call (no hardcoded literal)
- FR-2 ✓ — `ApiEndpoints` types imported from services barrels
- FR-3 ✓ — `api.service.ts` route layout has `/openapi` with `whitelist: ['v2.openapi.**']` and autoAliases; static handler deleted
- FR-4 ✓ — failing e2e tests now PASS (or scope-deferred to 9.0.2 with documented root cause)
- FR-5 ✓ — `pnpm test` 71/71 (or 69/71 if e2e deferred — explicit decision recorded in EVID-032)

## Rollback Plan

- **Tactical revert**: single `git revert <merge-commit>` restores Wave 9 hand-curated state. Re-introduces all 3 issues per EVID-031 but stable
- **Partial revert** (only Phase 1 or 2 stays): clean rollback per file — phases are loosely coupled

## Risks (delta vs PRD-017)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | Phase 3 e2e root cause requires changes outside m9s-example backend (e.g. session-guard package) | Defer to Wave 9.0.2 separate sprint per Option C fallback |
| RFC-R-2 | typia generic syntax error / missing transform | Verify `tspc` postinstall ran (ls `node_modules/typia`); confirm `tsconfig.json` typia plugin present |
| RFC-R-3 | autoAliases on /openapi route conflicts with existing /api/v1 autoAliases (route ordering) | moleculer-web matches routes by path prefix; /openapi and /api/v1 are disjoint — no conflict expected. Smoke confirms |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-017 | refines |
| EVID-031 | informs — Wave 9 ship evidence flagged these items |
| PRD-015 / SPEC-019 / ADR-014 | informs — Wave 9 parent |
| EVID-032 (next) | informs — Wave 9.0.1 ship evidence



