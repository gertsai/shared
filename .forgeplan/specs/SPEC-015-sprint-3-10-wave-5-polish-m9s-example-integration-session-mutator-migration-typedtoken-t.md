---
depth: standard
id: SPEC-015
kind: spec
last_modified_at: 2026-05-07T07:46:37.084887+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-003
  relation: based_on
- target: ADR-010
  relation: based_on
status: active
title: Sprint 3.10 — Wave 5 polish + m9s-example integration + Session $-mutator migration + TypedToken<T>
---

# SPEC-015: Sprint 3.10 — Wave 5 polish + m9s-example integration

## Summary

Sprint 3.10 = maintenance / closure sprint per ADR-010 Decisions A/B/C/D/E + Amendment 1 (10-report pre-Build audit synthesis). 4 disjoint tracks executed by 4∥ AgentTeams workers. Strictly additive non-breaking. Branch `feat/sprint-3-10-wave-5-polish` off `feat/sprint-3-9-wave-5-phase-4`.

Estimated 16-20h ≈ 1 working week.

## Scope

### Track 1: P2 polish batch (T1, F+ marker)

15 P2 items from KNOWN-ISSUES §11 + Sprint 3.7-3.9 fidelity P2 notes per ADR-010 Decision A.

**`@gertsai/errors`** (5 items):
- **W-3-10-1**: `wrapUnknownError(x, kind?, correlationId?)` — accept `kind?` parameter and apply to resulting AppError. **Amendment 1 (§A1.2)**: `kind?` MUST be **closed allow-list `'INTERNAL' | 'EXTERNAL'`** (TS 2-arity union); `isAppError(x)` early-return MUST stay first; dispatch on kind to concrete subclass. Update tests + add adversarial test `wrapUnknownError(new InternalError(...), 'EXTERNAL')` MUST return original unchanged. `src/helpers.ts`.
- **W-3-10-2**: `AppError` constructor — add JSDoc note re: shallow Object.freeze (deep-freeze deferred). `src/app-error.ts`.
- **W-3-10-3**: `redactDetails()` — switch to deep-scan recursive (max depth 5, WeakSet anti-cycle per Sprint 3.6 I-13 reuse). **Amendment 1 (§A1.3)**: bump for `@gertsai/errors` is **MINOR** (per ADR-010 I-15) — observable behavior change for nested redaction; add **breadth cap (1000 keys per object)** + truncation marker `'[REDACTED:depth]'` for depth > 5; skip non-plain objects (Date, RegExp, Buffer leave as-is). NEW test `__tests__/redaction-deep.test.ts` (≥6 tests).
- **W-3-10-4**: `errors/internal.ts` — JSDoc clarification (catch-all D intentional; subclassing path).
- **W-3-10-5**: README cross-references — switch to absolute repo URL paths. **Amendment 1 (§A1.5 docs scope)**: scope **expanded to ALL 13 Wave 5 packages** — sed one-liner across READMEs.

**`@gertsai/tenant-resolver`** (3 items):
- **W-3-10-6**: `MOLECULER_INSTALL_HINT` rename — split into `NON_MOLECULER_CTX_ERROR` and `MOLECULER_PEER_DEP_ERROR`. `src/moleculer/index.ts`.
- **W-3-10-7**: PathStrategy `...` wildcard — JSDoc note: only valid as trailing token. `src/strategies/path.strategy.ts`.
- **W-3-10-8**: `lookupHeader()` exact-case-first — JSDoc precedence note. `src/strategies/header-lookup.ts`.

**`@gertsai/session`** (2 items, REASSIGNED to shared-kernel-worker per Amendment 1 §A1.5):
- **W-3-10-9**: `__tests__/scoping.test.ts:13-17` stale stub comment — compress to 1-line. **Amendment 1 fix**: path is `packages/session/__tests__/scoping.test.ts` (WITHOUT `src/` prefix; verified via `ls`).
- **W-3-10-10**: `Session.ts:19-22` post-swap history comment — compress.

**`@gertsai/runtime-context`** (1 item):
- **W-3-10-11**: `requireAuthContextWithDataAccess` JSDoc — clarify Session.dataAccessUuid getter fallback semantic. `src/auth-context.ts`.

**`@gertsai/entity-storage`** (1 item):
- **W-3-10-12**: `BaseEntityStorageService.upsert` — JSDoc note about 2-RTT cost (cross-link KNOWN-ISSUES §10).

**`@gertsai/entity-react`** (1 item):
- **W-3-10-13**: `markRaw` `configurable: false` — JSDoc note. `src/adapter.ts`.

