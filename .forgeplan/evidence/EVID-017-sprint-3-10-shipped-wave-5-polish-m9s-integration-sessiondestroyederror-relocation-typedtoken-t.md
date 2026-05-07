---
depth: standard
id: EVID-017
kind: evidence
last_modified_at: 2026-05-07T09:06:40.949574+00:00
last_modified_by: claude-code/2.1.132
links:
- target: ADR-010
  relation: informs
- target: SPEC-015
  relation: informs
- target: EVID-016
  relation: informs
status: active
title: Sprint 3.10 shipped — Wave 5 polish + m9s integration + SessionDestroyedError relocation + TypedToken<T>
---

# EVID-017: Sprint 3.10 shipped — Wave 5 polish + m9s integration + SessionDestroyedError relocation + TypedToken<T>

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3 (same — internal test on target system; full repo green; AgentTeams 4∥ Build + 4∥ post-Build fidelity audit; real broker.call e2e via Addendum 1)
- **evidence_type**: internal-test

## Summary

Sprint 3.10 = Wave 5 closure sprint per ADR-010 + Amendment 1 (10-report pre-Build audit synthesis). Closes Wave 5 polish backlog (15 P2 items) + integrates Wave 5 packages into m9s-example (canonical reference) + relocates `SessionDestroyedError` to `@gertsai/errors` Shared Kernel (resolves Track 3 P0 tier-direction violation) + ships `TypedToken<T>` wrapper for `ProviderContext` (Sprint 3.7 R-2 mitigation). **Addendum 1** revives real broker.call e2e in m9s-example, closing the Sprint 3.5.2 lesson gap.

**Branch**: `feat/sprint-3-10-wave-5-polish` off `feat/sprint-3-9-wave-5-phase-4`. Sprint 3.10 atomic commit `782a3e0` shipped; Addendum 1 e2e revival ships as follow-up commit.

**Test count delta**: 4843 → **4904 passed** (+61), 49 → **102 skipped** (m9s-example e2e.test.ts revived, -1; new Wave 5 tests added, +52). 0 regressions.

## Deliverables

### Track 1 — P2 polish batch (15 items, F+ marker)

`@gertsai/errors` (MINOR per Amendment 1 §I-15):
- W-3-10-1: `wrapUnknownError(x, kind?, correlationId?)` — closed allow-list `'INTERNAL' | 'EXTERNAL'`; `isAppError` early-return preserved (CWE-285 mitigation).
- W-3-10-2: `AppError` shallow-freeze JSDoc note.
- W-3-10-3: `redactDetails()` deep-scan recursive (MAX_DEPTH=5, MAX_BREADTH=1000, WeakSet anti-cycle, non-plain objects passthrough; CWE-209 + CWE-400/674 mitigation). 8 adversarial tests.
- W-3-10-4: `errors/internal.ts` JSDoc clarification.
- W-3-10-5: README cross-references switched to absolute repo URLs (scope expanded to all 13 Wave 5 package READMEs per Amendment 1 §A1.5).

`@gertsai/{tenant-resolver, runtime-context, entity-storage, entity-react, rest-request-manager, async-utils}` (PATCH — JSDoc/comment polish):
- W-3-10-6: tenant-resolver moleculer hint message split.
- W-3-10-7/8: PathStrategy + lookupHeader JSDoc.
- W-3-10-11: requireAuthContextWithDataAccess fallback semantic.
- W-3-10-12: BaseEntityStorageService.upsert 2-RTT cost note.
- W-3-10-13: markRaw `configurable: false` JSDoc.
- W-3-10-14: rest-request-manager error.cause chain log (5-level WeakSet bounded).
- W-3-10-15: async-utils retry thundering-herd cross-ref.

### Track 2 — m9s-example Wave 5 integration (E+ marker)

m9s-example becomes canonical Wave 5 reference. Integrates 4 Wave 5 packages:

- W-3-10-16: 4 workspace:* deps added (`@gertsai/{errors,tenant-resolver,runtime-context,session-guard}`).
- W-3-10-17: domain throws use AppError subclasses (`ValidationError`, `InternalError`).
- W-3-10-18 + I-14 (CWE-639): `tenantMiddleware` with `HeaderStrategy({ trustProxy: true })` + inline `// SECURITY:` comment + ⚠️ SECURITY README block.
- W-3-10-19: `sessionMiddleware` registered in canonical order (`tenant → session`).
- W-3-10-20: `assertAuthenticated` + `assertSessionInTenant` at use-case entry.
- W-3-10-21: NEW `tests/wave5-integration.test.ts` (4 tests covering full request flow + adversarial cases — mock-based unit-level).
- W-3-10-22: README `## Wave 5 stack reference` section per Sprint 3.6 §template.

