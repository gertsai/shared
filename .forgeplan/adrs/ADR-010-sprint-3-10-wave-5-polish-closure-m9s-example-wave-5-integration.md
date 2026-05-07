---
depth: standard
id: ADR-010
kind: adr
last_modified_at: 2026-05-07T07:37:06.093706+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-003
  relation: based_on
- target: ADR-009
  relation: refines
status: active
title: Sprint 3.10 — Wave 5 polish closure + m9s-example Wave 5 integration
---

# ADR-010: Sprint 3.10 — Wave 5 polish closure + m9s-example Wave 5 integration

## Context

Wave 5 fully complete (Sprint 3.6-3.9, EVID-013/14/15/16). 39 packages, 4843 tests, 9-cycle audit pattern matured. Sprint 3.10 = **maintenance / closure sprint** — clean accumulated P2 polish backlog + integrate Wave 5 packages into `m9s-example` reference app.

**Context drivers**:

1. **P2 polish backlog from 4 sprints** — 15+ items in KNOWN-ISSUES §11 (post-Sprint-3.6 audit) + Sprint 3.7-3.9 fidelity P2 notes. Each is small (~5-30 LOC fix), but accumulated drift if not addressed.

2. **m9s-example does NOT use Wave 5 packages** — verified via `examples/m9s-example/package.json`: it depends on api-core, api-rlr, auth-openfga, core, entity-audit, entity-storage, fetch, m9s-cache, session, storage-core. **No errors/tenant-resolver/runtime-context/session-guard usage** — meaning the canonical reference app doesn't demonstrate Wave 5 patterns.

3. **Sprint 3.7 deferred items**:
   - Internal Session `$switchOperator` + `$setDataAccessUuid` throw bare `new Error('Cannot ... on destroyed session')` instead of `SessionDestroyedError` from session-guard. This was marked deferred in Sprint 3.7 architect P1-3 because session-guard wasn't shipped at that point.
   - `TypedToken<T>` wrapper for `ProviderContext.get<T>(token: symbol)` — Sprint 3.7 R-2 noted token type-erasure risk; deferred as future enhancement.

Sprint 3.10 closes these — non-feature work that consolidates Wave 5 quality.

## Decision

### Decision A — P2 polish batch policy

P2 polish items batched into Sprint 3.10 strictly **additive non-breaking** per ADR-006 §D §4 F+ marker. Each item:
- Fix is local to one file (no cross-package changes).
- Public API surface unchanged.
- No SemVer bump beyond patch.
- Test coverage preserved or added.

**Polish items (15 total)**:

`@gertsai/errors`:
1. `wrapUnknownError(x, kind?, correlationId?)` — implement `kind?` parameter (currently `_kind?` ignored) — accept and apply on resulting AppError.
2. `AppError` constructor `Object.freeze({ ...details })` — add JSDoc note about shallow freeze (deep-freeze deferred to v0.2 to avoid breaking shape).
3. `redactDetails()` — switch to **deep-scan** (recursive with WeakSet anti-cycle, max depth 5 — same pattern as cause-cycle guard per Sprint 3.6 I-13).
4. `errors/internal.ts` — keep catch-all `Record<string, unknown>` (consumer subclassing path documented).
5. README cross-references — use absolute repo URL paths (post-publish friendly).

`@gertsai/tenant-resolver`:
6. `MOLECULER_INSTALL_HINT` rename / message split — distinguish "non-Moleculer ctx shape" from "missing peer install".
7. PathStrategy `...` wildcard — JSDoc note: only valid as trailing token.
8. `lookupHeader()` exact-case-first short-circuit — JSDoc precedence note.

`@gertsai/session`:
9. `__tests__/scoping.test.ts:13-17` stale stub comment — compress to one line.
10. `Session.ts:19-22` post-swap history comment — compress to one line.

`@gertsai/runtime-context`:
11. `requireAuthContextWithDataAccess` JSDoc — clarify semantic limitation (Session.dataAccessUuid getter falls back to operatorUuid).

`@gertsai/entity-storage`:
12. `BaseEntityStorageService.upsert` — add JSDoc note about 2-RTT cost (already in KNOWN-ISSUES §10).