**`@gertsai/rest-request-manager`** (1 item):
- **W-3-10-14**: `manager.ts` — log `error.cause` chain on transport failure.

**`@gertsai/async-utils`** (1 item):
- **W-3-10-15**: `retry` JSDoc — cross-reference to thundering herd Sprint 3.9 Amendment 1.2.7.

### Track 2: m9s-example Wave 5 integration (T2, E+ marker)

Per ADR-010 Decision B. Strictly additive — F+ regression invariant: 16/16 tests pass post-integration.

- **W-3-10-16**: `examples/m9s-example/package.json` — add Wave 5 deps (4 workspace:*).
- **W-3-10-17**: Wrap domain throws с AppError subclasses; `wrapUnknownError(e, 'INTERNAL')` for transports. **Amendment 1**: `kind` only `'INTERNAL' | 'EXTERNAL'` per I-11.
- **W-3-10-18**: Add `tenantMiddleware` to broker config. `HeaderStrategy({ trustProxy: true })` + `ChainTenantResolver`. **Amendment 1 (§A1.6 + ADR-010 I-14)**: inline `// SECURITY:` comment adjacent to `trustProxy: true`.
- **W-3-10-19**: Add `sessionMiddleware` to broker config (composes RequestContext per-request).
- **W-3-10-20**: Replace ad-hoc auth checks с `assertAuthenticated` / `assertSessionInTenant`.
- **W-3-10-21**: NEW integration test `tests/wave5-integration.test.ts` (≥3 tests).
- **W-3-10-22**: `examples/m9s-example/README.md` — Wave 5 reference section per Sprint 3.6 §template + ⚠️ SECURITY block per I-14, I-16. Inline outline §A1.7.

### Track 3: Shared-kernel relocation + Session $-mutator migration (T3, E+ marker) — REVISED per Amendment 1 §A1.1

- **W-3-10-23 (REVISED)**: `packages/errors/src/session.ts` (NEW, ~5 LOC) + `packages/errors/src/index.ts` export — `class SessionDestroyedError extends ConflictError<{ contextField: 'session' }> {}`. NEW `packages/errors/__tests__/session-error.test.ts` — instance + serialization + details-shape lock test.
- **W-3-10-24 (REVISED)**: `packages/session-guard/src/errors.ts` — REPLACE local class with `export { SessionDestroyedError } from '@gertsai/errors';` re-export shim. NEW `packages/session-guard/__tests__/session-destroyed-error.test.ts` — single-source identity test.
- **W-3-10-25 (REVISED)**: `packages/session/src/Session.ts` — `import { SessionDestroyedError } from '@gertsai/errors';`; replace bare `Error` throws on lines 229, 248. **Amendment 1**: NO peerDependenciesMeta, NO createRequire — direct import (Shared Kernel). Update `packages/session/__tests__/Session.test.ts` (path WITHOUT `src/`). Details schema lock: `expect(err.details).toEqual({ contextField: 'session' })`.
- **W-3-10-25a (NEW)**: `packages/session/src/Session.ts:19-22` polish comment compress (formerly W-3-10-10) — handled by shared-kernel-worker.
- **W-3-10-25b (NEW)**: `packages/session/__tests__/scoping.test.ts:13-17` polish comment compress (formerly W-3-10-9).

### Track 4: TypedToken<T> wrapper (T4, F+ marker) — REVISED per Amendment 1 §A1.4

- **W-3-10-26 (REVISED)**: NEW `packages/runtime-context/src/typed-token.ts` — `TypedToken<T>` interface + `defineToken<T>` + `isTypedToken`. **NO `__phantom_T__`** — required brand `[TYPED_TOKEN_BRAND]: true` is sole runtime discriminator (per ADR-010 I-12). Module-private `Symbol(...)` per Sprint 3.8 I-11. `Object.freeze` returned object. `Object.prototype.hasOwnProperty.call` for brand check.
- **W-3-10-27 (REVISED)**: `packages/runtime-context/src/provider-context.ts` — extend interface with TypedToken<T> overloads (symbol FIRST, TypedToken SECOND). DefaultProviderContext: `const sym = isTypedToken(token) ? token.symbol : token;` BEFORE `assertSymbolToken(sym)` (per ADR-010 I-13).
- **W-3-10-28**: `packages/runtime-context/src/index.ts` — export `TypedToken`, `defineToken`, `isTypedToken`.
- **W-3-10-29 (EXTENDED)**: NEW tests:
  - `__tests__/typed-token.test.ts` — defineToken unique symbol; brand resists forgery; **adversarial Object.prototype pollution test**.
  - `__tests__/typed-token.test-d.ts` — `expectTypeOf` compile-time narrowing fixture.
  - `__tests__/provider-context.test.ts` — extend with TypedToken overload tests.