Use-case input shape extended with **additive optional** `session?: Session` + `expectedTenantId?: string` fields — pre-Wave-5 callers (16 existing tests) pass neither and skip assertion branch entirely. ADR-010 I-2/I-3 regression invariant preserved.

Phase B addition: `examples/m9s-example/.dependency-cruiser.cjs` Shared Kernel exception added for `@gertsai/errors` in domain layer (per ADR-006 §D §6).

### Track 3 — SessionDestroyedError relocation + Session $-mutator migration (E+ marker, REVISED per Amendment 1 §A1.1)

P0 tier-direction violation in original SPEC resolved by relocating `SessionDestroyedError` from `@gertsai/session-guard` (Tier 2) to `@gertsai/errors` (Tier 1, Shared Kernel).

- W-3-10-23: `packages/errors/src/session.ts` (NEW). NEW `__tests__/session-error.test.ts` (7 tests).
- W-3-10-24: `packages/session-guard/src/errors.ts` re-export shim. NEW `__tests__/session-destroyed-error.test.ts` — single-source identity test (R-6 mitigation): `expect(FromGuard).toBe(FromErrors)` PASSES. 5 tests.
- W-3-10-25: `packages/session/src/Session.ts` direct import; bare Error throws on lines 229, 248 → `SessionDestroyedError`. `createRequire` complexity eliminated.
- W-3-10-25a/b: polish lines 19-22 + scoping.test.ts:13-17 comments compressed.

**Tier discipline preserved**: `@gertsai/session/package.json` peerDeps: `{ '@gertsai/errors': 'workspace:^' }` only. NO new peer-dep on session-guard.

### Track 4 — TypedToken<T> wrapper (F+ marker, REVISED per Amendment 1 §I-12, §I-13)

NEW additive API in `@gertsai/runtime-context`: `defineToken<T>` + `isTypedToken` + `TypedToken<T>` (required brand `[TYPED_TOKEN_BRAND]`, NO `__phantom_T__` field per I-12). ProviderContext.get/getOptional gain TypedToken<T> overloads with `.symbol` extraction BEFORE `assertSymbolToken` per I-13. CWE-1321 brand-pollution-resistant.

## Quality gates (Phase B)

| Gate | Result | Details |
|---|---|---|
| `pnpm install` | ✅ green | 1.3s, lockfile uptodate |
| `pnpm build` | ✅ green | 39 packages + m9s-example |
| `pnpm test` | ✅ **4900 passed** (+57), 103 skipped | 0 regressions; 4904 post-Addendum 1 |
| `pnpm typecheck` | ✅ green | all packages |
| `pnpm depcruise` | ✅ green | after Shared Kernel exception |

## Audit cycle (10th)

### Pre-Build audit (5∥ reviewers, 10 reports across 2 sessions)

All findings adopted as Amendment 1 to ADR-010 + SPEC-015 (via `forgeplan_update` MCP — strict per CLAUDE.md): 6 new invariants (I-10..I-16), 2 new risks (R-5, R-6), 1 risk reformulated (R-3), 1 Decision revised (C), 3 Decisions extended (A/B/D), 2 alternatives added.

### Post-Build fidelity audit (4∥ reviewers, all PASS)

| Reviewer | Verdict | P0 | P1 | P2 |
|---|---|---|---|---|
| polish-fidelity | PASS | 0 | 0 | 1 cosmetic |
| m9s-fidelity | PASS | 0 | 0 | 0 |
| shared-kernel-fidelity | PASS | 0 | 0 | 2 informational |
| typed-token-fidelity | PASS | 0 | 0 | 3 cosmetic |

**Zero P0/P1 across all 4 tracks** — matches Sprint 3.8 baseline. 10th cycle of pre-Build + post-Build audit pattern validation.

## Invariants verified (16 total)

ADR-010 I-1..I-16 all verified by fidelity audit. CWE coverage: 285, 209, 400/674, 639, 1321.

## Files (delta vs Sprint 3.9 commit `c6896c4`)

**Modified (40)**: 8 packages src/ + 13 Wave 5 READMEs + m9s 6 files + 4 forgeplan artifacts + CLAUDE.md + e2e.test.ts (post-Addendum 1).

**NEW (8)**: errors/src/session.ts + 2 errors __tests__ + session-guard __tests__ + runtime-context typed-token.ts + 2 runtime-context __tests__ + m9s-example wave5-middlewares.ts + wave5-integration.test.ts.

**Forgeplan**: ADR-010 + SPEC-015 + EVID-017 + 4 changesets.

## Lessons (Group 42 retrospective)