`@gertsai/entity-react`:
13. `markRaw` configurable: false note in JSDoc — escape-hatch semantics intentionally irreversible.

`@gertsai/rest-request-manager`:
14. `manager.ts` — log `error.cause` chain on transport failure (currently only `.message`).

`@gertsai/async-utils`:
15. `retry` — add JSDoc cross-reference to thundering herd Sprint 3.9 Amendment 1.2.7.

### Decision B — m9s-example Wave 5 integration

`examples/m9s-example/` becomes **canonical Wave 5 reference**. Add Wave 5 package usage:

1. **`@gertsai/errors`** integration:
   - Replace bare `Error` throws in domain/use-cases with appropriate AppError subclass (`ValidationError`, `NotFoundError`, `InternalError`).
   - Existing fetch failures wrapped with `wrapUnknownError`.

2. **`@gertsai/tenant-resolver`** integration:
   - Add `tenantMiddleware` to Moleculer broker config in `composition/`.
   - Header-based tenant resolution (HeaderStrategy with `trustProxy: true`).

3. **`@gertsai/runtime-context`** integration:
   - Add `sessionMiddleware` to Moleculer broker config.
   - Use cases pull `RequestContext` from `ctx.locals` instead of ad-hoc.

4. **`@gertsai/session-guard`** integration:
   - Replace ad-hoc auth checks with `assertAuthenticated(session)` / `assertSessionInTenant(session, tenantId)`.

**Strategy markers**: F+ (additive only, no breaking changes to use-case signatures).

### Decision C — Session $-mutator throw migration (REVISED — see Amendment 1 §A1.1)

`packages/session/src/Session.ts` lines 229, 248 throw bare `new Error('Cannot $... on destroyed session')`. Migrate to `SessionDestroyedError` imported directly from **`@gertsai/errors`** (relocated from session-guard per Amendment 1 §A1.1 to preserve tier discipline).

**Strategy**: E+ enhancement — additive non-breaking. Existing consumers catching `Error` still catch `SessionDestroyedError` (it extends `AppError → Error`). Consumers checking `instanceof SessionDestroyedError` get richer error info.

**Implementation** (post-Amendment 1):
- `@gertsai/errors` gains `SessionDestroyedError` export (Shared Kernel taxonomy).
- `@gertsai/session-guard` re-exports `SessionDestroyedError` from `@gertsai/errors` for backward compat (existing import paths unchanged for consumers).
- `@gertsai/session` imports directly from `@gertsai/errors` (existing peer-dep — no new dep added).
- Replace bare Error throws preserving message verbatim.
- Update existing test fixtures if they grep for exact error message.

### Decision D — TypedToken<T> wrapper for ProviderContext (REVISED — see Amendment 1 §A1.2 I-12, I-13)

`@gertsai/runtime-context` adds `defineToken<T>(name: string): TypedToken<T>` — type-narrowing wrapper над a module-private `Symbol(...)`.

**API surface (additive, post-Amendment 1)**:
```typescript
const TYPED_TOKEN_BRAND = Symbol('typed-token'); // module-private; NOT Symbol.for()

export interface TypedToken<T> {
  readonly symbol: symbol;
  readonly name: string;
  readonly [TYPED_TOKEN_BRAND]: true; // required brand — sole runtime discriminator
  // NO __phantom_T__ field — see Amendment 1 §I-12
}

export function defineToken<T>(name: string): TypedToken<T>;
export function isTypedToken(value: unknown): value is TypedToken<unknown>;

// ProviderContext gains overload (additive — original symbol-only API preserved):
export interface ProviderContext {
  get<T>(token: symbol): T;
  get<T>(token: TypedToken<T>): T;
  getOptional<T>(token: symbol): T | undefined;
  getOptional<T>(token: TypedToken<T>): T | undefined;
}
```

**Strategy**: F+ additive enhancement to runtime-context.

**Backward compat**: existing `Symbol`-keyed callers continue to work. New callers benefit from compile-time type narrowing via `defineToken<UserService>('UserService')` → `ctx.providers.get(USER_TOKEN)` returns `UserService` (not `unknown`).

