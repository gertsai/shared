---
depth: standard
id: EVID-017
kind: evidence
last_modified_at: 2026-05-07T08:18:02.727483+00:00
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
- **congruence_level**: CL3 (same — internal test on target system; full repo green; AgentTeams 4∥ Build + 4∥ post-Build fidelity audit)
- **evidence_type**: internal-test

## Summary

Sprint 3.10 = Wave 5 closure sprint per ADR-010 + Amendment 1 (10-report pre-Build audit synthesis). Closes Wave 5 polish backlog (15 P2 items) + integrates Wave 5 packages into m9s-example (canonical reference) + relocates `SessionDestroyedError` to `@gertsai/errors` Shared Kernel (resolves Track 3 P0 tier-direction violation) + ships `TypedToken<T>` wrapper for `ProviderContext` (Sprint 3.7 R-2 mitigation).

**Branch**: `feat/sprint-3-10-wave-5-polish` off `feat/sprint-3-9-wave-5-phase-4`. **Single atomic commit** pending team-lead Phase D.

**Test count delta**: 4843 → **4900 passed** (+57), 49 → 103 skipped (m9s-example e2e.test.ts pre-existing skip propagated). 0 regressions.

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
- W-3-10-21: NEW `tests/wave5-integration.test.ts` (4 tests covering full request flow + adversarial cases).
- W-3-10-22: README `## Wave 5 stack reference` section per Sprint 3.6 §template (Errors / Tenant / RequestContext / Session-guard / Composition order / ⚠️ SECURITY / Cross-references).

Use-case input shape extended with **additive optional** `session?: Session` + `expectedTenantId?: string` fields — pre-Wave-5 callers (16 existing tests) pass neither and skip assertion branch entirely. ADR-010 I-2/I-3 regression invariant preserved.

Phase B addition: `examples/m9s-example/.dependency-cruiser.cjs` Shared Kernel exception added for `@gertsai/errors` in domain layer (per ADR-006 §D §6).

### Track 3 — SessionDestroyedError relocation + Session $-mutator migration (E+ marker, REVISED per Amendment 1 §A1.1)

P0 tier-direction violation in original SPEC resolved by relocating `SessionDestroyedError` from `@gertsai/session-guard` (Tier 2) to `@gertsai/errors` (Tier 1, Shared Kernel).

- W-3-10-23: `packages/errors/src/session.ts` (NEW) — `class SessionDestroyedError extends ConflictError<{ contextField: 'session' }> {}`. Export added to `errors/src/index.ts`. NEW `__tests__/session-error.test.ts` (7 tests: instance chain, kind=CONFLICT, details schema lock, verbatim messages, toJSON, name).
- W-3-10-24: `packages/session-guard/src/errors.ts` — local class def replaced with `export { SessionDestroyedError } from '@gertsai/errors';` re-export shim. NEW `__tests__/session-destroyed-error.test.ts` — single-source identity test (R-6 mitigation): `expect(FromGuard).toBe(FromErrors)` PASSES. 5 tests.
- W-3-10-25: `packages/session/src/Session.ts` — direct `import { SessionDestroyedError } from '@gertsai/errors';` (peer-dep already present). Lines 229, 248 throw `SessionDestroyedError` with verbatim messages preserved. `createRequire` complexity eliminated.
- W-3-10-25a/b: polish lines 19-22 + scoping.test.ts:13-17 comments compressed.

**Tier discipline preserved**: `cat packages/session/package.json | grep peerDep` confirms only `@gertsai/errors`. NO new peer-dep on `@gertsai/session-guard`. Verified by shared-kernel-fidelity audit.

### Track 4 — TypedToken<T> wrapper (F+ marker, REVISED per Amendment 1 §I-12, §I-13)

NEW additive API in `@gertsai/runtime-context`:

- W-3-10-26: `src/typed-token.ts` (NEW) — `defineToken<T>(name)` + `isTypedToken(value)` + `TypedToken<T>` interface. Module-private `Symbol(...)` brand (NOT `Symbol.for`); required `[TYPED_TOKEN_BRAND]: true` discriminator (NO `__phantom_T__` field per I-12 — optional readonly is covariant under TS strict).
- W-3-10-27: `src/provider-context.ts` — overloads `get<T>(token: symbol|TypedToken<T>)` and `getOptional<T>(...)`; declaration order: symbol FIRST, TypedToken SECOND. `DefaultProviderContext` extracts `.symbol` BEFORE `assertSymbolToken(sym)` per I-13.
- W-3-10-28: index.ts exports `TypedToken`, `defineToken`, `isTypedToken`.
- W-3-10-29: 10 typed-token tests + 6 type-only tests (`expectTypeOf`) + 7 provider-context overload tests. Adversarial Object.prototype pollution test included.
- W-3-10-29a: README `## TypedToken<T>` section per Sprint 3.6 §template.

CWE-1321 brand-pollution-resistant via module-private Symbol + `Object.prototype.hasOwnProperty.call`.

## Quality gates (Phase B)

| Gate | Result | Details |
|---|---|---|
| `pnpm install` | ✅ green | lockfile uptodate, 1.3s |
| `pnpm build` | ✅ green | 39 packages + m9s-example |
| `pnpm test` | ✅ **4900 passed** (+57), 103 skipped | 0 regressions |
| `pnpm typecheck` | ✅ green | all packages |
| `pnpm depcruise` | ✅ green | after Shared Kernel exception in m9s `.dependency-cruiser.cjs` |

## Audit cycle (10th)

### Pre-Build audit (5∥ reviewers, 10 reports across 2 sessions)

- architect (×2) — GO-WITH-FIXES: P0 tier violation, R-3 wording, file ownership path, redactDetails minor
- security (×2) — PROCEED with fixes: wrapUnknownError allow-list (CWE-285), SessionDestroyedError details lock (CWE-209), m9s trustProxy SECURITY (CWE-639)
- ddd (×2) — APPROVE with fixes: SessionDestroyedError tier direction, wrapUnknownError kind subset, BC labels
- typescript (×2) — APPROVE/GREEN with fixes: phantom field invariance issue (CRITICAL), assertSymbolToken extraction, R-3 wording
- docs (×2) — BLOCKED on inline templates: 4 changeset bodies, TypedToken README, m9s §Wave 5 outline, CLAUDE.md diffs

**All findings adopted** as Amendment 1 to ADR-010 + SPEC-015 (via `forgeplan_update` MCP — strict per CLAUDE.md): 6 new invariants (I-10..I-16), 2 new risks (R-5, R-6), 1 risk reformulated (R-3), 1 Decision revised (C), 3 Decisions extended (A/B/D), 2 alternatives added.

### Post-Build fidelity audit (4∥ reviewers, all PASS)

| Reviewer | Verdict | P0 | P1 | P2 |
|---|---|---|---|---|
| polish-fidelity | PASS | 0 | 0 | 1 (3 READMEs without forgeplan refs — cosmetic) |
| m9s-fidelity | PASS | 0 | 0 | 0 |
| shared-kernel-fidelity | PASS | 0 | 0 | 2 (Session.ts:95 token getter pre-existing bare Error — out-of-scope; re-export shim JSDoc minor) |
| typed-token-fidelity | PASS | 0 | 0 | 3 (test-d.ts tautology; README phrasing; Install heading omitted — DRY) |

**Zero P0/P1 across all 4 tracks** — matches Sprint 3.8 baseline (cleanest cycles). 10th cycle of pre-Build + post-Build audit pattern validation. Pre-Build Amendment 1 catching structural risks BEFORE Build eliminated 100% implementation drift (Group 41 lesson confirmed for 10th cycle).

## Invariants verified

