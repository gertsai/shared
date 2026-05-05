---
depth: standard
id: EVID-006
kind: evidence
last_modified_at: 2026-05-05T20:19:01.005026+00:00
last_modified_by: claude-code/2.1.128
links:
- target: SPEC-005
  relation: informs
- target: PRD-001
  relation: informs
- target: EVID-005
  relation: informs
- target: ADR-002
  relation: informs
- target: ADR-003
  relation: informs
status: active
title: Sprint 3.0.1 complete — pre-publish hardening shipped (audit-pre-sprint-3-2 convergent fixes)
---

# EVID-006: Sprint 3.0.1 complete — pre-publish hardening (audit-pre-sprint-3-2 convergent fixes)

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.0.1 (SPEC-005) — convergent fix sprint inserted between Sprint 3.1 ship and v0.2.0 publish per audit-pre-sprint-3-2 (Group 21 pattern). 11 task items (F-1..F-11) across 3 disjoint AgentTeams workers + team-lead Phase B verify. All convergent (≥2 reviewers) findings + 1 critical type-system leak (F-T-1) addressed. ~30 min wall-clock via 3∥ AgentTeams + Phase B verify.

**Architect NO-GO scope critical (F-A-1 observe→otel rename, F-A-2 database→pg-client, F-A-3 drop auth-moleculer)** — addressed in SEPARATE follow-up: PRD-001 amendment + ADR-012 before Sprint 3.2 starts. EVID-006 covers ONLY type-system + DX + publish hardening.

**Branch**: `feat/api-core-decomposition` (Sprint 2 + Sprint 3.0 + Sprint 3.1 + Sprint 3.0.1 combined; **14 commits ahead of `main`**).

## Measurement (full repo verify)

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ clean |
| `pnpm build` | ✅ 14 packages + m9s-example green (ESM+CJS+dts) |
| `pnpm test` | ✅ **4051 passed / 102 skipped** (Sprint 3.1 baseline 4048 + 3 new core tests for F-9 WorkflowSignalMeta) |
| `pnpm typecheck` | ✅ **15/15** workspaces (was silently skipping 5+; F-8 closed) |
| `pnpm run lint` | ✅ All good (`.forgeplan-web/` ignore added) |
| `pnpm run publint` | ✅ All good (api-core, api-rlr, auth-openfga, hsm) |
| `pnpm run depcruise` | ✅ 0 violations (98 modules, 192 deps cruised) |
| `attw @gertsai/core` | ✅ "No problems found 🌟" — was 5× 💀 in Sprint 3.0 |
| `attw @gertsai/api-core` | ✅ "No problems found 🌟" |
| `grep -c '_registerWorkflow' dist/{,moleculer/}index.d.{ts,cts}` | ✅ all 0 (F-1 leak closed) |

## Implementation evidence per task

### F-1 — Hide `_registerWorkflow` from emitted `.d.ts` (Phase A1, e8e8c95)

`packages/api-core/src/moleculer/workflow/setWorkflows.ts`: introduced `REGISTER_WORKFLOW = Symbol.for('@gertsai/api-core:registerWorkflow')` (cross-realm-stable for ESM/CJS dual-bundle scenarios). `ApiControllerInternalHook` keyed by Symbol so the property does NOT surface as a callable string-keyed member in `.d.ts` (was the type-auditor F-T-1 critical leak — tsup `dts:true` ignores `@internal` JSDoc on `public` members).

`packages/api-core/src/lib/controller/ApiController.class.ts`: `class ApiController implements ApiControllerInternalHook`; class generics (ServiceVersion, ServiceName, ServiceContext, TMeta) preserved.

Verification (post-rebuild):
```
packages/api-core/dist/index.d.ts:0
packages/api-core/dist/index.d.cts:0
packages/api-core/dist/moleculer/index.d.ts:0
packages/api-core/dist/moleculer/index.d.cts:0
```
The Symbol-keyed method emits as `[REGISTER_WORKFLOW](name: string, schema: MoleculerWorkflowSchema): void;` — a computed key, not callable by external code without importing the (internal) Symbol.

### F-2 — Tighten `params?: object` → `Readonly<Record<string, unknown>>` (Phase A1, e8e8c95)

`packages/core/src/workflow/types.ts:26` and `packages/api-core/src/moleculer/workflow/adapter.ts:13`: both `params` fields now `Readonly<Record<string, unknown>>`. Better represents fastestValidator schema literals; rejects spurious accepts (arrays/Date/functions) that `object` allowed. m9s-example `IngestProcessWorkflow.ts` `as const` literal record satisfies new type without modification.

### F-3 — Generic `setWorkflows<M extends WorkflowRegistration>` (Phase A1 + Phase B)

