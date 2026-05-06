---
depth: standard
id: SPEC-011
kind: spec
last_modified_at: 2026-05-06T15:02:59.593563+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-006
  relation: based_on
status: active
title: Sprint 3.6 — Wave 5 Phase 1 (errors + tenant-resolver + session scoping + P2 polish batch)
---

# SPEC-011: Sprint 3.6 — Wave 5 Phase 1

## Summary

Wave 5 Phase 1 = ship 2 NEW Tier 1 packages (`@gertsai/errors`, `@gertsai/tenant-resolver`) + additive scoping в existing `@gertsai/session` + 7 P2 polish items batch. Per PRD-003 G-1, G-2, G-3, G-7. Per ADR-006 Decisions A, B, C, D. Estimated 28h dev + 4h orchestration ≈ 1 working week.

Scope strictly bounded — NO Wave 5 Phase 2/3/4 work (Sprints 3.7/3.8/3.9 separate). Branch `feat/sprint-3-6-wave-5-phase-1` off `feat/api-core-decomposition` (preserves Wave 4 production-grade state).

## Scope

### Track 1: `@gertsai/errors` package (T1, F marker)

Fresh Tier 1 package per ADR-006 Decision A.

- **W-3-6-1**: Create `packages/errors/` skeleton — `package.json`, `tsconfig.json`, `tsup.config.ts`, `src/index.ts`, `src/__tests__/`, `LICENSE` symlink, `README.md`.
  - Mirror `@gertsai/utils` package shape (Tier 1, no internal deps, root export only initially).
  - Subpath exports: `.`, `./http`, `./grpc`, `./package.json`.
  - typesVersions for Node10 fallback per Sprint 3.0.1 F-4.
  - publishConfig public access.
  - Strategy marker: **F** (fresh).

- **W-3-6-2**: Implement `ErrorKind` enum (10 closed values per ADR-006 §A.1) — `src/error-kind.ts`.

- **W-3-6-3**: Implement `AppError` abstract base + 10 concrete subclasses (per ADR-006 §A.3) — `src/app-error.ts`, `src/errors/{validation,not-found,unauthorized,forbidden,conflict,rate-limited,internal,upstream-failure,timeout,bad-gateway}.ts`.
  - Each subclass: typed `details` shape + frozen `kind` discriminator + `toJSON()` returning `SerializedAppError`.

- **W-3-6-4**: Implement helpers — `src/helpers.ts`:
  - `isAppError(x): x is AppError`
  - `wrapUnknownError(x, kind?): AppError` (preserves cause)
  - `getUserMessage(error, locale?): string` (default English; locale-extensible map).

- **W-3-6-5**: Implement `/http` subpath — `src/http/index.ts`:
  - `httpStatusForKind: Record<ErrorKind, number>` (exhaustive)
  - `appErrorToHttpResponse(err): { status: number; body: ProblemDetails }` (RFC 9457)
  - `parseHttpProblemDetails(body): AppError` (reverse mapping)
  - NO express/fastify/koa runtime imports. `import type` only for `@types/node` HTTP types.

- **W-3-6-6**: Implement `/grpc` subpath — `src/grpc/index.ts`:
  - `grpcStatusForKind: Record<ErrorKind, number>` (uses canonical grpc.status integer codes vendored as constants — NO grpc framework runtime import)
  - `appErrorToGrpcStatus(err): { code: number; message: string; details: unknown }`

- **W-3-6-7**: Tests (≥15 tests):
  - `src/__tests__/error-kind.test.ts` — exhaustive kind enum membership.
  - `src/__tests__/app-error.test.ts` — base class behavior, cause propagation, toJSON.
  - `src/__tests__/subclasses.test.ts` — each subclass `instanceof` AppError + `kind` discriminator + typed details.
  - `src/__tests__/helpers.test.ts` — isAppError, wrapUnknownError, getUserMessage.
  - `src/__tests__/http.test.ts` — exhaustive `httpStatusForKind` mapping; ProblemDetails round-trip.
  - `src/__tests__/grpc.test.ts` — exhaustive `grpcStatusForKind` mapping.

- **W-3-6-8**: README.md — usage examples (catch by kind, transport mapping); cross-link к ADR-006.

### Track 2: `@gertsai/tenant-resolver` package (T2, F marker)

Fresh Tier 1 package per ADR-006 Decision B.

- **W-3-6-9**: Create `packages/tenant-resolver/` skeleton — `package.json`, `tsconfig.json`, `tsup.config.ts`, `src/index.ts`, `LICENSE` symlink, `README.md`.
  - Subpath exports: `.`, `./moleculer`, `./http`, `./package.json`.
  - peerDependencies: `@gertsai/errors: workspace:^`.
  - peerDependenciesMeta: `moleculer: { optional: true }` (only in /moleculer subpath).
  - Strategy marker: **F**.

- **W-3-6-10**: Implement `TenantResolverStrategy<Source>` interface — `src/strategy.ts`. Plus `TenantResolution` type, `HttpRequestLike` duck-type interface.

- **W-3-6-11**: Implement `ChainTenantResolver<Source>` — `src/chain-resolver.ts`. async iterate strategies; first non-null wins; return null if exhausted.

- **W-3-6-12**: Implement built-in HTTP-shaped strategies — `src/strategies/{header,subdomain,path}.strategy.ts`:
  - `HeaderStrategy({ headerName: 'X-Tenant-ID' })` — case-insensitive header read
  - `SubdomainStrategy({ baseDomain: 'gertsai.dev' })` — extract subdomain segment
  - `PathStrategy({ pathPattern: '/t/:tenantId/...' })` — regex extract from URL path

- **W-3-6-13**: Implement `resolveTenantStrict(chain, source)` helper — `src/strict.ts`. Throws `UnauthorizedError` from `@gertsai/errors` if chain returns null.