- **W-3-10-29a (NEW per Amendment 1 §A1.7)**: `packages/runtime-context/README.md` — `## TypedToken<T>` section per Sprint 3.6 §template (inline outline §A1.7).

### Track 5: Phase B Integration (T5, team-lead solo)

- **W-3-10-30**: `pnpm install` (39 packages baseline, m9s-example +4 workspace deps).
- **W-3-10-31**: `pnpm build` — 39 packages + m9s-example green.
- **W-3-10-32**: `pnpm test` — target ≥4843 + ~12-15 new tests → ≥4855.
- **W-3-10-33**: `pnpm typecheck` + `depcruise` + `lint` + publint — all green.
- **W-3-10-34 (REVISED per Amendment 1 §A1.6)**: 4 changesets — bump levels corrected:
  - `.changeset/sprint-3-10-polish.md` (**MINOR for `@gertsai/errors`** per I-15; patch for 6 others).
  - `.changeset/sprint-3-10-m9s-integration.md` (patch m9s-example).
  - `.changeset/sprint-3-10-session-mutator.md` (**MINOR for `@gertsai/errors`** — adds SessionDestroyedError; patch session, session-guard).
  - `.changeset/sprint-3-10-typed-token.md` (**MINOR for `@gertsai/runtime-context`** — additive TypedToken<T>).

### Track 6: Phase C+D Audit + Evidence (T6, team-lead solo)

- **W-3-10-35**: Post-Build fidelity audit — 4 reviewers parallel.
- **W-3-10-36**: Address P0/P1 findings (if any).
- **W-3-10-37**: Create EVID-017 (CL3, supports) via `forgeplan_new`.
- **W-3-10-38**: Activate SPEC-015 (final).
- **W-3-10-39**: Single atomic commit `feat(monorepo): Sprint 3.10 — Wave 5 polish + m9s integration + Session $-mutator migration + TypedToken<T>`.
- **W-3-10-40**: Hindsight retain Group 42.

## Out of scope

- HTTP framework adapter for runtime-context (Express/Fastify) — Wave 6+.
- Web/Fetch HttpRequestLike adapter for tenant-resolver — Wave 6+.
- Postgres listener implementation for pg-client/storage — Wave 6+.
- `@gertsai/auth-moleculer` extraction — separate ADR + Wave 6+.
- Session deep-freeze of details — defer.
- v0.2.0 publish gate — separate user confirmation.

## Strategy markers

| Track | Marker |
|---|---|
| T1 polish | F+ (additive only; W-3-10-3 deep-scan classified MINOR per A1.3) |
| T2 m9s integration | E+ |
| T3 Shared-kernel relocation + Session $-mutator | E+ (additive — single-source identity preserved via re-export shim) |
| T4 TypedToken<T> | F+ (additive overload + brand-only discrimination) |

## Data Models

### TypedToken<T> (Track 4, REVISED per Amendment 1 §I-12)

```typescript
// SPDX-License-Identifier: Apache-2.0

// Module-private — NOT Symbol.for (CWE-1321 prevention per Sprint 3.8 I-11)
const TYPED_TOKEN_BRAND = Symbol('typed-token');

export interface TypedToken<T> {
  readonly symbol: symbol;
  readonly name: string;
  readonly [TYPED_TOKEN_BRAND]: true; // REQUIRED brand — sole runtime discriminator
  // NO __phantom_T__ field per Amendment 1 §I-12 (optional readonly is covariant under TS strict)
}

export function defineToken<T>(name: string): TypedToken<T> {
  return Object.freeze({
    symbol: Symbol(`@gertsai/runtime-context:user-token:${name}`),
    name,
    [TYPED_TOKEN_BRAND]: true as const,
  }) as TypedToken<T>;
}

export function isTypedToken(value: unknown): value is TypedToken<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, TYPED_TOKEN_BRAND)
  );
}

export interface ProviderContext {
  get<T>(token: symbol): T;
  get<T>(token: TypedToken<T>): T;
  getOptional<T>(token: symbol): T | undefined;
  getOptional<T>(token: TypedToken<T>): T | undefined;
}

class DefaultProviderContext implements ProviderContext {
  get<T>(token: symbol | TypedToken<T>): T {
    const sym = isTypedToken(token) ? token.symbol : token;
    assertSymbolToken(sym);
    return this._lookup(sym) as T;
  }
}
```

### SessionDestroyedError (Track 3, NEW location per Amendment 1 §A1.1)