1. **Forgeplan MCP discipline now strictly codified** — User flagged direct Edit on `.forgeplan/adrs/...md` during Amendment 1. Added 🔴 STRICT rule to CLAUDE.md: artifacts mutate ONLY via MCP. Prevents LanceDB desync. Recovery via `forgeplan_update id=<ID> body=<full body>`.
2. **Pre-Build Amendment 1 inline templates** (EVID-016 §5 lesson finally applied) — eliminated 0 post-Build docs P1 findings (vs 4 from Sprint 3.6, 6 from Sprint 3.9).
3. **AgentTeams 4∥ disjoint scope** scales to 6-package refactor without merge conflicts.
4. **R-6 SessionDestroyedError single-source identity** — `expect(FromGuard).toBe(FromErrors)` test critical; tsup `external` config prevents class duplication. Reusable for Shared Kernel relocations.
5. **`.dependency-cruiser.cjs` Shared Kernel exception** — surfaced only at full-repo `pnpm depcruise`. Lesson: workers should also run depcruise locally.
6. **Tier-direction P0 fix simplified scope** — Shared Kernel ownership > peer-optional cycles. ~30 LOC `createRequire` complexity eliminated.
7. **2nd consecutive zero-P0/P1 sprint** (Sprint 3.8 + Sprint 3.10) — pre-Build audit pattern matures over 10 cycles.
8. **Real e2e gap closure (Addendum 1)** — Sprint 3.5.2 lesson finally addressed. Surfaced 3 non-obvious traps documented inline in e2e.test.ts (typia transformer pre-build requirement, CJS/ESM module identity via createRequire, Moleculer middleware order counter-intuitive).

## Cross-references

- ADR-010 (Sprint 3.10) — based_on
- SPEC-015 (Sprint 3.10 W-items + Amendment 1) — informs
- EVID-016 (Wave 5 close) — informs (Sprint 3.10 closes Wave 5 polish backlog)
- ADR-006 §D §6 (errors Shared Kernel) — invoked for SessionDestroyedError relocation
- ADR-007 §1 (Application Service composition root) — invoked for runtime-context ProviderContext extension
- EVID-012 §5 (Sprint 3.5.2 e2e gap) — closed by Addendum 1
- ADR-008 Amendment 1.1.1 (module-private Symbol) — pattern reuse for TypedToken brand

## Next steps

1. ✅ Single atomic commit `782a3e0` shipped on `feat/sprint-3-10-wave-5-polish`.
2. ✅ Addendum 1 e2e revival shipped as follow-up commit (this update).
3. ✅ Hindsight retain Group 42 (full sprint + retrospective).
4. Optional: `gh pr create --base main` (user gate).
5. Defer to Wave 6+: action-handler wiring (ctx.locals.requestContext → use case) for full broker-level session-guard rejection paths; 3 P2 README forgeplan-refs uniformity; README "13 OSS packages" → "39"; Session.ts:95 token getter migration.

---

## Addendum 1 — Real e2e revival (post-Sprint 3.10 closure)

After the atomic Sprint 3.10 commit `782a3e0`, user requested closing the long-standing e2e gap from Sprint 3.5.2 lesson ("post-Build fidelity audit must include true e2e, not just build verification"). `examples/m9s-example/tests/e2e.test.ts` had been `describe.skip` since the example shipped — Sprint 3.10 did NOT initially address it.

### What revived

`examples/m9s-example/tests/e2e.test.ts` rewritten from a 51-line skipped placeholder into a 234-line real broker-call suite. Boots an actual Moleculer broker via `ApiController.Start({ brokerConfig, services: [ApiService], repl: false })` — the same code path as `pnpm start`. Exercises the canonical Wave 5 stack end-to-end through the broker pipeline.

### 4 e2e scenarios — ALL PASSING

1. **Header→tenant→session→handler happy path** — `broker.call('v1.ingest.document', input, { meta: { headers: { 'x-tenant-id': 'tenant-acme' } } })`. Verified via probe middleware at index 0 (innermost wrapper, runs after Wave 5):
   - `ctx.meta.tenantId === 'tenant-acme'` (tenantMiddleware resolved header)
   - `ctx.locals.requestContext.tenantId === 'tenant-acme'` (sessionMiddleware composed RC)
   - `ctx.locals.requestContext.frozen === true` (auto-`$freeze()` per ADR-007 I-16)
   - `ctx.locals.requestContext.correlationId` is a non-empty string (per-request UUID).

2. **Anonymous flow (mode='optional')** — `broker.call(...)` without header. Verified: `ctx.meta.tenantId === undefined`, RC composed but tenant unset, `frozen === true`. mode='optional' from `wave5-middlewares.ts` allows anonymous routes (production should override to 'strict').

3. **ingest → search round-trip** — two sequential `broker.call`s with same `X-Tenant-ID`. Both succeed; tenant resolves identically on each call (per-request scope confirmed).