**Type inference** (corrected per Amendment 1 §I-12): TypeScript infers `T` from the parameter position `get<T>(token: TypedToken<T>): T` — no anchor field required. Optional readonly `__phantom_T__?: T` (originally proposed) was DROPPED because it does not anchor invariance under TS `strict`.

### Decision E — Sprint 3.10 invariants (extend ADR-006/7/8/9; see Amendment 1 §A1.2 for I-10..I-16)

1. P2 polish strictly additive (per ADR-006 I-7 reused).
2. m9s-example Wave 5 integration MUST NOT change use-case input/output shapes (additive only — wrapping throws, adding middleware).
3. Session $-mutator migration: SessionDestroyedError from `@gertsai/errors` (Shared Kernel; per A1.1 — NOT session-guard).
4. TypedToken<T> overload — additive to ProviderContext interface; existing symbol-only API preserved.
5. All new tests follow Sprint 3.6 §template + adversarial fixtures pattern.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| A1 — Skip P2 polish, defer to Wave 6 | Rejected | 15+ items accumulated, drift compounds. Now is cleanup window before Wave 6 starts new work. |
| **A2 — Batch P2 + m9s integration + 2 deferred items into Sprint 3.10** | **Chosen** | Single sprint closes Wave 5 backlog + demonstrates patterns in reference app. |
| A3 — Skip m9s integration, just polish | Rejected | m9s-example is canonical reference; absence of Wave 5 usage degrades documentation value. |
| B1 — m9s integration in Wave 6 (bigger scope) | Rejected | Risks parallel drift; cleaner to integrate now while patterns fresh. |
| C1 — Session $-mutator migration as breaking change | Rejected | Bare Error → AppError is naturally additive (instanceof Error preserved). No reason to break. |
| C2 — Keep SessionDestroyedError in session-guard, add session→session-guard peer-optional dep | **Rejected (Amendment 1)** | Tier inversion (Tier 1→Tier 2) + circular peer-dep with existing session-guard→session edge. |
| **C3 (Amendment 1 §A1.1) — Move SessionDestroyedError to errors (Shared Kernel), session-guard re-exports** | **Chosen** | Tier discipline preserved; no new peer-deps; class identity preserved via single source. |
| D1 — TypedToken as breaking change to ProviderContext | Rejected | Symbol-only API works; TypedToken<T> overload is purely additive. |
| D2 — TypedToken with optional `__phantom_T__?: T` field | **Rejected (Amendment 1)** | Optional readonly properties are *covariant* under TS `strict`, not invariant. Brand alone suffices. |

## Consequences

### Positive
- Wave 5 P2 backlog fully closed.
- m9s-example becomes canonical Wave 5 reference (+ documentation value).
- Session $-mutator throws richer errors (consumers catching SessionDestroyedError get stack + correlationId).
- TypedToken<T> improves DI type-safety без breaking changes.
- Single atomic commit closes Sprint 3.10.
- Tier discipline preserved (Amendment 1 §A1.1).

### Negative
- ~16-20h sprint scope. Manageable; same AgentTeams 4∥ pattern.
- m9s-example test count may shift (additive integration tests + wrapped existing tests).
- TypedToken<T> adds ~30 LOC to runtime-context surface — minor.