```typescript
// SPDX-License-Identifier: Apache-2.0
// packages/errors/src/session.ts (NEW, Sprint 3.10)
import { ConflictError } from './conflict';

/**
 * Thrown when an operation is attempted on a destroyed session.
 * Shared Kernel error per ADR-010 Amendment 1 §A1.1.
 */
export class SessionDestroyedError extends ConflictError<{
  contextField: 'session';
}> {}
```

```typescript
// packages/session-guard/src/errors.ts (re-export shim)
export { SessionDestroyedError } from '@gertsai/errors';
```

## Acceptance Checklist

- [ ] T1 (W-3-10-1..15): 15 P2 items closed; W-3-10-1 allow-list enforced + adversarial test; W-3-10-3 deep-scan + breadth cap + ≥6 tests; W-3-10-5 scope all 13 Wave 5 packages.
- [ ] T2 (W-3-10-16..22): m9s-example integrates Wave 5; 16/16 regression preserved + ≥3 new tests; ⚠️ SECURITY block + inline `// SECURITY:` per I-14.
- [ ] T3 (W-3-10-23..25b REVISED): SessionDestroyedError relocated to errors; session-guard re-exports; session imports from errors; instanceof identity test passes both paths; details schema lock; tier discipline preserved.
- [ ] T4 (W-3-10-26..29a REVISED): TypedToken<T>+defineToken+isTypedToken without `__phantom_T__`; brand-only; assertSymbolToken extraction; tests + test-d + brand-pollution adversarial; runtime-context README §TypedToken section.
- [ ] T5 (W-3-10-30..34 REVISED): full repo verify green; 4 changesets with corrected bump levels.
- [ ] T6 (W-3-10-35..40): post-Build audit; EVID-017 active; commit; Hindsight Group 42.

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | m9s integration breaks 16/16 tests | F+ additive only; reviewer attestation |
| R-2 | Session $-mutator migration breaks consumer catching exact message | SessionDestroyedError preserves message verbatim; instanceof Error chain |
| R-3 | TypedToken<T> overload conflict с symbol | Required brand `[TYPED_TOKEN_BRAND]` discriminates; declaration order: symbol first, TypedToken second |
| R-4 | redactDetails deep-scan circular references | WeakSet anti-cycle + max depth 5 + breadth cap 1000 |
| R-5 | m9s-example tests timing-sensitive | additive middleware; existing fixtures preserved |
| R-6 (NEW) | SessionDestroyedError relocation breaks `instanceof` | Re-export shim preserves single class identity; adversarial test |
| R-7 (NEW) | wrapUnknownError allow-list TS error breaks existing callers | TS compile-time narrowing — no runtime crash; existing callers without `kind` arg unaffected |

## File ownership matrix (REVISED per Amendment 1 §A1.5)

| Worker | Owns |
|---|---|
| **polish-worker** (T1, REVISED scope) | `packages/errors/src/{helpers,redaction,app-error,internal}.ts` (W-3-10-1..4); `packages/errors/__tests__/redaction-deep.test.ts` (NEW); `packages/errors/README.md`; `packages/{tenant-resolver,runtime-context,session-guard,audit-primitives,entity-vue,entity-react,entity-solid,entity-svelte,async-utils,logger-factory,rpc-proxy-builder,rest-request-manager}/README.md` (W-3-10-5 expanded scope); `packages/tenant-resolver/src/moleculer/index.ts` + `src/strategies/{path,header-lookup}.strategy.ts`; `packages/runtime-context/src/auth-context.ts`; `packages/entity-storage/src/BaseEntityStorageService.ts`; `packages/entity-react/src/adapter.ts`; `packages/rest-request-manager/src/manager.ts`; `packages/async-utils/src/retry.ts`. **Does NOT touch session-package files** (handed off to shared-kernel-worker). **Does NOT touch `packages/errors/src/index.ts`** (shared-kernel-worker handles all index updates). |
| **m9s-integration-worker** (T2) | `examples/m9s-example/**` (full directory). |
| **shared-kernel-worker** (T3, RENAMED + EXPANDED) | `packages/errors/src/session.ts` (NEW); `packages/errors/src/index.ts` (export update for SessionDestroyedError); `packages/errors/__tests__/session-error.test.ts` (NEW); `packages/session-guard/src/errors.ts` (re-export shim); `packages/session-guard/__tests__/session-destroyed-error.test.ts` (NEW); `packages/session/src/Session.ts` (FULL — comment + $-mutator); `packages/session/__tests__/scoping.test.ts` (W-3-10-9 polish — path WITHOUT `src/`). |
| **typed-token-worker** (T4) | `packages/runtime-context/src/typed-token.ts` (NEW); `packages/runtime-context/src/provider-context.ts` (overload + assertSymbolToken extraction); `packages/runtime-context/src/index.ts` (exports); `packages/runtime-context/__tests__/{typed-token,typed-token.test-d,provider-context}.ts`; `packages/runtime-context/README.md` (TypedToken section per A1.7). |
| **team-lead Phase B** | `pnpm-lock.yaml`; `.changeset/sprint-3-10-*.md` (NEW × 4 per A1.6); `CLAUDE.md` (tier-table 2 row diffs per A1.7). |