- **W-3-6-14**: Implement `/moleculer` subpath — `src/moleculer/index.ts`:
  - `MoleculerCtxStrategy` — reads `ctx.meta.tenantId` (uses Moleculer Context type via `import type`)
  - `tenantMiddleware(resolver)` factory — Moleculer middleware wrapping resolver per request
  - Peer-optional `moleculer` import via `import type`. Runtime check: throw clear error if user calls without moleculer installed.

- **W-3-6-15**: Implement `/http` subpath — `src/http/index.ts`:
  - `nodeHttpAdapter(req: http.IncomingMessage): HttpRequestLike` — converts Node IncomingMessage. Uses Node builtin types via `import type`.

- **W-3-6-16**: Tests (≥15 tests):
  - `src/__tests__/strategy.test.ts` — interface contract / null handling.
  - `src/__tests__/chain-resolver.test.ts` — sequential resolution; first-wins; null-on-exhaust; provenance preserved (strategyName).
  - `src/__tests__/strategies.test.ts` — header (with case variants); subdomain; path. Happy + null + edge cases.
  - `src/__tests__/strict.test.ts` — resolveTenantStrict throws UnauthorizedError with correct details.
  - `src/__tests__/moleculer.test.ts` — MoleculerCtxStrategy with mock ctx; middleware integration test.

- **W-3-6-17**: README.md — usage examples (chain composition; HTTP integration; Moleculer integration).

### Track 3: `@gertsai/session` additive scoping (T3, E+ marker)

Existing Tier 1 package, additive only per ADR-006 Decision C.

- **W-3-6-18**: Extend `SessionOpts` interface in `packages/session/src/types.ts` — add 3 optional fields:
  - `tenantId?: string`
  - `projectId?: string`
  - `spaceId?: string`

- **W-3-6-19**: Extend `Session` class в `packages/session/src/Session.ts`:
  - 3 private fields `_tenantId`, `_projectId`, `_spaceId` set in constructor (from opts)
  - 3 public read-only getters: `tenantId`, `projectId`, `spaceId` (return `string | null`; null if undefined)
  - 4 helper methods on Session class:
    - `getTenantStrict(): string` — throws `UnauthorizedError` from `@gertsai/errors` if null
    - `getTenantOptional(): string | null`
    - `getProjectStrict(): string`
    - `getSpaceStrict(): string`

- **W-3-6-20**: Add peerDependencies entry in `packages/session/package.json`:
  - `@gertsai/errors: workspace:^` (peer-optional — only needed for `*Strict()` helpers; tests can mock)

- **W-3-6-21**: Tests — `packages/session/src/Session.test.ts` extend with 5+ scoping tests (or new `packages/session/src/scoping.test.ts`):
  - construct Session WITHOUT scoping fields → all 3 getters return `null`
  - construct Session WITH scoping fields → getters return values
  - `getTenantStrict()` returns value if set
  - `getTenantStrict()` throws `UnauthorizedError` if not set (instance-of check)
  - `getProjectStrict()` and `getSpaceStrict()` similar
  - Existing tests untouched + still pass.

- **W-3-6-22**: Update `packages/session/README.md` — new section "Tenant / project / space scoping" with examples.

### Track 4: P2 polish batch (T4, F+ marker)

7 polish items from post-Sprint-3.5.2 audit. STRICTLY additive per ADR-006 I-7.

- **W-3-6-23** (P2 EG-1): `packages/entity-storage/src/InMemoryStorageProvider.ts` — set default generic `<Meta extends StorageMetadata = StorageMetadata>`. No breaking change.

- **W-3-6-24** (P2 EG-2): `packages/entity-storage/src/BaseEntityStorageService.ts` — add `upsert(entity, options?)` method. Signature: `upsert<T extends Meta['write']>(entity: T, options?: WriteOptions): Promise<T & MutationMarks>`. Implementation: branch on existence → set or update.
  - Add tests in `packages/entity-storage/src/__tests__/upsert.test.ts` (≥3 tests).