Phase A1 made `setWorkflows` generic. Phase B (team-lead) corrected the `WorkflowRegistration` constraint from `Readonly<Record<string, WorkflowDefinition<unknown, unknown>>>` to `Readonly<Record<string, WorkflowDefinition<any, any>>>` because `WorkflowDefinition<TInput, TOutput>` is contravariant on `TInput` under `strictFunctionTypes: true` — without `any` in the constraint, m9s-example `WorkflowDefinition<IngestProcessInput, IngestProcessResult>` was not a subtype. Documented variance reasoning inline + ESLint disable for the legitimate `any`. Generic `<M>` then captures narrow per-key types at call site (preserves audit F-T-3 ergonomics goal).

### F-4 — `typesVersions` fallback (Phase A2, 33a22ff)

`packages/core/package.json` + `packages/api-core/package.json`: typesVersions map for all subpath exports. attw verification (post-Phase A2): all 5 subpaths (`@gertsai/core/{rag,llm}`, `@gertsai/api-core/{contracts,moleculer,runtime/node}`) now 🟢 across all four profiles (node10, node16-CJS, node16-ESM, bundler). Previously 5× 💀 Resolution failed (Sprint 3.0 carry-over).

Real impact: `gertsai_codex/tsconfig.base.json:5` is `moduleResolution: "node"` (Node10) — Sprint 3.2 consumer migration unblocked.

Out-of-scope (deferred): `hsm/providers` and `collection/{core,mixins,operations,specialized}` subpaths still 💀 under node10. No current external consumers; revisit if Sprint 3.2+ adds them.

### F-5 — Delete legacy `.eslintrc.cjs` (Phase A3, 155d0c0)

ESLint 10 silently ignored `.eslintrc.cjs` (`eslint.config.mjs` flat config canonical since Sprint 3.0 §U-9). Eliminates double-source-of-truth that Sprint 3.2 would amplify. `pnpm run lint` still green after delete.

### F-6 — m9s-example workflow registration documentation (Phase A3, 155d0c0)

**F-6a chosen pattern: documented module-load registration** (NOT addStartedHandler refactor). Reason: per EVID-005 (Sprint 3.1) + RFC-001 amendment 2026-05-05, `@moleculer/workflows` middleware reads `schema.workflows` at `broker.createService(schema)` time inside the synchronous `controller.Start({services})` path — which fires BEFORE any `addStartedHandler` callback. Deferred registration would silently break `broker.wf.run('v1.ingest.process', ...)` at runtime since tests do not exercise the workflow runtime path (e2e is `.skip`). Comment block expanded with explicit audit F-CR-3 reference + timing-analysis citation.