**Conflict-free guarantee**: All paths disjoint. shared-kernel-worker exclusively owns `packages/errors/src/index.ts` updates (since it adds new export); polish-worker doesn't touch index.ts. shared-kernel-worker exclusively owns Session.ts + scoping.test.ts.

## Implementation Plan — AgentTeams (REVISED per Amendment 1)

### Wave 1 (4∥ workers, parallel)

- **polish-worker** (T1) — `agents-domain:typescript-pro`. P2 polish + W-3-10-1 allow-list + W-3-10-3 deep-scan adversarial. Excludes session-package files + errors/src/index.ts.
- **m9s-integration-worker** (T2) — `agents-domain:fullstack-developer` или `agents-core:coder`. m9s-example Wave 5 integration including SECURITY warnings.
- **shared-kernel-worker** (T3, RENAMED) — `agents-domain:typescript-pro`. SessionDestroyedError relocation (errors src + tests + index export, session-guard re-export shim + identity test, session full Session.ts + scoping.test.ts comment compress).
- **typed-token-worker** (T4) — `agents-domain:typescript-pro`. TypedToken<T> wrapper without phantom field; assertSymbolToken extraction; runtime-context README.

### Wave 2 (team-lead solo) — Phase B verify (T5).

### Wave 3 (4∥ reviewers, post-Build) — fidelity audit (T6).

### Wave 4 (team-lead solo) — EVID-017 + commit + Hindsight Group 42.

## Affected Files

**Wave 1 modifies** (post-Amendment 1):
- 8 packages src/ files per polish-worker scope (excluding session-package + errors/index.ts).
- 13 Wave 5 package READMEs per W-3-10-5 expanded scope.
- `examples/m9s-example/` per m9s-integration-worker scope.
- `packages/errors/src/{session.ts (NEW),index.ts}` + `packages/errors/__tests__/session-error.test.ts (NEW)` per shared-kernel-worker.
- `packages/session-guard/src/errors.ts` + `packages/session-guard/__tests__/session-destroyed-error.test.ts (NEW)` per shared-kernel-worker.
- `packages/session/src/Session.ts` (full ownership) + `packages/session/__tests__/scoping.test.ts` per shared-kernel-worker.
- `packages/runtime-context/src/{typed-token.ts (NEW),provider-context.ts,index.ts}` + tests + README per typed-token-worker.

**Wave 2 (team-lead Phase B)**:
- `pnpm-lock.yaml`
- `.changeset/sprint-3-10-{polish,m9s-integration,session-mutator,typed-token}.md` (NEW × 4 — inline templates §A1.6)
- `CLAUDE.md` (tier-table 2 row diffs §A1.7)

**Wave 4 (team-lead Phase D)**:
- New EVID-017 artifact via `forgeplan_new`.

## Related Artifacts

| Artifact | Type | Relation |
|---|---|---|
| PRD-003 (Wave 5) | PRD | based_on |
| ADR-010 (Sprint 3.10) | ADR | based_on |
| ADR-009 (Wave 5 Phase 4) | ADR | informs |
| ADR-008 (Wave 5 Phase 3) | ADR | informs |
| ADR-007 (Wave 5 Phase 2) | ADR | informs (SessionDestroyedError, ProviderContext) |
| ADR-006 (Wave 5 Phase 1) | ADR | informs (errors taxonomy, Shared Kernel relocation per A1.1) |
| EVID-016 (Wave 5 close) | Evidence | informs (Sprint 3.10 closes Wave 5 backlog) |

> **Next step**: SPEC-015 Amendment 1 active → Build (4∥ AgentTeams) → Phase B verify → post-Build audit (4∥) → EVID-017 + commit + Hindsight Group 42.

---

## Amendment 1 (Pre-Build audit synthesis)

Applied after 5∥ pre-Build audit (architect / security / ddd / typescript / docs reviewers; 10 reports synthesized — 5 original + 5 re-spawned across 2 sessions). Convergent findings (≥2 reviewers) are mandatory; substantive single-reviewer findings adopted where cheap. Cross-references ADR-010 Amendment 1 §A1.1-A1.6.