### Risks
- **R-1**: m9s integration breaks existing 16/16 tests if use-case signatures change. Mitigation: F+ additive only — middleware composition + error wrapping doesn't change signatures.
- **R-2**: Session $-mutator migration consumers catching exact error message string. Mitigation: SessionDestroyedError.message preserves "Cannot $... on destroyed session" verbatim.
- **R-3** (REFORMULATED — Amendment 1 §A1.3): TypeScript resolves overloads **by declaration order**, not by "specificity". For `get<T>(token: symbol): T; get<T>(token: TypedToken<T>): T;` (in this declaration order), a call passing a `TypedToken` value does NOT match the first overload (TypedToken is `object`, not assignable to bare `symbol`), so the second overload is selected. A call passing a raw `symbol` matches the first overload (returns `T = unknown` unless caller annotates). Brand `[TYPED_TOKEN_BRAND]: true` (required) keeps TypedToken structurally distinct from any `{ symbol; name }` object lacking the brand.
- **R-4**: redactDetails deep-scan recursion — circular references. Mitigation: WeakSet anti-cycle (Sprint 3.6 I-13 pattern).
- **R-5** (NEW — Amendment 1): `wrapUnknownError` allow-list constraint may surprise consumers who currently rely on inferred `_kind?` ignored behavior. Mitigation: existing behavior `_kind` ignored remains the *runtime* default when `kind` is omitted; new constraint applies only when `kind` is explicitly passed; type-level union narrowing surfaces violations at compile time, not runtime crashes.
- **R-6** (NEW — Amendment 1): SessionDestroyedError relocation could break consumers who imported `import { SessionDestroyedError } from '@gertsai/session-guard'`. Mitigation: re-export shim preserves the import path verbatim; runtime class identity preserved through single source in `@gertsai/errors` (so `instanceof` works across all import surfaces). Adversarial test in session-guard: `instanceof SessionDestroyedError` test for both import paths.

## Invariants

I-1: P2 polish items MUST be additive non-breaking (per ADR-006 I-7 reused). Reviewer attests "additive only" classification at fidelity audit.

I-2: m9s-example use-case input/output signatures MUST NOT change. Wave 5 integration via middleware composition + error wrapping only.

I-3: m9s-example existing 16/16 tests + 1 skipped MUST pass post-integration (regression invariant).

I-4: Session $-mutator throws MUST be `SessionDestroyedError` from `@gertsai/errors` (per Amendment 1 §A1.1 — relocated from session-guard). `instanceof Error` checks still pass (AppError → Error chain).

I-5: TypedToken<T> overload MUST be ADDITIVE to ProviderContext interface — existing `get<T>(token: symbol)` overload preserved.

I-6: redactDetails deep-scan MUST use WeakSet anti-cycle + max depth 5 (Sprint 3.6 I-13 pattern reuse). NO infinite recursion on circular details.

I-7: All new tests follow Sprint 3.6 §template + Sprint 3.7+3.8+3.9 patterns (adversarial fixtures, conformance tests).

I-8: SPDX header on every new `.ts` file per ADR-005 I-5.

I-9: Per-track strategy markers (F+ / E+) MUST appear in SPEC-015 prior to Build.

I-10 (Amendment 1): `SessionDestroyedError` MUST live in `@gertsai/errors` (Shared Kernel). `@gertsai/session-guard` MUST re-export for backward compat. `@gertsai/session` MUST NOT peer-depend on `@gertsai/session-guard` (tier discipline preservation per ADR-006 §D + Amendment 1 §A1.1).

I-11 (Amendment 1): `wrapUnknownError(x, kind?, correlationId?)` `kind?` parameter MUST be a **closed allow-list**: `'INTERNAL' | 'EXTERNAL'` only (server-side wrap targets per ADR-006 §A1.5 bucket). Reject `'NOT_FOUND' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'VALIDATION' | 'CONFLICT' | 'RATE_LIMITED' | 'UPSTREAM_FAILURE' | 'BAD_GATEWAY' | 'TIMEOUT'` at type level (TS 2-arity union); `isAppError(x)` early-return MUST stay first (no kind override on already-typed errors). Adversarial test required: `wrapUnknownError(new InternalError(...), 'EXTERNAL')` MUST return original InternalError unchanged. Mitigates CWE-285 (error coercion for auth bypass).

I-12 (Amendment 1): `TypedToken<T>` discrimination MUST use **required brand `[TYPED_TOKEN_BRAND]: true`** as sole runtime discriminator. The optional phantom field `__phantom_T__?: T` (originally proposed) is **dropped** — under TypeScript `strict`, optional readonly properties are *covariant* not *invariant*, so the phantom does not anchor `T`. TypeScript already infers `T` from parameter position `get<T>(token: TypedToken<T>): T`; no anchor field needed for inference. `[TYPED_TOKEN_BRAND]` MUST be a module-private `Symbol(...)` (NOT `Symbol.for(...)`) per Sprint 3.8 I-11 (CWE-1321). `isTypedToken` MUST use `Object.prototype.hasOwnProperty.call(value, TYPED_TOKEN_BRAND)` (NOT prototype-walking property access).