- **W-3-6-25** (P2 EG-3): `packages/entity-storage/package.json` — remove `peerDependenciesMeta.@gertsai/storage-core.optional: true` (storage-core is no longer optional — it's a real dep). Update lockfile via `pnpm install`.

- **W-3-6-26** (P2 EG-4): `packages/entity-storage/README.md` — remove "Wave 4B Phase A/B" language (lines 80, 152). Update to current state ("storage-core is the canonical interface; this package implements it").

- **W-3-6-27** (P2 ID-MF-1): `README.md` (root) — change "13 OSS packages" → "28 packages" (or accurate post-Sprint-3.6 count).

- **W-3-6-28** (P2 ID-MF-2): `examples/m9s-example/tests/audit-propagation.test.ts` — remove 4 `as any` casts (lines 63, 64, 73, 80) by typing `stored` and `after1`/`after2` properly via `getDoc<DocumentMeta>()` return type.

- **W-3-6-29** (P2 ID-MF-3): defer (save() 2 RTTs vs 1) — N/A для InMemory; document in KNOWN-ISSUES if not yet addressed.

### Track 5: Phase B Integration (T5, team-lead solo)

- **W-3-6-30**: `pnpm install` → lockfile updated; verify workspace recognizes 2 new packages.
- **W-3-6-31**: `pnpm build` — 28 packages + m9s-example green (was 26 + m9s-example).
- **W-3-6-32**: `pnpm test` — target ≥4443 + new tests (errors ~15 + tenant-resolver ~15 + session-scoping ~5 + entity-storage upsert ~3 = ~38 added → target ≥4481).
- **W-3-6-33**: `pnpm typecheck` — 28 + m9s-example green.
- **W-3-6-34**: `pnpm run lint`, `pnpm run depcruise`, `pnpm run publint`, `pnpm run attw` — all green.
- **W-3-6-35**: Update `CLAUDE.md` tier table 26 → 28; add @gertsai/errors and @gertsai/tenant-resolver rows.
- **W-3-6-36**: Create changesets — 4 changesets total:
  - `.changeset/sprint-3-6-errors.md` (minor bump @gertsai/errors initial 0.1.0)
  - `.changeset/sprint-3-6-tenant-resolver.md` (minor bump @gertsai/tenant-resolver initial 0.1.0)
  - `.changeset/sprint-3-6-session-scoping.md` (minor bump @gertsai/session 0.1.0 → 0.2.0)
  - `.changeset/sprint-3-6-polish.md` (patch bump @gertsai/entity-storage)

### Track 6: Phase C Audit + Evidence (T6, team-lead solo)

- **W-3-6-37**: Post-Build fidelity audit — 3 reviewers parallel (errors-fidelity, tenant-resolver-fidelity, session-scoping-fidelity). Each verifies actual implementation matches SPEC-011 + ADR-006. Pattern: Group 28/31 post-Build audit.

- **W-3-6-38**: Address P0/P1 audit findings (if any). If only P2 → log to KNOWN-ISSUES or defer.

- **W-3-6-39**: Create EVID-013 (verdict=supports, CL3, structured measurements):
  - Test count delta (baseline 4443 → actual)
  - Package count delta (26 → 28)
  - 7 P2 polish items checklist (closed/deferred)
  - Audit findings summary (P0/P1/P2 counts)
  - Time spent (wall-clock + per-worker)
  - Branch state (commits ahead of main)
  - Linked: PRD-003, ADR-006, SPEC-011, EVID-012 (Wave 4 baseline)

- **W-3-6-40**: Activate SPEC-011 (validate gate or force per ADR-005 pattern).

- **W-3-6-41**: Single atomic commit `feat(monorepo): Sprint 3.6 — Wave 5 Phase 1 (errors + tenant-resolver + session scoping + P2 polish)`.

- **W-3-6-42**: Hindsight retain — Sprint 3.6 shipped, AgentTeams pattern delivery, ADI dilemma resolutions.

## Out of scope

- **Sprint 3.7+ work** (runtime-context, session-guard, audit-primitives) — separate sprint.
- **Sprint 3.8 framework adapters** — separate sprint.
- **Sprint 3.9 Orchestra HIGH candidates** — separate sprint.
- **`@gertsai/auth-moleculer` extraction** — deferred per ADR-004 I-5.
- **Postgres-specific listener implementation** for `pg-client/storage` — Wave 6+.
- **JWT-decoding tenant strategies** — consumers implement on top of `TenantResolverStrategy` interface.
- **Locale catalogs for `getUserMessage`** beyond English default — extension point provided.
- **Cross-package `@gertsai/runtime-context` integration** — Sprint 3.7.
- **v0.2.0 publish gate** — separate explicit user confirmation.

## Strategy markers

| Track | Marker | Meaning |
|-------|--------|---------|
| T1 errors | F | Fresh implementation, mirroring upstream patterns |
| T2 tenant-resolver | F | Fresh implementation |
| T3 session-additive | E+ | Enhancement of existing package, additive only |
| T4 polish batch | F+ | Fix on existing, additive only |

## Data Models

### `@gertsai/errors` types

```typescript
export const enum ErrorKind {
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL = 'INTERNAL',
  UPSTREAM_FAILURE = 'UPSTREAM_FAILURE',
  TIMEOUT = 'TIMEOUT',
  BAD_GATEWAY = 'BAD_GATEWAY',
}

export interface SerializedAppError {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly cause?: SerializedAppError;
}

export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;
  readonly details: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly cause?: unknown;
  constructor(opts: { message: string; details?: Record<string, unknown>; cause?: unknown; correlationId?: string });
  toJSON(): SerializedAppError;
}

// 10 subclasses each declaring kind:
export class ValidationError extends AppError { readonly kind = ErrorKind.VALIDATION; }
export class NotFoundError extends AppError { readonly kind = ErrorKind.NOT_FOUND; }
// ... etc 8 more
```

### `@gertsai/tenant-resolver` types

```typescript
export interface HttpRequestLike {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly url?: string;
  readonly method?: string;
}

export interface TenantResolution {
  readonly tenantId: string;
  readonly strategyName: string;
}

export interface TenantResolverStrategy<Source> {
  readonly name: string;
  resolve(source: Source): Promise<TenantResolution | null>;
}

export class ChainTenantResolver<Source> implements TenantResolverStrategy<Source> {
  readonly name = 'chain';
  constructor(private readonly strategies: readonly TenantResolverStrategy<Source>[]);
  resolve(source: Source): Promise<TenantResolution | null>;
}

export function resolveTenantStrict<Source>(
  chain: TenantResolverStrategy<Source>,
  source: Source,
): Promise<TenantResolution>;  // throws UnauthorizedError on null
```

### `@gertsai/session` additive types

```typescript
// Updated SessionOpts (additive)
export interface SessionOpts {
  // ... existing fields preserved
  readonly tenantId?: string;     // NEW
  readonly projectId?: string;    // NEW
  readonly spaceId?: string;      // NEW
}

// Updated Session class (additive methods)
export class Session extends EventEmitter {
  // ... existing API preserved
  get tenantId(): string | null;       // NEW
  get projectId(): string | null;      // NEW
  get spaceId(): string | null;        // NEW
  getTenantStrict(): string;           // NEW (throws UnauthorizedError)
  getTenantOptional(): string | null;  // NEW
  getProjectStrict(): string;          // NEW
  getSpaceStrict(): string;            // NEW
}
```

## Acceptance Checklist

- [ ] T1 (W-3-6-1..8): `@gertsai/errors` shipped — package skeleton + enum + base + 10 subclasses + helpers + /http subpath + /grpc subpath + ≥15 tests + README.
- [ ] T2 (W-3-6-9..17): `@gertsai/tenant-resolver` shipped — package skeleton + interface + ChainResolver + 3 strategies + strict helper + /moleculer subpath + /http subpath + ≥15 tests + README.
- [ ] T3 (W-3-6-18..22): `@gertsai/session` additive scoping — 3 fields + 3 getters + 4 helpers + ≥5 tests + README updated. Existing tests pass untouched.
- [ ] T4 (W-3-6-23..29): 7 P2 polish items closed (or documented as deferred).
- [ ] T5 (W-3-6-30..36): Full repo verify green; CLAUDE.md tier table 26 → 28; 4 changesets created.
- [ ] T6 (W-3-6-37..42): Post-Build audit done; EVID-013 active; SPEC-011 active; commit; Hindsight retain.

## Sprint 3.6 acceptance bundle

1. `@gertsai/errors` published as 0.1.0 candidate (changeset minor; not yet npm-published — separate gate).
2. `@gertsai/tenant-resolver` published as 0.1.0 candidate.
3. `@gertsai/session` bumped 0.1.0 → 0.2.0 (additive minor per SemVer).
4. `@gertsai/entity-storage` patch bumped (P2 polish).
5. Test count: 4443 → ≥4481 (~38 added).
6. Package count: 26 → 28.
7. Branch state: ~37+ commits ahead of main.
8. Single atomic commit; clean rollback via `git revert`.
9. ADR-006 invariants I-1..I-12 preserved (verified by audit).
10. Wave 4 invariants (ADR-005 I-1..I-7) preserved (verified by audit).

## Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | `errors-worker` accidentally imports HTTP/gRPC framework runtime in core (violation I-1) | depcruise rule; pre-Build audit catches; reviewer checklist |
| R-2 | `tenant-resolver-worker` puts Moleculer import in core (violation I-4) | depcruise rule; pre-Build audit catches |
| R-3 | `session-additive-worker` accidentally renames existing field / changes existing public method (violation I-6) | regression test suite; reviewer checklist; `git diff` review |
| R-4 | `polish-worker` introduces breaking change in entity-storage (violation I-7) | each polish item changeset-versioned; reviewer "additive only" attestation |
| R-5 | Workers race on shared file (e.g. CLAUDE.md, README.md) | strict file ownership matrix below; team-lead handles CLAUDE.md in Phase B |
| R-6 | typesVersions misconfig для subpaths | pattern from Sprint 3.0.1 F-4; reviewer checks against errors+tenant-resolver |
| R-7 | RFC 9457 ProblemDetails serialization edge cases | ≥3 round-trip tests; consumer feedback in Sprint 3.7 |
| R-8 | grpc.status integer codes drift from canonical | constants from official grpc-status spec; documented in ADR-006 §A |

## File ownership matrix (disjoint guarantee)

| Worker | Owns (read+write) | Reads only (no write) |
|--------|-------------------|------------------------|
| **errors-worker** | `packages/errors/**` (all NEW) | `packages/utils/**` (template reference); `tsconfig.base.json`; root `package.json` (workspace check) |
| **tenant-resolver-worker** | `packages/tenant-resolver/**` (all NEW) | `packages/errors/**` (peer dep awareness); `packages/utils/**` (template); `tsconfig.base.json` |
| **session-additive-worker** | `packages/session/src/**`, `packages/session/package.json`, `packages/session/README.md` | `packages/errors/**` (peer dep awareness); `packages/session/CHANGELOG.md` (read-only — changesets generate) |
| **polish-worker** | `packages/entity-storage/src/**`, `packages/entity-storage/package.json`, `packages/entity-storage/README.md`, `examples/m9s-example/tests/audit-propagation.test.ts`, `README.md` (root) | `packages/storage-core/**` (read for InMemoryStorageProvider context); `packages/entity/**` (read for Meta type) |
| **team-lead Phase B** | `CLAUDE.md`, `pnpm-lock.yaml`, `.changeset/sprint-3-6-*.md` (NEW × 4) | all package src (read for verify) |

**Conflict-free guarantee**: 0 shared files between Wave 1 workers. CLAUDE.md and pnpm-lock.yaml owned exclusively by team-lead Phase B (sequential after Wave 1).

## Implementation Plan — sequenced для AgentTeams

### Wave 1 (4∥ workers, parallel)

- **errors-worker** (T1, W-3-6-1..8). Subagent: `agents-domain:typescript-pro`. Disjoint scope.
- **tenant-resolver-worker** (T2, W-3-6-9..17). Subagent: `agents-domain:typescript-pro`. Disjoint scope. (May import `@gertsai/errors` types via workspace symlink AFTER errors-worker creates package skeleton; tenant-resolver-worker designed to be lenient — uses `import type` для resilience.)
- **session-additive-worker** (T3, W-3-6-18..22). Subagent: `agents-domain:typescript-pro`. Disjoint scope.
- **polish-worker** (T4, W-3-6-23..29). Subagent: `agents-core:coder`. Disjoint scope.

**Mitigation for tenant-resolver dep on errors**: tenant-resolver-worker uses `peerDependencies` declaration at package boundary; runtime usage of `UnauthorizedError` only in `resolveTenantStrict` helper — this is `import { UnauthorizedError } from '@gertsai/errors'` which works via pnpm workspace symlink as soon as errors-worker creates `packages/errors/package.json` (first commit). If timing race emerges, tenant-resolver-worker can stub `UnauthorizedError` locally and replace via team-lead Phase B integration. ADI:
- **Abduct**: workers race on package symlink resolution.
- **Induct**: pnpm workspace creates symlinks at install time. Both packages NEW → resolved at Phase B `pnpm install`.
- **Deduct**: tenant-resolver-worker can write code referencing `@gertsai/errors` immediately; resolution happens in team-lead Phase B install. If TS errors arise during worker phase, fall back to local stub + replace.

### Wave 2 (team-lead solo, after Wave 1 complete)

- **Phase B verify** (T5, W-3-6-30..36). Sequential — touches CLAUDE.md, pnpm-lock.yaml, changesets. NOT parallel.

### Wave 3 (3∥ reviewers, post-Build audit)

- **errors-fidelity** reviewer. Subagent: `agents-pro:architect-reviewer`.
- **tenant-resolver-fidelity** reviewer. Subagent: `agents-pro:architect-reviewer`.
- **session-scoping-fidelity** reviewer. Subagent: `agents-pro:architect-reviewer`.

Each writes findings (P0/P1/P2 + GO/NO-GO) → team-lead synthesizes converging findings (≥2 reviewers = mandatory). Single-reviewer findings = P2 polish.

### Wave 4 (team-lead solo, post-audit)

- **Address P0/P1** audit findings (T6, W-3-6-38). If only P2 → log to KNOWN-ISSUES or defer.
- **EVID-013 + activate + commit + Hindsight** (T6, W-3-6-39..42).

## Affected Files (predicted)

**Wave 1 modifies / creates**:
- `packages/errors/**` (NEW — full package)
- `packages/tenant-resolver/**` (NEW — full package)
- `packages/session/src/types.ts`, `packages/session/src/Session.ts`, `packages/session/src/Session.test.ts`, `packages/session/src/scoping.test.ts` (NEW), `packages/session/package.json`, `packages/session/README.md`
- `packages/entity-storage/src/InMemoryStorageProvider.ts`
- `packages/entity-storage/src/BaseEntityStorageService.ts`
- `packages/entity-storage/src/__tests__/upsert.test.ts` (NEW)
- `packages/entity-storage/package.json`
- `packages/entity-storage/README.md`
- `examples/m9s-example/tests/audit-propagation.test.ts`
- `README.md` (root)

**Wave 2 (team-lead Phase B) modifies / creates**:
- `CLAUDE.md`
- `pnpm-lock.yaml`
- `.changeset/sprint-3-6-errors.md` (NEW)
- `.changeset/sprint-3-6-tenant-resolver.md` (NEW)
- `.changeset/sprint-3-6-session-scoping.md` (NEW)
- `.changeset/sprint-3-6-polish.md` (NEW)

**Wave 4 (team-lead Phase D) creates**:
- `.forgeplan/evidence/EVID-013-sprint-3-6-shipped.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5) | PRD | based_on |
| ADR-006 (Wave 5 placement) | ADR | based_on |
| ADR-005 (Wave 4 storage architecture) | ADR | informs (Wave 4 invariants preserved) |
| ADR-004 (Foundation libs naming) | ADR | informs (strategy markers F+, E+ extension) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (subpath patterns) |
| EVID-012 (Sprint 3.5.2 m9s-example shipped) | Evidence | informs (Wave 4 production-grade baseline; +`as any` polish target identified there) |
| EVID-011 (Sprint 3.5.1 fidelity fix) | Evidence | informs (audit pattern reused) |

> **Next step**: SPEC-011 validate + activate (or force-activate per ADR-005 pattern) → pre-Build audit (5 reviewers parallel) → Build (4 workers parallel) → Phase B verify → Phase C post-Build audit → Phase D EVID-013 + commit + Hindsight.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers delivered findings (architect / security / ddd / typescript / docs). Convergent + substantive findings supersede original W-items below. **Build workers MUST follow Amendment 1 over original text where they disagree.** Cross-reference: ADR-006 Amendment 1.

### A1.1 — Updated Data Models

**Replace SPEC-011 §"Data Models" `@gertsai/errors` block with**:

```typescript
// ErrorKind — `as const` object, NOT const enum (typescript P0-1 + architect P1-A1)
// Reason: const enum incompatible with isolatedModules: true (tsconfig.base.json baseline).
export const ErrorKind = {
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  UPSTREAM_FAILURE: 'UPSTREAM_FAILURE',
  TIMEOUT: 'TIMEOUT',
  BAD_GATEWAY: 'BAD_GATEWAY',
} as const;
export type ErrorKind = (typeof ErrorKind)[keyof typeof ErrorKind];

// SerializedAppError — cause typed as cyclic-safe variant (security P0-2 + typescript P0-3)
export type SerializedAppError = {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly cause?: SerializedAppError | { readonly __truncated: true; readonly reason: 'cycle' | 'depth-exceeded' | 'non-app-error' };
};

// AppError — generic on details (typescript P1-2)
export abstract class AppError<D extends Record<string, unknown> = Record<string, unknown>> extends Error {
  abstract readonly kind: ErrorKind;
  readonly details: Readonly<D>;
  readonly correlationId?: string;
  readonly cause?: unknown;
  constructor(opts: { message: string; details?: D; cause?: unknown; correlationId?: string });
  toJSON(): SerializedAppError;  // internal — NO redaction; for logs
}

// Subclasses with typed D
export class ValidationError extends AppError<{ field: string; constraint: string; value?: unknown }> {
  readonly kind = ErrorKind.VALIDATION;
}
export class NotFoundError extends AppError<{ resourceType: string; resourceId: string }> {
  readonly kind = ErrorKind.NOT_FOUND;
}
export class UnauthorizedError extends AppError<{ reason?: string }> {
  readonly kind = ErrorKind.UNAUTHORIZED;
}
export class ForbiddenError extends AppError<{ resource?: string; action?: string }> {
  readonly kind = ErrorKind.FORBIDDEN;
}
export class ConflictError extends AppError<{ resource?: string; conflictWith?: string }> {
  readonly kind = ErrorKind.CONFLICT;
}
export class RateLimitedError extends AppError<{ retryAfterSec?: number; limit?: number }> {
  readonly kind = ErrorKind.RATE_LIMITED;
}
export class InternalError extends AppError<Record<string, unknown>> {
  readonly kind = ErrorKind.INTERNAL;
}
export class UpstreamFailureError extends AppError<{ upstream?: string; status?: number }> {
  readonly kind = ErrorKind.UPSTREAM_FAILURE;
}
export class TimeoutError extends AppError<{ timeoutMs?: number; operation?: string }> {
  readonly kind = ErrorKind.TIMEOUT;
}
export class BadGatewayError extends AppError<{ upstream?: string }> {
  readonly kind = ErrorKind.BAD_GATEWAY;
}

// Locale catalog API (docs P1-2 + ADR-006 A1.3)
export function registerErrorLocale(
  locale: string,
  catalog: Partial<Record<ErrorKind, string>>,
): void;
export function getUserMessage(error: AppError, locale?: string): string;

// Wire serialization helpers — REDACT details + collapse to bucket type (security P0-3 + P1-6)
// Located in /http and /grpc subpaths.
export const REDACTION_KEYS: readonly string[] = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'cookie', 'set-cookie', 'pwd', 'passwd', 'private_key', 'privateKey', 'connection_string', 'connectionString'];
```

**Replace SPEC-011 §"Data Models" `@gertsai/session` block with**:

```typescript
// Session getters return string | undefined (typescript P0-2)
// Existing session API uses non-nullable getters; new optional fields use undefined for consistency.
export class Session extends EventEmitter {
  // ... existing API preserved
  get tenantId(): string | undefined;       // NEW
  get projectId(): string | undefined;      // NEW
  get spaceId(): string | undefined;        // NEW
  // Strict helpers throw appropriately-typed error per ADR-006 I-16
  getTenantStrict(): string;                 // NEW — throws UnauthorizedError
  getProjectStrict(): string;                // NEW — throws ValidationError
  getSpaceStrict(): string;                  // NEW — throws ValidationError
  // No `getXxxOptional` helpers — getter already returns string | undefined.
}
```

### A1.2 — Updated W-items

**W-3-6-2** — `ErrorKind` SUPERSEDED to use `as const` object pattern (see A1.1 block above). NOT `const enum`.

**W-3-6-3** — `AppError` SUPERSEDED to be generic `<D>` per A1.1 block. Constructor accepts `details?: D` typed.

**W-3-6-3a (NEW)** — Implement `wrapUnknownError(x: unknown, kind?: ErrorKind, correlationId?: string): AppError` helper:
- If `x instanceof AppError` → return as-is.
- If `x instanceof Error` → `new InternalError({ message: x.message, details: { name: x.name, cause: x.message }, cause: x, correlationId })`.
- Otherwise → `new InternalError({ message: 'Unknown error', details: { value: String(x) }, correlationId })`.

**W-3-6-3b (NEW)** — Implement `AppError.toJSON()` with cycle/depth guard per ADR-006 I-13:
- Maintain `WeakSet<AppError>` visited set within recursion.
- Max depth = 5; on overflow → emit `cause: { __truncated: true, reason: 'depth-exceeded' }`.
- On cycle → emit `cause: { __truncated: true, reason: 'cycle' }`.
- On non-AppError cause (after first level) → wrap via `wrapUnknownError` first, then serialize; if recursion deep → truncate marker.

**W-3-6-5** — `/http` subpath SUPERSEDED. Implementation:
```typescript
export const httpStatusForKind: Readonly<Record<ErrorKind, number>> = { /* ... */ } as const;
export const PROBLEM_TYPE_BUCKETS: Readonly<Record<ErrorKind, string>> = {
  VALIDATION: 'urn:gertsai:errors:validation',
  NOT_FOUND: 'urn:gertsai:errors:not-found',
  UNAUTHORIZED: 'urn:gertsai:errors:unauthenticated',
  FORBIDDEN: 'urn:gertsai:errors:permission',
  CONFLICT: 'urn:gertsai:errors:conflict',
  RATE_LIMITED: 'urn:gertsai:errors:rate-limit',
  INTERNAL: 'urn:gertsai:errors:server',
  UPSTREAM_FAILURE: 'urn:gertsai:errors:server',  // collapsed (security P1-6)
  TIMEOUT: 'urn:gertsai:errors:timeout',
  BAD_GATEWAY: 'urn:gertsai:errors:server',  // collapsed
} as const;