### A1.1 — Track 3 REVISED (SessionDestroyedError relocation)

W-3-10-23/24/25 fully revised in §Scope above. Worker renamed `session-mutator-worker` → `shared-kernel-worker` with expanded scope per §file-ownership-matrix. createRequire complexity removed. Tier discipline preserved (no peer-dep added on `@gertsai/session` to `@gertsai/session-guard`).

### A1.2 — W-3-10-1 wrapUnknownError closed allow-list

Signature constraint: `kind?: 'INTERNAL' | 'EXTERNAL'` (TS 2-arity union). Implementation pattern:

```typescript
// SPDX-License-Identifier: Apache-2.0
// packages/errors/src/helpers.ts (REVISED, Sprint 3.10 W-3-10-1)
import { isAppError } from './app-error';
import { InternalError } from './internal';

type WrappableKind = 'INTERNAL' | 'EXTERNAL';

export function wrapUnknownError(
  x: unknown,
  kind: WrappableKind = 'INTERNAL',
  correlationId?: string,
): AppError {
  // Early-return on already-typed: no kind override per ADR-010 I-11
  if (isAppError(x)) return x;

  const message = x instanceof Error ? x.message : String(x);
  const cause = x instanceof Error ? x : undefined;
  const details: Record<string, unknown> = {};
  if (correlationId) details.correlationId = correlationId;

  // Dispatch on kind to concrete subclass — `kind` allow-list closed at type level
  return new InternalError({ message, cause, details });
  // Note: if 'EXTERNAL' subclass added in future, dispatch via `switch (kind)`.
}
```

Adversarial test: `wrapUnknownError(new InternalError({...}), 'EXTERNAL')` → returns `instanceof InternalError` original (kind override ignored on already-typed input).

### A1.3 — W-3-10-3 redactDetails deep-scan + breadth cap + minor bump

Implementation pattern (Sprint 3.6 I-13 reuse + breadth cap):

```typescript
// SPDX-License-Identifier: Apache-2.0
// packages/errors/src/redaction.ts (REVISED, Sprint 3.10 W-3-10-3)
const MAX_DEPTH = 5;
const MAX_BREADTH = 1000;
const REDACTION_KEYS = new Set(['password', 'token', 'authorization', 'secret', 'apikey', 'api_key', 'cookie', 'set-cookie']);

export function redactDetails(d: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();
  return _redact(d, 0, seen) as Record<string, unknown>;
}

function _redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[REDACTED:depth]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[REDACTED:cycle]';
  seen.add(value);

  // Skip non-plain objects (Date, RegExp, Buffer, etc.) — leave as-is per security-2 P2-3
  if (value.constructor !== Object && !Array.isArray(value)) return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_BREADTH).map((item) => _redact(item, depth + 1, seen));
  }

  const entries = Object.entries(value);
  const truncated = entries.length > MAX_BREADTH;
  const result: Record<string, unknown> = {};
  for (const [k, v] of entries.slice(0, MAX_BREADTH)) {
    if (REDACTION_KEYS.has(k.toLowerCase())) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = _redact(v, depth + 1, seen);
    }
  }
  if (truncated) result['__truncated__'] = `[REDACTED:breadth>${MAX_BREADTH}]`;
  return result;
}
```

Test list (≥6 fixtures):
1. Nested redaction at depth 2-4: `{a:{password:'x'}}` → `{a:{password:'[REDACTED]'}}`.
2. Max depth 5 truncation: `{a:{b:{c:{d:{e:{f:{password:'x'}}}}}}}` → depth 6 returns `'[REDACTED:depth]'`.
3. Breadth cap 1000: object with 1500 keys → 1000 + `__truncated__`.
4. Circular reference: no infinite loop, `[REDACTED:cycle]`.
5. Mixed-case keys: `{PASSWORD:'x'}` redacted (lowercase comparison).
6. Object.prototype pollution-resistant: only own enumerable keys (Object.entries semantics).

Bump: `@gertsai/errors` → MINOR (per ADR-010 I-15).

### A1.4 — TypedToken §Data Models REVISED (drop phantom field)

§Data Models block above already revised. Phantom field `__phantom_T__?: T` DROPPED. Discrimination via REQUIRED brand `[TYPED_TOKEN_BRAND]: true`. TS infers T from parameter position `get<T>(token: TypedToken<T>): T`.

### A1.5 — File ownership matrix corrections

Path verifications (via `ls`):
- `packages/session/__tests__/scoping.test.ts` exists at package root, NOT under `src/`. SPEC originally listed wrong path.
- `packages/session-guard/__tests__/` and `packages/errors/__tests__/` similarly at package root.