| Invariant | Status | Verified by |
|---|---|---|
| ADR-010 I-1 P2 polish additive | ✅ | polish-fidelity |
| ADR-010 I-2 m9s use-case signatures unchanged | ✅ | m9s-fidelity (additive optional fields) |
| ADR-010 I-3 m9s 16/16 regression preserved | ✅ | m9s-fidelity (20 passed / 1 skipped runtime) |
| ADR-010 I-4 Session $-mutator throws SessionDestroyedError | ✅ | shared-kernel-fidelity |
| ADR-010 I-5 TypedToken<T> additive overload | ✅ | typed-token-fidelity |
| ADR-010 I-6 redactDetails WeakSet + max depth 5 | ✅ | polish-fidelity |
| ADR-010 I-7 Sprint 3.6 §template + adversarial fixtures | ✅ | all 4 reviewers |
| ADR-010 I-8 SPDX header on new .ts | ✅ | polish-fidelity + shared-kernel-fidelity |
| ADR-010 I-9 strategy markers in SPEC | ✅ | SPEC-015 §Strategy markers |
| ADR-010 I-10 (Amendment 1) tier discipline preserved | ✅ | shared-kernel-fidelity (peer-deps verified) |
| ADR-010 I-11 (Amendment 1) wrapUnknownError closed allow-list | ✅ | polish-fidelity |
| ADR-010 I-12 (Amendment 1) TypedToken brand-only (no phantom field) | ✅ | typed-token-fidelity |
| ADR-010 I-13 (Amendment 1) assertSymbolToken extraction | ✅ | typed-token-fidelity |
| ADR-010 I-14 (Amendment 1) m9s SECURITY warning (CWE-639) | ✅ | m9s-fidelity (inline + README) |
| ADR-010 I-15 (Amendment 1) redactDetails MINOR bump | ✅ | polish-fidelity (changeset verified) |
| ADR-010 I-16 (Amendment 1) Sprint 3.6 §template for new READMEs | ✅ | typed-token-fidelity + m9s-fidelity |

## CWE coverage

| CWE | Mitigation source | Verified |
|---|---|---|
| CWE-285 (error coercion for auth bypass) | wrapUnknownError closed allow-list (I-11) | ✅ adversarial test |
| CWE-209 (info exposure via deep redaction) | redactDetails WeakSet + max depth 5 + breadth cap (I-6, §A1.3) | ✅ 8 adversarial tests |
| CWE-400/674 (DoS via crafted payloads) | MAX_BREADTH 1000 + truncation marker | ✅ |
| CWE-639 (header spoofing — m9s cargo-cult) | inline `// SECURITY:` + README ⚠️ block (I-14) | ✅ m9s-fidelity verified |
| CWE-1321 (TypedToken brand pollution via Symbol.for / prototype-walk) | module-private `Symbol(...)` + `Object.prototype.hasOwnProperty.call` (I-12) | ✅ adversarial test |

## Files (delta vs Sprint 3.9 commit `c6896c4`)

**Modified (40)**: 8 packages src/ + 13 Wave 5 READMEs + m9s 6 files (5 src/test + composition NEW + README) + 4 forgeplan artifacts + CLAUDE.md.

**NEW (8)**: `errors/src/session.ts`, `errors/__tests__/{redaction-deep,session-error}.test.ts`, `session-guard/__tests__/session-destroyed-error.test.ts`, `runtime-context/src/typed-token.ts`, `runtime-context/__tests__/{typed-token,typed-token.test-d}.test.ts`, `m9s-example/src/composition/wave5-middlewares.ts`, `m9s-example/tests/wave5-integration.test.ts`, plus `.forgeplan/{adrs/ADR-010,specs/SPEC-015}` (created previous session, validate+activate confirmed) + `.forgeplan/state/{ADR-010,SPEC-015}.yaml` + `.changeset/sprint-3-10-{polish,m9s-integration,session-mutator,typed-token}.md`.

## Lessons (Group 42 retrospective)