4. **Fresh correlationId per request** — 3 sequential calls with same header → 3 distinct `correlationId` values (per `crypto.randomUUID` per-call generation per ADR-007 I-20).

### Test count delta (after e2e revival)

- m9s-example: 20 passed / 1 skipped → **24 passed** (+4 tests, -1 skipped).
- Full repo: **4904 passed** (+4 vs Sprint 3.10 commit baseline 4900) / **102 skipped** (-1).

### Implementation notes (3 non-obvious traps surfaced + documented)

1. **typia transformer requirement** — vitest uses esbuild WITHOUT the typia plugin, so source imports of action handlers throw `NoTransformConfigurationError` at module load. **Fix**: side-effect imports route through pre-built `dist/` (`require('../dist/src/services/index.js')`) where tspc has already inlined typia validators. Pre-requisite: Phase B `pnpm build` MUST run before this suite.

2. **Module identity hazard (CJS vs ESM dual-package)** — m9s-example dist is CJS. Side-effect side `require('../dist/src/services/index.js')` triggers CJS `require('@gertsai/api-core/moleculer')` resolving to `dist/moleculer.cjs`. If the test imports the SAME package via top-level ESM `await import(...)`, Node resolves the ESM bundle (`dist/moleculer.js`) — different module instance → SEPARATE `ApiController` class identity → static `_controllers` registry empty → `ServiceNotFoundError`. **Fix**: route the test's ApiController + ApiService imports through `createRequire(import.meta.url)` so they share module identity with the dist side-effect. Pattern reusable for any dual-package e2e.

3. **Moleculer middleware order — counter-intuitive** — for `BrokerOptions.middlewares = [m0, m1, ..., mN]`, the LAST entry (index N) is the OUTERMOST wrapper and runs FIRST chronologically; the FIRST entry (index 0) is the INNERMOST wrapper, closest to the handler, runs LAST chronologically. This is the OPPOSITE of typical "onion" intuition. Verified empirically via dual-probe experiment during e2e bring-up. **Implication**: `wave5-middlewares.ts` order `[tenantMiddleware, sessionMiddleware]` means sessionMiddleware is closer to handler (index 1, more inner) — reads `ctx.meta.tenantId` AFTER tenantMiddleware (index 0, outer) sets it. The shared `resolver` instance also gives sessionMiddleware a fallback path if tenant ordering ever inverts. **Probe placement**: to capture POST Wave-5 state, the probe MUST be at index 0 (innermost). Documented inline in `e2e.test.ts` as block comment for future maintainers.

### What this closes

- **Sprint 3.5.2 lesson gap** — "post-Build fidelity audit must include e2e". Sprint 3.10 originally had only mock-based wave5-integration tests (per-fidelity-report: "≤4ms execution, mock-based, deterministic"). Real broker-call e2e was the missing link.
- **Implicit canonical-reference verification** — m9s-example as Wave 5 reference now PROVES end-to-end via real broker. Consumers copying this example get a working pattern (not just code that compiles).

### What this does NOT cover (explicit limitations)

- Action handlers do NOT yet wire `ctx.locals.requestContext.session` + `expectedTenantId` through to use cases. Wave 5 middleware composes the context, but use cases inside the broker do not consume the session-guard branch (the unit-level wave5-integration tests cover that path by calling use cases directly with explicit `session` arg). Wiring action handlers to pull from `ctx.locals.requestContext` is a Wave 6+ enhancement.
- Real session-guard rejection scenarios (destroyed session, cross-tenant attempt) through the broker are NOT covered — those would require the action-handler wiring above.
- No external infrastructure dependencies (Postgres/pgvector, real OpenAI/Ollama embedder, NATS/Redis transport). The e2e harness is single-process with in-memory cacher, mock embedder.

### Cross-references

- Sprint 3.5.2 EVID-012 §5 — original e2e gap discovery (Group 35 retrospective).
- ADR-007 I-16 — auto-`$freeze()` invariant verified by e2e probe.
- ADR-007 I-20 — `crypto.randomUUID` correlationId verified by e2e (3 calls = 3 distinct UUIDs).
- ADR-010 §B + I-14 — m9s as canonical Wave 5 reference (e2e is the proof).
- Moleculer 0.14 middleware-handler — OUTER vs INNER wrap order documented inline in `e2e.test.ts`.

### Test count after addendum

| Metric | Sprint 3.10 commit `782a3e0` | Post-addendum | Delta |
|---|---|---|---|
| Total passed | 4900 | **4904** | +4 |
| Total skipped | 103 | 102 | -1 |
| m9s-example | 20 / 1 skipped | 24 / 0 skipped | +4 / -1 |

R_eff impact: addendum strengthens this evidence's congruence (CL3 — internal test on target system, broker boots and serves real requests). EVID-017 verdict remains `supports`.