All `__tests__/` references in this Amendment use the WITHOUT-`src/` form. shared-kernel-worker takes full ownership of `packages/session/src/Session.ts` (both polish lines 19-22 + $-mutator lines 229,248) to eliminate split-file conflict.

### A1.6 — Inline changeset templates (per docs P0-1)

Per EVID-016 §5 lesson "inline templates from start". 4 changeset bodies inline:

**`.changeset/sprint-3-10-polish.md`**:
```markdown
---
'@gertsai/errors': minor
'@gertsai/tenant-resolver': patch
'@gertsai/runtime-context': patch
'@gertsai/entity-storage': patch
'@gertsai/entity-react': patch
'@gertsai/rest-request-manager': patch
'@gertsai/async-utils': patch
---

Sprint 3.10 — Wave 5 P2 polish batch (additive non-breaking).

@gertsai/errors (MINOR, observable behavior change for nested redaction):
- wrapUnknownError(x, kind?, correlationId?) — kind? now applied via closed allow-list 'INTERNAL' | 'EXTERNAL'.
- AppError constructor JSDoc note re shallow Object.freeze.
- redactDetails() now deep-scans recursively (max depth 5, breadth cap 1000, WeakSet anti-cycle).
- errors/internal.ts JSDoc clarification.
- README cross-references switched to absolute repo URLs.

Other Wave 5 packages (PATCH, JSDoc/comment polish): tenant-resolver, runtime-context, entity-storage, entity-react, rest-request-manager, async-utils.

Refs ADR-010 §A + Amendment 1 §A1.2 + §A1.3.
```

**`.changeset/sprint-3-10-m9s-integration.md`**:
```markdown
---
'@gertsai-examples/m9s-example': patch
---

Sprint 3.10 — m9s-example Wave 5 integration (canonical reference).

Adds Wave 5 dep usage:
- @gertsai/errors — wrap domain throws as ValidationError/NotFoundError/InternalError + wrapUnknownError(e, 'INTERNAL').
- @gertsai/tenant-resolver — tenantMiddleware in broker config; HeaderStrategy({ trustProxy: true }).
- @gertsai/runtime-context — sessionMiddleware; use-cases pull RequestContext from ctx.locals.requestContext.
- @gertsai/session-guard — assertAuthenticated / assertSessionInTenant.

NEW integration test tests/wave5-integration.test.ts.

⚠️ SECURITY: trustProxy: true requires upstream proxy stripping inbound X-Tenant-ID. See README §Security.

16/16 regression preserved.

Refs ADR-010 §B + Amendment 1 §A1.6 + I-14.
```

**`.changeset/sprint-3-10-session-mutator.md`**:
```markdown
---
'@gertsai/errors': minor
'@gertsai/session': patch
'@gertsai/session-guard': patch
---

Sprint 3.10 — Shared-kernel relocation of SessionDestroyedError + Session $-mutator throw migration.

@gertsai/errors (MINOR): adds SessionDestroyedError (relocated from session-guard per ADR-010 Amendment 1 §A1.1).

@gertsai/session-guard (PATCH): local class replaced with re-export shim.

@gertsai/session (PATCH): $-mutators now throw SessionDestroyedError from @gertsai/errors instead of bare Error. Message preserved verbatim.

NO new peer-dependencies. Tier discipline preserved.

Refs ADR-010 §C (revised) + Amendment 1 §A1.1.
```

**`.changeset/sprint-3-10-typed-token.md`**:
```markdown
---
'@gertsai/runtime-context': minor
---

Sprint 3.10 — TypedToken<T> wrapper for ProviderContext.get<T>(token).

NEW additive API:
- defineToken<T>(name): TypedToken<T> — type-narrowing wrapper around module-private Symbol.
- isTypedToken(value) — brand-check predicate.
- TypedToken<T> interface with required brand (no phantom field).

ProviderContext.get<T> and getOptional<T> gain TypedToken<T> overloads (existing symbol overloads preserved).

Mitigates Sprint 3.7 R-2. CWE-1321 brand-pollution-resistant.

Refs ADR-010 §D (revised) + Amendment 1 §A1.4 + I-12 + I-13.
```

### A1.7 — Inline README sections + CLAUDE.md row diffs (per docs P1)

**`packages/runtime-context/README.md` — append section**:

```markdown
## TypedToken<T>

Type-narrowing wrapper for DI tokens — eliminates `unknown` returns from `ProviderContext.get`.

### Quickstart

const USER_TOKEN = defineToken<UserService>('UserService');
ctx.providers.register(USER_TOKEN.symbol, userServiceImpl);
const userSvc = ctx.providers.get(USER_TOKEN); // narrowed to UserService

### API

- defineToken<T>(name: string): TypedToken<T>
- isTypedToken(value): value is TypedToken<unknown>
- ProviderContext.get<T>(token: TypedToken<T>): T
- ProviderContext.getOptional<T>(token: TypedToken<T>): T | undefined

### Compatibility

Symbol-keyed callers continue to work — TypedToken overload is additive.

### Security

Brand uses module-private Symbol (NOT Symbol.for) per CWE-1321. isTypedToken uses Object.prototype.hasOwnProperty.call (not prototype-walk).

### Cross-references

- ADR-010 §D + Amendment 1 §I-12, §I-13.
- Sprint 3.8 I-11 — module-private Symbol pattern reuse.
```

**`examples/m9s-example/README.md` — append section**:

```markdown
## Wave 5 stack reference

Canonical composition of @gertsai/* Wave 5 packages.

### Errors taxonomy (@gertsai/errors)

Domain throws use AppError subclasses. Transports wrapped via wrapUnknownError(e, 'INTERNAL'). HTTP boundary uses appErrorToHttpResponse (RFC 9457).

### Tenant resolution (@gertsai/tenant-resolver)

HeaderStrategy({ trustProxy: true }) + ChainTenantResolver as tenantMiddleware in broker config.

### RequestContext composition (@gertsai/runtime-context)

sessionMiddleware composes per-request RequestContext; attached to ctx.locals.requestContext.

### Session-guard assertions (@gertsai/session-guard)

assertAuthenticated / assertSessionInTenant replace ad-hoc auth checks.

### Composition order (canonical)

tenantMiddleware → sessionMiddleware → use-case.

### ⚠️ SECURITY

trustProxy: true assumes a reverse proxy strips inbound X-Tenant-ID. WITHOUT this, any client spoofs the header → CWE-639 cross-tenant data access. See @gertsai/tenant-resolver SECURITY for nginx config.

### Cross-references

- ADR-006 — errors Shared Kernel + tenant-resolver ACL.
- ADR-007 — runtime-context Application Service + session-guard Domain Service.
- ADR-010 — Sprint 3.10 integration rationale.
```

**`CLAUDE.md` tier-table row diffs**:

For `@gertsai/runtime-context` (Tier 4 row): append "+ Sprint 3.10 (F+ — TypedToken<T> overload)" to Source column; append details about defineToken<T>, isTypedToken, ProviderContext overload (brand-only, module-private Symbol).

For `@gertsai/session` (Tier 1 row): append "+ Sprint 3.10 (E+ — $-mutator throws SessionDestroyedError from @gertsai/errors)" to Source column; clarify peer column "errors (peer for *Strict + Sprint 3.10 SessionDestroyedError)".

Sprint counter line update: append "; Sprint 3.10 closes Wave 5 polish backlog + m9s integration + SessionDestroyedError relocation + TypedToken<T>".

### A1.8 — Audit verdicts

| Reviewer | Verdict | Convergent findings | Adopted |
|---|---|---|---|
| architect-reviewer (×2) | GO-WITH-FIXES | P0 tier violation, R-3 wording, file ownership path, redactDetails minor | All adopted |
| security-reviewer (×2) | PROCEED with fixes | wrapUnknownError allow-list, SessionDestroyedError details lock, m9s trustProxy SECURITY | All adopted |
| ddd-reviewer (×2) | APPROVE with fixes | SessionDestroyedError tier direction, wrapUnknownError kind subset, BC labels | All adopted |
| typescript-reviewer (×2) | APPROVE/GREEN with fixes | Phantom field invariance issue, assertSymbolToken extraction, R-3 wording | All adopted |
| docs-reviewer (×2) | BLOCKED on inline templates | 4 changeset bodies, TypedToken README, m9s §Wave 5, CLAUDE.md diffs, scope of W-3-10-5 | All adopted |

Net Amendment count for SPEC-015: **3 W-items revised (W-3-10-1, W-3-10-3, W-3-10-23..25)**, **3 W-items NEW (W-3-10-25a, W-3-10-25b, W-3-10-29a)**, **1 W-item scope-expanded (W-3-10-5)**, **1 worker renamed + scope-expanded (session-mutator → shared-kernel)**, **3 inline templates added (changesets, READMEs, CLAUDE.md diffs)**, **1 §Data Models section revised (TypedToken phantom-field drop)**, **1 §file-ownership-matrix revised (path fixes + worker scope expansion)**.

Build proceeds. AgentTeams Wave 1 launches with 4 workers per revised file ownership matrix.