export function appErrorToHttpResponse(err: AppError): { status: number; body: ProblemDetails } {
  return {
    status: httpStatusForKind[err.kind],
    body: {
      type: PROBLEM_TYPE_BUCKETS[err.kind],  // bucket, not kind
      title: err.message,
      status: httpStatusForKind[err.kind],
      detail: err.message,
      details: redactDetails(err.details),  // SECURITY (I-14)
      correlationId: err.correlationId,
    },
  };
}
```

**W-3-6-7** — Tests SUPERSEDED with adversarial fixtures (security P0-1/P0-2/P1-7):
- `cause-cycle.test.ts` — toJSON does not infinite-loop on `a.cause = b; b.cause = a`. Asserts `__truncated: true, reason: 'cycle'`.
- `cause-deep.test.ts` — toJSON truncates at depth 5. Asserts `__truncated: true, reason: 'depth-exceeded'`.
- `details-redaction.test.ts` — `appErrorToHttpResponse(new InternalError({ details: { password: 'x', api_key: 'y', user_id: 'kept' } }))` strips `password` + `api_key` from body, retains `user_id`. Same for `appErrorToGrpcStatus`.
- `wrap-unknown-error.test.ts` — wraps native Error preserving cause; wraps non-Error preserving stringified value.
- `bucket-type.test.ts` — `UPSTREAM_FAILURE` and `BAD_GATEWAY` map to same `urn:gertsai:errors:server` ProblemDetails.type.
- Existing exhaustive ErrorKind mapping tests (HTTP and gRPC) preserved.

**W-3-6-11** — `ChainTenantResolver` SUPERSEDED:
```typescript
export class ChainTenantResolver<Source> implements TenantResolverStrategy<Source> {
  readonly name = 'chain';
  constructor(
    private readonly strategies: readonly TenantResolverStrategy<Source>[],
    private readonly options: { mode?: 'strict' | 'optional' } = {},
  );
  // Default mode = 'strict' (security P1-5). Strict throws UnauthorizedError if all return null.
  resolve(source: Source): Promise<TenantResolution | null>;  // 'optional' mode
  // For strict mode: chain.resolve() throws UnauthorizedError on no-match.
}
```

**W-3-6-12** — Built-in strategies SUPERSEDED with hardening:
- `HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: boolean })` — constructor throws if `trustProxy !== true` (security P0-1, ADR-006 I-15).
- `SubdomainStrategy({ baseDomain: 'gertsai.dev', allowedHosts?: string[] })` — strict suffix match `endsWith('.' + baseDomain)`; reject IP literals; optional `allowedHosts` whitelist (security P1-2).
- `PathStrategy({ pathPattern: '/t/:tenantId/...' })` — URL-normalize before match (decode + collapse `..`); reject `tenantId` containing `/`, `%`, `\0`, non-printable (security P1-1).

**W-3-6-16** — Tests SUPERSEDED with adversarial fixtures:
- `header-spoof.test.ts` — `new HeaderStrategy({ headerName: 'X-Tenant-ID' })` throws (no `trustProxy: true`).
- `path-traversal.test.ts` — PathStrategy rejects `/t/foo%2F../victim/...`.
- `subdomain-strict-suffix.test.ts` — SubdomainStrategy on `attacker.evil.gertsai.dev.attacker.com` returns null.
- `chain-strict-mode.test.ts` — strict-mode chain throws `UnauthorizedError` when all strategies return null; optional-mode returns null.
- Existing strategy + ChainResolver composition + Moleculer adapter tests preserved.

**W-3-6-19** — Session class extension SUPERSEDED:
- 3 private fields `_tenantId`, `_projectId`, `_spaceId` typed `string | undefined`.
- 3 public read-only getters return `string | undefined` (NOT `string | null`).
- 3 strict helpers (NOT 4 — `getXxxOptional` removed):
  - `getTenantStrict(): string` — throws `UnauthorizedError` if undefined (multi-tenancy = auth boundary).
  - `getProjectStrict(): string` — throws `ValidationError` if undefined (per ADR-006 I-16).
  - `getSpaceStrict(): string` — throws `ValidationError` if undefined.

**W-3-6-21** — Tests SUPERSEDED:
- 5+ scoping tests as before, but:
  - `tenant-strict-throws-unauth.test.ts` — `getTenantStrict()` throws `UnauthorizedError` (`instanceof` check).
  - `project-strict-throws-validation.test.ts` — `getProjectStrict()` throws `ValidationError`.
  - `space-strict-throws-validation.test.ts` — same.
  - `getters-return-undefined.test.ts` — when fields not set, getters return `undefined` (NOT `null`).

**W-3-6-25** — Bump SUPERSEDED (architect P0-A2): `entity-storage` changeset bump = **minor** (NOT patch). Description includes "BREAKING for consumers without `@gertsai/storage-core` install — peer-dep is now mandatory (was optional)".

**W-3-6-35** — CLAUDE.md update SUPERSEDED with concrete snippets:
- Tier table — add 2 rows after `@gertsai/utils`:
  ```
  | 1 | `@gertsai/errors` | — | **Sprint 3.6 W-3-6-1..8 (F fresh)** | universal error taxonomy (10 ErrorKind) + `/http` + `/grpc` subpaths; Shared Kernel for @gertsai/* per ADR-006 §D §6 |
  | 1 | `@gertsai/tenant-resolver` | errors (peer) | **Sprint 3.6 W-3-6-9..17 (F fresh)** | composable strategy chain + 3 built-in strategies + `/moleculer` + `/http` subpaths; default strict mode |
  ```
- Update existing `@gertsai/session` row Internal deps: add `errors (peer for *Strict helpers)`; Notes: append `Wave 5 Sprint 3.6: additive scoping (tenantId/projectId/spaceId) + 3 *Strict helpers (E+ marker)`.
- Update tier table package count "26 deliverables" → "28 deliverables".
- Add to Strategy markers definition block (extend existing P/F/S/P+F/E/A list):
  - **F+** = Fix on existing — additive only, no breaking changes (Wave 5 ADR-006 §D §4).
  - **E+** = Enhancement of existing package, additive only (Wave 5 ADR-006 §D §5).

**W-3-6-36** — Changeset description templates (docs P1-3):

`.changeset/sprint-3-6-errors.md`:
```markdown
---
'@gertsai/errors': minor
---

Initial release. Universal error taxonomy for @gertsai/* ecosystem (Shared Kernel per ADR-006).

- 10 ErrorKind values (`as const` object) covering RFC 9457 + canonical microservice taxonomy.
- AppError generic base + 10 subclasses with typed details.
- `/http` subpath: RFC 9457 ProblemDetails serialization with bucket types + automatic redaction (REDACTION_KEYS list).
- `/grpc` subpath: gRPC status code mapping (canonical integer codes vendored as constants).
- `wrapUnknownError`, `isAppError`, `getUserMessage` helpers.
- `registerErrorLocale` extension API (static catalogs only).
- Cause chain cycle/depth guard (max depth 5, WeakSet detection).
```

`.changeset/sprint-3-6-tenant-resolver.md`:
```markdown
---
'@gertsai/tenant-resolver': minor
'@gertsai/errors': patch
---

Initial release. Composable multi-strategy tenant resolution.

- TenantResolverStrategy<Source> interface; ChainTenantResolver with default 'strict' mode.
- Built-in strategies: HeaderStrategy (requires trustProxy: true), SubdomainStrategy (strict suffix), PathStrategy (URL-normalized).
- `/moleculer` subpath: MoleculerCtxStrategy + tenantMiddleware factory.
- `/http` subpath: nodeHttpAdapter for Node IncomingMessage.
- `resolveTenantStrict` helper throws UnauthorizedError on no-match.

@gertsai/errors patch: no source change — version sync to allow workspace ref bump.
```

`.changeset/sprint-3-6-session-scoping.md`:
```markdown
---
'@gertsai/session': minor
---

Additive multi-tenant scoping (tenantId / projectId / spaceId).

**Migration from 0.1.0 → 0.2.0**: Strictly additive — existing constructor + getters preserved. Existing tests pass without changes.

- New optional SessionOpts fields: `tenantId?`, `projectId?`, `spaceId?` (string).
- New getters: `tenantId`, `projectId`, `spaceId` (return `string | undefined`).
- New strict helpers: `getTenantStrict()` (throws UnauthorizedError), `getProjectStrict()` / `getSpaceStrict()` (throw ValidationError).
- Scope fields are flat tags — no enforced hierarchy. Hierarchy enforcement (if needed) lives in Sprint 3.7 RuntimeContext middleware.
- New peer-dep: `@gertsai/errors` (used only by *Strict helpers).
```

`.changeset/sprint-3-6-polish.md`:
```markdown
---
'@gertsai/entity-storage': minor
---

Sprint 3.6 P2 polish batch.

- `InMemoryStorageProvider<Meta = StorageMetadata>` default generic (additive).
- `BaseEntityStorageService.upsert(entity)` atomic upsert helper (additive).
- README cleanup: remove Wave 4B Phase A/B language; document current canonical state.

**BREAKING for consumers without `@gertsai/storage-core` install**: peerDependenciesMeta `optional: true` flag removed. storage-core peer-dep is now mandatory (was optional during Wave 4B Phase A intermediate state).
```

### A1.3 — Documentation conventions

All Wave 5 README files follow `packages/session/README.md` style (flat sections, no badges hero-style). Mandatory sections:
- `## Install` (1-line install command)
- `## Quickstart` (5-15 line minimal example)
- `## Subpath imports` (per-subpath block with code examples)
- `## API` (table or definition list)
- `## Cross-references` (links to ADR-006 + PRD-003)
- `## Security` (mandatory for `@gertsai/errors` and `@gertsai/tenant-resolver`)
- `## License` (Apache-2.0 + LICENSE symlink note)

### A1.4 — Build worker sequencing (architect P1-A3)

To eliminate worker race on `@gertsai/errors` peer-dep symlink:

1. **errors-worker FIRST**: must finish W-3-6-1 (skeleton commit `packages/errors/package.json` + `src/index.ts` empty exports) within 30s of Build phase start. After this point, pnpm workspace symlink resolution works for tenant-resolver and session.
2. **tenant-resolver-worker** + **session-additive-worker** may import `@gertsai/errors` types via `import type` immediately. Runtime imports (UnauthorizedError, ValidationError) work after pnpm install in Phase B.
3. If TS errors arise during worker phase due to symlink race — fallback to local stub (`class UnauthorizedError extends Error {}` with `// TODO: replace with @gertsai/errors`) and team-lead Phase B replaces.

### A1.5 — File ownership matrix update

Add to file ownership matrix:
- `errors-worker` ALSO owns `packages/errors/CHANGELOG.md` placeholder.
- `tenant-resolver-worker` ALSO owns `packages/tenant-resolver/CHANGELOG.md` placeholder.
- `session-additive-worker` ALSO owns `packages/session/__tests__/scoping.test.ts` (NEW — split from Session.test.ts for clarity).

### A1.6 — Out of scope (additions)

- m9s-example Wave 5 integration deferred to Sprint 3.7 (docs P2).
- ChainTenantResolverSync (sync variant) deferred to Sprint 3.7+.
- Web/Fetch HttpRequestLike adapter (`webHttpAdapter(req: Request)`) deferred to Sprint 3.7+ + KNOWN-ISSUES note.
- Project-aware HierarchyValidator middleware deferred to Sprint 3.7 RuntimeContext (per ADR-006 I-17).

### Amendment 1 changelog

| ID | Source | Fix |
|----|--------|-----|
| A1.1 | typescript P0-1 + architect P1-A1 (convergent) | `as const` object pattern (W-3-6-2) |
| A1.1 | typescript P0-3 + architect P1-A2 + security P0-2/P0-3/P1-7 (convergent) | toJSON cycle/depth guard + redaction (W-3-6-3a/3b/5/7) |
| A1.1 | typescript P1-2 (substantive) | `AppError<D>` generic |
| A1.1 | typescript P0-2 (substantive) | Session getters return `string | undefined`; remove `getXxxOptional` |
| A1.1 | ddd P1-DDD-2 (substantive) | Project/SpaceStrict throw ValidationError (W-3-6-19) |
| A1.1 | security P0-1 (substantive) | HeaderStrategy `trustProxy: true` opt-in (W-3-6-12) |
| A1.1 | security P1-1/P1-2 (substantive) | PathStrategy + SubdomainStrategy hardening (W-3-6-12) |
| A1.1 | security P1-5 (substantive) | ChainTenantResolver default 'strict' mode (W-3-6-11) |
| A1.1 | security P1-6 (substantive) | ProblemDetails bucket type (W-3-6-5) |
| A1.2 | architect P0-A2 (substantive) | W-3-6-25 changeset bump = minor (was patch) |
| A1.3 | docs P1-1 | README template (session-style + mandatory sections) |
| A1.3 | docs P1-2 | Locale catalog API specified (registerErrorLocale + getUserMessage) |
| A1.3 | docs P1-3 | Changeset description templates (4 changesets) |
| A1.3 | docs P1-4 | CLAUDE.md tier-table snippet + F+/E+ marker definitions |
| A1.4 | architect P1-A3 | Build worker sequencing (errors first, 30s SLA) |
| A1.5 | spec | File ownership matrix updates (CHANGELOG placeholders, scoping.test.ts split) |
| A1.6 | docs P2 + typescript P1-4 + ddd P2 | Out of scope additions |

P2 polish items (single-reviewer non-substantive findings) accepted at worker discretion within README/JSDoc; not promoted to W-items.