I-13 (Amendment 1): `ProviderContext.get`/`getOptional` runtime implementations MUST extract `.symbol` from `TypedToken<T>` BEFORE calling `assertSymbolToken` — i.e. `const sym = isTypedToken(token) ? token.symbol : token;` then proceed. Without this, `provider-context.ts:35-41` throws `TypeError` for any TypedToken caller (current `assertSymbolToken` rejects non-symbol input).

I-14 (Amendment 1): `m9s-example` `composition/` MUST include an inline `// SECURITY:` comment adjacent to any `trustProxy: true` config call (CWE-639 cargo-cult prevention). `examples/m9s-example/README.md` Wave 5 reference section MUST contain an explicit ⚠️ SECURITY block warning consumers about reverse-proxy header-strip preconditions. Reviewer attestation required at post-Build audit.

I-15 (Amendment 1): `redactDetails` deep-scan classification — bump for `@gertsai/errors` is **MINOR** (not patch). Rationale: shallow→recursive is observable behavior change for already-shipped consumers whose nested details contain redaction-key matches. Alternative considered: opt-in `{ deep?: boolean = false }` flag with patch bump — rejected, deep redaction is the safer default for security-critical surface and consumers expecting shallow are the minority.

I-16 (Amendment 1): All new README sections (TypedToken section in `runtime-context`, Wave 5 reference section in `m9s-example`) MUST follow Sprint 3.6 §template structure: `Install / Quickstart / API / Compatibility / Security / Cross-references / License`. Inline section outlines provided in SPEC-015 Amendment 1.4-1.5 (eliminates worker paraphrase drift per EVID-016 §5 lesson).

## Evidence Requirements

- E-1: SPEC-015 active с per-track markers + Amendment 1 applied.
- E-2: m9s-example regression — 16/16 tests pass post-integration.
- E-3: Session-guard regression — 47/47 tests pass post-Session-mutator migration; new test asserting `instanceof SessionDestroyedError` works for imports from BOTH `@gertsai/errors` AND `@gertsai/session-guard`.
- E-4: New polish tests cover P2 items where applicable (e.g., redactDetails deep-scan adversarial; wrapUnknownError kind allow-list reject).
- E-5: TypedToken<T> compile-time narrowing test (test-d.ts fixture) + isTypedToken brand-pollution adversarial test.
- E-6: m9s-example demonstrates Wave 5 patterns: errors taxonomy, tenant-resolver chain, runtime-context middleware, session-guard assertions.
- E-7: Sprint 3.10 atomic commit on `feat/sprint-3-10-wave-5-polish` branch.

## Implementation Plan

### Phase 0: Pre-conditions
- [x] **0.1** PRD-003 active; EVID-016 (Wave 5 close) active.
- [x] **0.2** ADR-010 active.

### Phase 1: SPEC-015 + Pre-Build audit (Sprint 3.10)
- [x] **1.1** SPEC-015 draft с W-3-10-1..N items.
- [x] **1.2** Pre-Build audit (5 reviewers parallel, 10 reports).
- [x] **1.3** Address P0/P1 audit findings via Amendment 1.
- [ ] **1.4** SPEC-015 Amendment 1 applied + activated.

### Phase 2: Sprint 3.10 Build (4 parallel workers + team-lead)
- [ ] **2.1** AgentTeams Wave 1: 4 workers (polish, m9s-integration, session-mutator, typed-token).
- [ ] **2.2** Team-lead Phase B: integrated verify.
- [ ] **2.3** CLAUDE.md update (если есть surface change); changesets.

### Phase 3: Post-Build audit + Activate
- [ ] **3.1** Post-Build fidelity audit (4 reviewers parallel).
- [ ] **3.2** Address P0/P1 findings (if any).
- [ ] **3.3** EVID-017 active.
- [ ] **3.4** SPEC-015 active (final).
- [ ] **3.5** Single atomic commit.
- [ ] **3.6** Hindsight retain Group 42.

## Affected Files (predicted, post-Amendment 1)