1. **Forgeplan MCP discipline now strictly codified** — User flagged direct Edit on `.forgeplan/adrs/ADR-010-*.md` during Amendment 1 work. Added 🔴 STRICT rule to CLAUDE.md: artifacts mutate ONLY via MCP `forgeplan_update`/`_new`/`_link`/`_activate`. Prevents LanceDB desync. Hindsight memory saved (Group 42 retain).
2. **Pre-Build Amendment 1 inline templates** (EVID-016 §5 lesson finally applied at Sprint scope) — eliminated 0 post-Build docs P1 findings (vs 4 from Sprint 3.6, 6 from Sprint 3.9). docs-reviewer flagged absence in pre-Build audit; Amendment 1 §A1.6 inlined 4 changeset templates + §A1.7 inlined READMEs + CLAUDE.md row diffs.
3. **AgentTeams 4∥ disjoint scope** scales to 6 packages refactor (errors + session + session-guard + runtime-context + m9s + 11 READMEs) without merge conflicts. File ownership matrix Amendment 1 §A1.5 pre-empted shared `errors/src/index.ts` race between polish-worker and shared-kernel-worker.
4. **R-6 SessionDestroyedError single-source identity** — `expect(FromGuard).toBe(FromErrors)` test critical. tsup `external` config in session-guard prevents class duplication across import paths. Pattern reusable for future Shared Kernel relocations.
5. **`.dependency-cruiser.cjs` Shared Kernel exception** — surfaced only at full-repo `pnpm depcruise` (workers run package-scoped tests). Lesson: m9s-integration-worker should also run depcruise as quality gate. Add to Wave 6+ worker prompts.
6. **Tier-direction P0 fix simplified scope** — original SPEC required `createRequire(import.meta.url)` for peer-optional load (~30 LOC); Amendment 1 §A1.1 eliminated entirely via Shared Kernel relocation. Net effect: less LOC, cleaner deps graph, no peer-warnings for consumers. Pattern: prefer Shared Kernel ownership over peer-optional cycles.
7. **2nd consecutive zero-P0/P1 sprint** (Sprint 3.8 baseline + Sprint 3.10) — pre-Build audit pattern matures over 10 cycles. Skipping pre-Build = false economy confirmed for 10th time.

## Wall-clock

- Bootstrap + context restore: ~5 min (Hindsight recall + forgeplan_status/health + git status).
- Pre-Build audit re-spawn (5 reviewers parallel; previous session left stale config): ~3 min spawn + ~12 min reports gather.
- Amendment 1 synthesis + ADR-010 + SPEC-015 update via MCP: ~10 min.
- CLAUDE.md strict-rule addition + tier-table updates: ~3 min.
- Build phase (4 workers parallel): ~15-20 min wall-clock (workers worked across multi-turn waits).
- Phase B verify (full repo build + test + typecheck + depcruise + 4 changesets + CLAUDE.md): ~8 min.
- Post-Build fidelity audit (4 reviewers parallel): ~5 min spawn + ~10 min reports.
- Phase D (this evidence + commit + Hindsight): ~5 min.

**Total**: ~70-80 min for full Sprint 3.10 cycle (ADR-010 + SPEC-015 already shaped from previous session).

## Cross-references

- ADR-010 (Sprint 3.10 — Wave 5 polish closure + m9s Wave 5 integration) — based_on
- SPEC-015 (Sprint 3.10 W-items + Amendment 1) — informs (this evidence supports SPEC closure)
- EVID-016 (Sprint 3.9 / Wave 5 close) — informs (Sprint 3.10 closes Wave 5 polish backlog from EVID-016 §5 lessons)
- ADR-006 §D §6 (errors Shared Kernel) — invoked for SessionDestroyedError relocation
- ADR-007 (Sprint 3.7 Wave 5 Phase 2) — invoked for runtime-context ProviderContext extension
- ADR-008 Amendment 1.1.1 (Sprint 3.8 module-private Symbol) — pattern reuse for TypedToken brand
- Sprint 3.7 R-2 (token type-erasure deferred) — closed by TypedToken<T>

## Next steps

1. Single atomic commit on `feat/sprint-3-10-wave-5-polish` branch with conventional commit message.
2. Hindsight retain Group 42 (full sprint + retrospective + lessons).
3. TeamDelete cleanup (`sprint-3-10` team).
4. Optional: `gh pr create --base main` (user gate).
5. Defer to Wave 6+: 3 P2 README forgeplan-refs uniformity, README `13 OSS packages` → `39` cosmetic update, Session.ts:95 token getter migration.