The `as unknown as Parameters<typeof setWorkflows>[0]` cast around arg 1 was kept (now redundant after Phase A1's `implements ApiControllerInternalHook`); flagged for follow-up cleanup but not blocking.

**F-6b chosen Outcome: B (documented static import)**. Reason: `createMoleculerConfig` is heavily opinionated for the upstream Hub stack (Bunyan logger, healthcheck middleware, fixed validator/cacher); the example uses M9sCacheCacher + MemoryCacheDriver + console logger + validator-OFF + circuit-breaker-OFF. Overriding via `optionsOverride` lodash.merge would be noisier than the hand-rolled config. 30-line JSDoc block above imports cites F-P-6 + Outcome-A code consumers should copy.

### F-7 — TypeScript pin workspace-wide (Phase A2, 33a22ff)

Removed `typescript` devDep from 12 individual `packages/*/package.json` (drift was `^5.2.2`/`^5.3.0`/`^5.7.0`/`^5.9.2` across 14 packages; audit F-CR-4). Root pins exact `5.9.3` (no caret) — single source of truth. `pnpm why typescript`: single 5.9.3 across workspace. Lockfile delta: -43 / +4 (pure removals; no new packages).

`@ryoppippi/unplugin-typia` peer-dep mismatch (KNOWN-ISSUES item 7) remains as documented tracked item — 4051 tests pass on 5.9.3 baseline.

### F-8 — Uniform package.json scripts (Phase A2, 33a22ff)

Required keys per audit F-CR-5: `build`, `clean`, `test`, `typecheck`, `lint`. Added missing scripts to 14 packages:
- `clean` added to: core, di, fetch, hsm, llm-costs, m9s-cache, utils, ws-rpc.
- `typecheck` added to: core, di, hsm, llm-costs, utils.
- `lint` added to all 14.

Standardized: `clean: "rm -rf dist tsconfig.tsbuildinfo *.tsbuildinfo"`, `typecheck: "tsc --noEmit"`, `lint: "eslint . --max-warnings 0"`.

`pnpm -r --parallel run typecheck`: 15/15 workspaces (was silently skipping 5+).

### F-9 — Additive `WorkflowSignal.meta` (Phase A1, e8e8c95)

`packages/core/src/workflow/types.ts`: added `WorkflowSignalMeta` interface (`tenantId?: string`, `userId?: string`, `correlationId?: string`) + optional `meta?: WorkflowSignalMeta` on `WorkflowSignal`. Non-breaking. Tests added in `packages/core/src/workflow/types.test.ts` (3 tests covering signal-without-meta, partial meta, full meta — all 3 passing).

`packages/api-core/src/moleculer/workflow/adapter.ts`: `extractWorkflowMeta(ctx)` helper reads `ctx.meta` defensively (typeof checks), copies only string fields, returns `undefined` when none survive. Resulting signal literally omits `.meta` key when no fields populated (telemetry/log shape stability).

Forestalls Sprint 3.2 forced minor bump for tenant context (audit F-S-1).

### F-10 — Remove `as unknown as ServiceSchema` casts (Phase A1, e8e8c95)

`packages/api-core/src/lib/controller/types.ts`: `CoreServiceSchema` gains optional `workflows?: Record<string, MoleculerWorkflowSchema>` field (resolved via dynamic import to avoid circular). `ApiController.class.ts:487` (`_attachWorkflowsToServices`) and `:1460` (call site in `generateServiceSchema`) — both casts removed. `synthSchema` typed as `CoreServiceSchema` directly.

### F-11 — KNOWN-ISSUES additions (Phase A3, 155d0c0)

Added §8 (subpath imports require `moduleResolution: "node16"` or higher; typesVersions fallback added for best-effort Node10 coverage) and §9 (oauth.class.ts placeholder console.log calls 151..174 — extraction artifacts; consumers can override via `setAuthProvider`; permanent fix in @gertsai/auth-* extraction). §7 typia peer-dep warning preserved.

## Convergent audit-pre-sprint-3-2 findings — ALL CLOSED

| Finding | Reviewer | Status |
|---------|----------|--------|
| F-T-1 `_registerWorkflow` public leak | type-auditor | ✅ Symbol-keyed (F-1) |
| F-T-2/F-CR-9 `params?: object` too loose | type-auditor + code-reviewer | ✅ `Readonly<Record<...>>` (F-2) |
| F-T-3/F-CR-2 `WorkflowRegistration<any,any>` erases generics | type-auditor + code-reviewer | ✅ Generic `<M>` + variance-aware constraint (F-3) |
| F-T-4/F-P-1 attw Node10 fail | type-auditor + prod-validator | ✅ typesVersions for 5 subpaths (F-4) |
| F-CR-3/F-P-6 module-load + lazy-require pattern | code-reviewer + prod-validator | ✅ Documented timing constraint (F-6) |
| F-A-3/F-S-2 auth scope conflict | architect + security | ⏳ Routed to PRD-001 amendment (Sprint 3.2 redesign) |

Single-reviewer findings closed in this sprint: F-CR-1 (F-5), F-CR-4 (F-7), F-CR-5 (F-8), F-T-5 (F-10), F-S-1 (F-9), F-P-1 docs (F-11), F-P-4 docs (F-11).

Single-reviewer findings deferred: F-T-6 (`noUncheckedIndexedAccess` strict mode flags) → separate sprint; F-S-3 (auth-provider DI replacement) → @gertsai/auth-* ADR Sprint 3.x; F-S-4 (`getRandomId` crypto sibling) → opportunistic with auth-* extraction; F-A-4..F-A-7 (Sprint 3.2 scope mechanics) → SPEC for Sprint 3.2 foundation libs.

## Architect NO-GO routed (NOT in this sprint)

F-A-1 `@gertsai/observe` collision (PRD-001 FR-018 OTel SDK vs upstream ClickHouse-backed LLM-observability) → rename `@gertsai/otel`; defer LLM-obs SDK.
F-A-2 `@gertsai/database` semantics (agnostic 3-method `PgClient` per ADR-011 vs upstream Prisma schema 29k LOC) → rename `@gertsai/pg-client`; mark fresh-code (NOT history-preserve).
F-A-3 `@gertsai/auth-moleculer` transitive `@gerts/auth: workspace:*` drag → drop from Sprint 3.2; auth stays in `api-core/moleculer/auth/` subpath until separate ADR.

These will land as **PRD-001 amendment + ADR-012** before Sprint 3.2 SPEC-007 (foundation libs Wave 1, redesigned). Decision recorded here for traceability; commit will reference EVID-006.

## Commits на feature branch (Sprint 3.0.1)

```
155d0c0 chore(repo,m9s-example): Sprint 3.0.1 Phase A3 — config + example fixes (F-5, F-6, F-11)
33a22ff chore(monorepo): Sprint 3.0.1 Phase A2 — packaging hardening (F-4, F-7, F-8)
e8e8c95 fix(core,api-core): Sprint 3.0.1 Phase A1 — type-system hardening (F-1, F-2, F-3, F-9, F-10)
6b4fe75 docs(forgeplan): Sprint 3.1 Phase C — EVID-005 + SPEC-003 active + state
7d20ae8 feat(m9s-example): Sprint 3.1 Phase B — workflow migration to setWorkflows (W-6, W-7)
e830ae6 feat(core,api-core): Sprint 3.1 Phase A — workflows full impl + ESLint boundaries (W-1..W-5, W-8)
```

## AgentTeams metrics (Sprint 3.0.1)

- 2 phases (Phase A 3∥ workers + Phase B team-lead solo).
- 3 unique workers: type-system-worker (F-1, F-2, F-3, F-9, F-10), packaging-worker (F-4, F-7, F-8), example-and-config-worker (F-5, F-6, F-11).
- Wall-clock ~30 min (Phase A 3∥ ~10 min for largest worker; Phase B ~20 min including F-3 constraint variance fix + commits + EVID).
- Disjoint file scope: 0 conflicts.
- Emergent worker decisions:
  - type-system-worker: chose Option A (Symbol-keyed) for F-1 over Option B (private + closure registry) — less invasive; cross-realm-stable via `Symbol.for(...)`.
  - packaging-worker: chose TS 5.9.3 exact pin (Option A) over 5.8.x downgrade (Option B) — 4051 tests pass on 5.9.3 baseline; typia peer warning becomes intentional tracked item.
  - example-and-config-worker: chose documented module-load registration (NOT addStartedHandler refactor) for F-6a after timing analysis surfaced runtime broken risk; chose Outcome B (static import preserved + documented) for F-6b due to opinionated `createMoleculerConfig` mismatch.
  - Phase B team-lead: detected F-3 generic constraint variance issue (`unknown,unknown` rejected `IngestInput,IngestResult` under `strictFunctionTypes`); fix: `any,any` in constraint with documented variance reason + ESLint disable; preserves audit F-T-3 ergonomics goal at call site.

## Verdict rationale

`supports` SPEC-005 + PRD-001 + EVID-005:
- All 11 F-items acceptance met (verification table above).
- Zero test regressions (4051 = Sprint 3.1 baseline 4048 + 3 new F-9 tests).
- All convergent (≥2 reviewers) audit findings + critical type-system leak (F-T-1) closed.
- All CI gates green (lint/publint/depcruise/typecheck/build/attw).
- attw was 5× 💀 — now 0 💀 across all 5 target subpaths.
- F-1 `_registerWorkflow` literal absent from 4 emitted `.d.ts` files.

`congruence_level: 3` (CL3): full repo measurements on real workspace, real tests, real CI gate runs.

`evidence_type: measurement`: structured measurement (test counts, build outputs, commit hashes, CI gate exit codes, attw signals before/after).

## Decisions driven by this evidence

- SPEC-005 ready to activate.
- v0.2.0 publish unblocked from type-system + DX side. Architect NO-GO scope critical for Sprint 3.2 still routed to PRD-001 amendment.
- Sprint 3.2 SPEC-007 (foundation libs Wave 1, redesigned) will inherit clean type-system foundation — workflow API surface now demonstrates the pattern (Symbol-keyed internal, generic-preserving public, typesVersions for subpath fidelity).
- Deferred items (F-T-6 strict-mode flags, F-S-3/F-S-4 auth tweaks, F-A-4..F-A-7 Sprint 3.2 mechanics, hsm/providers + collection/* attw) tracked in audit-pre-sprint-3-2 evidence; not blocking v0.2.0.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-005 (Sprint 3.0.1 fix sprint checklist) | Spec | informs (full implementation evidence) |
| PRD-001 (Wave 2 — Clean Library Platform) | PRD | informs |
| EVID-005 (Sprint 3.1 complete) | Evidence | informs (foundation context — what landed that we're now hardening) |
| ADR-002 (Hex layer enforcement) | ADR | informs (F-5 cleanup — flat config canonical) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (F-1 internal hook + F-4 typesVersions subpath fidelity) |
| audit-pre-sprint-3-2 (5 reviewers) | external | informs (drives all F-items) |
| RFC-001 (Moleculer workflows integration) | RFC | informs (F-3, F-6 schema-build seam timing) |