- `packages/errors/src/{helpers,redaction}.ts` (P2 polish)
- `packages/errors/src/session.ts` (NEW — SessionDestroyedError relocated; per A1.4)
- `packages/errors/src/index.ts` (export SessionDestroyedError)
- `packages/errors/__tests__/{redaction-deep,session-error}.test.ts` (NEW × 2)
- `packages/errors/README.md` (P2 polish — absolute paths)
- `packages/tenant-resolver/src/moleculer/index.ts` (P2 polish — error message)
- `packages/tenant-resolver/src/strategies/{path,header-lookup}.ts` (P2 JSDoc)
- `packages/session/src/Session.ts` (Session $-mutator migration to SessionDestroyedError from @gertsai/errors; comment compress lines 19-22)
- `packages/session/__tests__/scoping.test.ts` (P2 stale comment compress) — NOTE: path WITHOUT `src/` prefix per A1 §file-ownership-fix
- `packages/session-guard/src/errors.ts` (replace local class with re-export shim per A1.1)
- `packages/session-guard/__tests__/session-destroyed-error.test.ts` (NEW — instanceof identity test for both import paths)
- `packages/runtime-context/src/auth-context.ts` (P2 JSDoc)
- `packages/runtime-context/src/provider-context.ts` (TypedToken<T> overload + assertSymbolToken extraction per I-13)
- `packages/runtime-context/src/typed-token.ts` (NEW — defineToken<T> + isTypedToken)
- `packages/runtime-context/src/index.ts` (export TypedToken, defineToken, isTypedToken)
- `packages/runtime-context/__tests__/{typed-token,typed-token.test-d}.ts` (NEW × 2)
- `packages/runtime-context/README.md` (TypedToken section per I-16 + SPEC §A1.4)
- `packages/entity-storage/src/BaseEntityStorageService.ts` (P2 upsert JSDoc)
- `packages/entity-react/src/adapter.ts` (P2 markRaw JSDoc)
- `packages/rest-request-manager/src/manager.ts` (P2 error.cause chain)
- `packages/async-utils/src/retry.ts` (P2 JSDoc cross-ref)
- `examples/m9s-example/src/composition/**` (Wave 5 middleware composition + // SECURITY: comment per I-14)
- `examples/m9s-example/src/application/**` (errors + session-guard usage)
- `examples/m9s-example/package.json` (Wave 5 deps × 4 — NO session-guard peer-dep needed in session)
- `examples/m9s-example/README.md` (§Wave 5 reference section + ⚠️ SECURITY block per I-14, I-16)
- `CLAUDE.md` (tier-table 2 row diffs per SPEC §A1.5)
- `pnpm-lock.yaml`
- `.changeset/sprint-3-10-{polish,m9s-integration,session-mutator,typed-token}.md` (NEW × 4 — inline templates in SPEC §A1.4)
- `.forgeplan/evidence/EVID-017-sprint-3-10-shipped.md` (NEW)

## Admissibility

NOT admissible:
- NOT: Breaking changes to public APIs.
- NOT: Changing m9s-example use-case signatures.
- NOT: Removing existing API surface.
- NOT: Skipping SPDX headers / Sprint 3.6 §template.
- NOT (Amendment 1): Adding peer-dep from `@gertsai/session` on `@gertsai/session-guard` (tier inversion).
- NOT (Amendment 1): Using `Symbol.for(...)` for `TYPED_TOKEN_BRAND` (CWE-1321).
- NOT (Amendment 1): Allowing `wrapUnknownError(x, kind)` with `kind` outside `'INTERNAL' | 'EXTERNAL'` allow-list.

## Rollback Plan

**Triggers**:
- m9s integration breaks 16/16 tests.
- Session $-mutator migration breaks consumer catching exact error message.
- TypedToken<T> overload conflict с symbol resolution.
- SessionDestroyedError relocation breaks `instanceof` for one of the import paths.

**Steps**:
1. `git revert` Sprint 3.10 commit.
2. P2 items individually revertable (no cross-dependency).
3. SessionDestroyedError relocation: revert `errors/src/session.ts` add + restore `session-guard/src/errors.ts` local class. Backward-compat preserved.

**Blast Radius**: low. All changes additive non-breaking.

## Affected Files (baseline)

| File | Baseline Hash |
|------|---------------|
| packages/{errors,tenant-resolver,session,session-guard,runtime-context,entity-storage,entity-react,rest-request-manager,async-utils}/** | post-Sprint 3.9 (commit `c6896c4`) |
| examples/m9s-example/** | post-Sprint 3.5.2.1 |
| CLAUDE.md | post-Sprint 3.9 |

## AI Guidance

> Sprint 3.10 worker rules (post-Amendment 1):
- **polish-worker**: 15 P2 items batch. Each strictly additive. `wrapUnknownError` `kind?` MUST be `'INTERNAL' | 'EXTERNAL'` allow-list (I-11). `redactDetails` deep-scan = MINOR bump for errors (I-15). Test coverage preserved/added (especially redactDetails deep-scan adversarial).
- **m9s-integration-worker**: F+ additive only. Wrap throws, add middleware. NO use-case signature changes. 16/16 regression invariant. `// SECURITY:` inline + ⚠️ SECURITY README block adjacent to `trustProxy: true` (I-14).
- **session-mutator-worker**: import `SessionDestroyedError` directly from `@gertsai/errors` (already peer-dep — NO new dep needed per A1.1). Existing message preserved verbatim. Also handles polish lines 19-22 in Session.ts + `__tests__/scoping.test.ts:13-17` (path WITHOUT `src/` prefix).
- **errors-relocation-worker** (NEW per A1.1): adds `SessionDestroyedError` to `@gertsai/errors`; updates `session-guard/src/errors.ts` to re-export; adds adversarial instanceof tests in both packages.
- **typed-token-worker**: additive ProviderContext overload. defineToken<T> wrapper. Module-private `Symbol(...)` brand (NOT `Symbol.for`). Required `[TYPED_TOKEN_BRAND]: true` discriminator (NO `__phantom_T__` field per I-12). `assertSymbolToken` extraction in `provider-context.ts` (I-13). Compile-time narrowing test fixture (test-d.ts) + brand-pollution adversarial test.
- All: SPDX headers; Sprint 3.6 §template for any new files; tsup external if cross-package.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5) | PRD | based_on |
| ADR-009 (Wave 5 Phase 4) | ADR | refines (Sprint 3.10 closes Wave 5 backlog) |
| ADR-008 (Wave 5 Phase 3) | ADR | informs |
| ADR-007 (Wave 5 Phase 2) | ADR | informs (Session-guard SessionDestroyedError reuse, ProviderContext extension) |
| ADR-006 (Wave 5 Phase 1) | ADR | informs (errors taxonomy reuse, Shared Kernel relocation per A1.1) |
| EVID-016 (Wave 5 close) | Evidence | based_on |

> **Next step**: SPEC-015 Amendment 1 applied → Build (4∥) → post-Build audit → EVID-017 → Activate. Sprint 3.10 closes Wave 5 polish + integration backlog.

---

## Amendment 1 (Pre-Build audit synthesis)

Applied after 5∥ pre-Build audit (architect / security / ddd / typescript / docs reviewers; 10 reports synthesized). Convergent findings (≥2 reviewers) are mandatory; substantive single-reviewer findings adopted where cheap.

### A1.1 — P0 resolution: SessionDestroyedError relocation (Decision C revised)

**Convergent finding** (architect-1 + architect-2 + ddd-1 + ddd-2): Track 3 as originally specified introduces tier-direction violation — `@gertsai/session` (Tier 1) gaining peer-dep on `@gertsai/session-guard` (Tier 2). Combined with existing `session-guard → session` peer-dep this creates a circular peer-dependency graph. pnpm resolves via workspace symlinks, but external consumers receive peer-warning loops, and tier discipline (held for 4 prior Wave 5 sprints) is broken.

**Decision C revised**:

`SessionDestroyedError` is **moved** from `@gertsai/session-guard` to `@gertsai/errors`. Rationale: it is structurally `ConflictError<{ contextField: 'session' }>` — pure taxonomy with no logic. `@gertsai/errors` is already declared **Shared Kernel** for the `@gertsai/*` ecosystem (ADR-006 §D §6). `@gertsai/session-guard` adds a re-export shim (`export { SessionDestroyedError } from '@gertsai/errors'`) preserving the existing import path for backward compat — published consumers see no breaking change.

`@gertsai/session` imports `SessionDestroyedError` directly from `@gertsai/errors` (already a peer-dep). **No new peer-deps added; tier discipline preserved.** `createRequire` complexity from W-3-10-24 is eliminated.

### A1.2 — New invariants (extend §Invariants)

I-10..I-16 codified into the §Invariants block above (avoiding duplication). Cross-reference: Decision C (revised), Decision D (revised), Decision A (W-3-10-1 + W-3-10-3 reclass), Decision B (W-3-10-18 SECURITY).

### A1.3 — Updated Risks

R-3 reformulation, R-5, R-6 codified into the §Risks block above (avoiding duplication).

### A1.4 — Affected Files (delta)

- `packages/errors/src/index.ts` — add `SessionDestroyedError` export.
- `packages/errors/src/session.ts` (NEW, ~5 LOC) — `class SessionDestroyedError extends ConflictError<{ contextField: 'session' }> {}`.
- `packages/errors/__tests__/session-error.test.ts` (NEW) — instance + serialization test.
- `packages/session-guard/src/errors.ts` — replace local class def with `export { SessionDestroyedError } from '@gertsai/errors'` re-export shim.
- `packages/session-guard/__tests__/session-destroyed-error.test.ts` — test that `import` from session-guard still yields class identity match with `import` from errors.
- `packages/session/src/Session.ts` — `import { SessionDestroyedError } from '@gertsai/errors';` (peer-dep already present); replace bare `Error` throws on lines 229, 248.
- ~~`packages/session/package.json` peer-dep on session-guard~~ — REMOVED from scope (not needed under A1.1).
- ~~`createRequire(import.meta.url)` lazy resolution~~ — REMOVED from scope (not needed under A1.1).

### A1.5 — Affected Decisions cross-link

- Decision A (P2 polish batch) — W-3-10-3 changeset bump revised to **minor** for `@gertsai/errors` per I-15.
- Decision B (m9s integration) — adds CWE-639 SECURITY warning + inline `// SECURITY:` comment per I-14.
- Decision C (Session $-mutator migration) — REVISED per A1.1; tier-discipline preserved.
- Decision D (TypedToken<T>) — REVISED per I-12 + I-13; phantom field dropped, brand-only discrimination, assertSymbolToken extraction required.
- Decision E (invariants) — extends with I-10..I-16 above.

### A1.6 — Audit verdicts

| Reviewer | Verdict | Convergent findings | Adopted |
|---|---|---|---|
| architect-reviewer (×2) | GO-WITH-FIXES | P0 tier violation, R-3 wording, file ownership path, redactDetails minor | All adopted (A1.1, R-3 reformulated, SPEC §A1.6, I-15) |
| security-reviewer (×2) | PROCEED with fixes | wrapUnknownError allow-list, SessionDestroyedError details lock, m9s trustProxy SECURITY | All adopted (I-11, I-14, SPEC §A1.7) |
| ddd-reviewer (×2) | APPROVE with fixes | SessionDestroyedError tier direction, wrapUnknownError kind subset, BC labels | All adopted (A1.1, I-11, SPEC §A1.5) |
| typescript-reviewer (×2) | APPROVE/GREEN with fixes | Phantom field invariance issue, assertSymbolToken extraction, R-3 wording | All adopted (I-12, I-13, R-3 reformulated) |
| docs-reviewer (×2) | BLOCKED on inline templates | 4 changeset bodies, TypedToken README, m9s §Wave 5, CLAUDE.md diffs, scope of W-3-10-5 | All adopted (SPEC §A1.4-§A1.7, I-16) |

Net Amendment count: **6 new invariants (I-10..I-16)**, **2 new risks (R-5, R-6)**, **1 risk reformulated (R-3)**, **1 Decision revised (C)**, **3 Decisions extended (A/B/D)**, **2 alternatives added (C2/C3, D2)**. Build proceeds after SPEC-015 Amendment 1 applied.


