---
depth: standard
id: SPEC-006
kind: spec
last_modified_at: 2026-05-05T20:28:16.249178+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
- target: ADR-004
  relation: based_on
- target: ADR-003
  relation: refines
- target: EVID-006
  relation: informs
status: active
title: Sprint 3.2 — foundation libs Wave 1 extraction (5 packages per ADR-004)
---

---
id: SPEC-006
title: "Sprint 3.2 — foundation libs Wave 1 extraction (5 packages per ADR-004)"
status: draft
author: explosivebit
created: 2026-05-05
updated: 2026-05-05
prd_ref: PRD-001
adr_ref: ADR-004,ADR-003,ADR-002
type: implementation-checklist
depth: standard
---

# SPEC-006: Sprint 3.2 — foundation libs Wave 1 extraction (5 packages per ADR-004)

## Summary

Extract 5 foundation libraries per ADR-004 redesigned scope (was 6 in PRD-001 FR-016..FR-020). Per-package strategy markers (P/F/S/P+F/F+S) and import direction specified. Build via AgentTeams 5∥ workers (one per package), team-lead Phase B integration verify, Phase C EVID-007 + activate. Result: monorepo grows from **14 → 19 packages**. Tier table в `CLAUDE.md` updated atomically with W-6 commit.

## Scope

### W-1 — `@gertsai/config` (Tier 1, **Shim**)

- New package `packages/config/` standard-shape (package.json, tsconfig.json, tsup.config.ts, vitest.config.mts, README, LICENSE symlink, CHANGELOG.md placeholder).
- `src/index.ts` — re-exports `loadConfig` (and any sibling helpers) from `@gertsai/api-core/runtime/node` (workspace dep).
- README documents shim role; long-term consumers should prefer `@gertsai/api-core/runtime/node` subpath; this package exists to provide named extraction point per PRD-001 FR-016 + ADR-004.
- ≥3 smoke tests confirming shim works.
- Changeset entry (minor 0.0.0 → 0.1.0).

### W-2 — `@gertsai/tenant` (Tier 1, **Preserve-history if feasible, else Fresh**)

- New package `packages/tenant/`.
- `src/index.ts` — pure types: `TenantId = string` brand, `TenantContext { tenantId: string }`, `TenantContextOptional`, runtime helpers `getTenantIdStrict(ctx)` (throws), `getTenantIdOptional(ctx)`.
- Subpath `@gertsai/tenant/moleculer` exports `tenantMiddleware()` + `getMoleculerTenantId(ctx)` adapter for Moleculer Context shape (lifts from `ctx.meta.tenantId`).
- History preservation: worker investigates upstream `gertsai_codex/apps/pipeline/src/middlewares/tenant.middleware.ts` + `@gerts/auth/src/tenant/`; if extraction drags HTTP/Moleculer coupling, fall back to fresh-code under documented `// TODO Sprint 3.x: integrate upstream X` markers.
- ≥10 tests across types, helpers, Moleculer adapter, edge cases.
- Changeset entry.

### W-3 — `@gertsai/otel` (Tier 1, **Fresh**)

- New package `packages/otel/`.
- `src/index.ts`: `setupObservability(opts: { serviceName: string; otlpEndpoint?: string; sampling?: number; resource?: Record<string, string> }): { sdk: NodeSDK; shutdown: () => Promise<void> }`. Lazy-require `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/resources` + `@opentelemetry/semantic-conventions` (all peer-dep optional).
- Subpath `@gertsai/otel/moleculer` exports `withMoleculerTracing(brokerOptions)` middleware factory (lazy peer-dep on Moleculer).
- Graceful no-op when peer-deps absent (with explicit error messaging on attempted use).
- ≥5 smoke tests (setup with mocks, no-op behavior, Moleculer adapter shape).
- Changeset entry.

### W-4 — `@gertsai/pg-client` (Tier 1, **Fresh**)

- New package `packages/pg-client/`.
- `src/index.ts`: agnostic `PgClient` interface (3 methods max per ADR-011 I-1, I-2):
  ```typescript
  export interface PgClient {
    $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
    $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
    $disconnect(): Promise<void>;
  }
  ```
- `mockPgClient(opts?)` test fixture factory; `PgClientLike` narrowing helper.
- Strict invariant: NO `pg`, `prisma`, `drizzle-orm`, etc. in dependencies / peerDependencies.
- ≥8 tests (interface compliance, mock factory, narrowing helper).
- Changeset entry.

### W-5 — `@gertsai/queue` (Tier 2, **Preserve-history + fresh boundary**)

- New package `packages/queue/`.
- Import direction (per ADR-004 R-2): `@gertsai/queue` is consumed BY `@gertsai/api-core/moleculer` (NOT vice versa). ApiController BullMQ refactor НЕ обязателен в Sprint 3.2 — package ships standalone; ApiController migration = Sprint 3.x follow-up. Documented в README.
- `src/index.ts`: BullMQ wrappers — `createQueue(name, opts)`, `createWorker(name, processor, opts)`.
- Subpath `@gertsai/queue/standalone` exports `QueueRunner.startStandalone(opts)` — headless worker mode (per PRD-001 FR-019).
- Lazy peer-deps on `bullmq` and `ioredis`.
- Source: pattern lifts from `packages/api-core/src/lib/controller/ApiController.class.ts:6,1082,1241` (Queue/Worker construction sites).
- ≥5 tests (queue create, worker create, standalone smoke).
- Changeset entry.

### W-6 — `CLAUDE.md` tier table update

Update lines 81-98 with new 19-package table:
- Tier 1: fsm, fetch, collection, llm-costs, utils, m9s-cache, ws-rpc, **config**, **tenant**, **otel**, **pg-client**.
- Tier 2: di, flux, **queue**.
- Tier 3: core, hsm.
- Tier 4: auth-openfga, api-core.
- Tier 5: api-rlr.

Update `## Что это за проект` count from 14 → 19. Cross-link ADR-004 в footer of tier table.

### W-7 — Phase B integration verify (team-lead)

`pnpm install` (workspace links 5 new) + `pnpm build` (19 + m9s-example) + `pnpm test` (≥4051 + new) + `pnpm typecheck` (19/19 + m9s-example) + `pnpm run lint/publint/depcruise/attw` green + per-package `pnpm pack --dry-run` 0 leak.

### W-8 — Phase C evidence + activation

3 atomic commits:
- `feat(monorepo): Sprint 3.2 Phase A — foundation libs Wave 1 extraction (W-1..W-5)`
- `chore(monorepo): Sprint 3.2 Phase B — CLAUDE.md tier table + integration verify (W-6, W-7)`
- `docs(forgeplan): Sprint 3.2 Phase C — EVID-007 + SPEC-006 active + state (W-8)`

EVID-007 (verdict=supports, CL3, measurement) created + linked + activated. SPEC-006 activated. Hindsight Group 26 retained.

## Data Models

### `@gertsai/config` (W-1, shim)

```typescript
// re-export from @gertsai/api-core/runtime/node — no new types
export { loadConfig, createGcpLoggerStream } from '@gertsai/api-core/runtime/node';
```

### `@gertsai/tenant` (W-2)

```typescript
export type TenantId = string & { readonly __brand: 'TenantId' };
export interface TenantContext { readonly tenantId: string; }
export interface MaybeTenantContext { readonly tenantId?: string; }

export function getTenantIdStrict(ctx: { meta?: MaybeTenantContext }): TenantId; // throws
export function getTenantIdOptional(ctx: { meta?: MaybeTenantContext }): TenantId | undefined;

// subpath: @gertsai/tenant/moleculer
export function tenantMiddleware(): MoleculerMiddleware;
export function getMoleculerTenantId(ctx: Context): TenantId | undefined;
```

### `@gertsai/otel` (W-3)

```typescript
export interface SetupObservabilityOpts {
  readonly serviceName: string;
  readonly otlpEndpoint?: string;
  readonly sampling?: number; // 0..1, default 1
  readonly resource?: Readonly<Record<string, string>>;
}
export interface ObservabilityHandle {
  readonly sdk: unknown; // NodeSDK lazy-imported
  readonly shutdown: () => Promise<void>;
}
export function setupObservability(opts: SetupObservabilityOpts): ObservabilityHandle;

// subpath: @gertsai/otel/moleculer
export function withMoleculerTracing(brokerOptions: BrokerOptions): BrokerOptions;
```

### `@gertsai/pg-client` (W-4)

```typescript
export interface PgClient {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}

export type PgClientLike<T> = T extends PgClient ? T : never;

export interface MockPgClientOpts {
  readonly queryResults?: ReadonlyArray<{ pattern: RegExp; result: unknown[] }>;
  readonly executeResults?: ReadonlyArray<{ pattern: RegExp; result: number }>;
}
export function mockPgClient(opts?: MockPgClientOpts): PgClient & {
  readonly queries: ReadonlyArray<{ sql: string; params: unknown[] }>;
};
```

### `@gertsai/queue` (W-5)

```typescript
export interface QueueOpts {
  readonly connection: { host: string; port: number; password?: string };
  readonly defaultJobOptions?: { attempts?: number; backoff?: unknown };
}

export interface WorkerOpts extends QueueOpts {
  readonly concurrency?: number;
}

export function createQueue<T = unknown>(name: string, opts: QueueOpts): Queue<T>;
export function createWorker<T = unknown, R = void>(
  name: string,
  processor: (job: Job<T>) => Promise<R>,
  opts: WorkerOpts,
): Worker<T, R>;

// subpath: @gertsai/queue/standalone
export interface StartStandaloneOpts {
  readonly queues: ReadonlyArray<{ name: string; processor: (job: Job) => Promise<unknown> }>;
  readonly connection: QueueOpts['connection'];
}
export function startStandalone(opts: StartStandaloneOpts): Promise<{ shutdown: () => Promise<void> }>;
```

## Out of scope

- ❌ `@gertsai/auth-moleculer` package (deferred per ADR-004 I-5).
- ❌ `@gertsai/llm-observe` (renamed upstream LLM-obs SDK; future wave).
- ❌ ApiController BullMQ refactor to consume `@gertsai/queue` (Sprint 3.x follow-up).
- ❌ Hex enforcement applied to new foundation libs (per ADR-002 §I-5).
- ❌ npm publish v0.2.0 (gated on user explicit Y after EVID-007).

## Acceptance Checklist

- [ ] **W-1**: `packages/config/` shim re-exports + ≥3 tests + README explaining shim role.
- [ ] **W-2**: `packages/tenant/` types + helpers + `/moleculer` adapter; ≥10 tests pass.
- [ ] **W-3**: `packages/otel/` `setupObservability()` + `/moleculer` adapter; lazy peer-deps; ≥5 tests pass.
- [ ] **W-4**: `packages/pg-client/` agnostic 3-method interface + `mockPgClient()`; NO Prisma/Drizzle/pg in deps; ≥8 tests pass.
- [ ] **W-5**: `packages/queue/` BullMQ wrappers + `/standalone` runner; lazy peer-deps; ≥5 tests pass.
- [ ] **W-6**: `CLAUDE.md` tier table reflects 19 packages with proper tier assignments + ADR-004 cross-link.
- [ ] **W-7**: full repo verify gates green + per-package `pnpm pack --dry-run` 0 leak.
- [ ] **W-8**: 3 atomic commits + EVID-007 + SPEC-006 active + Hindsight retained.

## Sprint 3.2 acceptance bundle

Sprint 3.2 завершён, когда:

1. ✅ All W-1..W-8 acceptance.
2. ✅ Monorepo has **19 packages** built and tested.
3. ✅ Test count: ≥4051 baseline + new tests (~30-50).
4. ✅ Zero regression on Sprint 3.0.1 baseline.
5. ✅ `pnpm run lint/publint/depcruise/attw` green (all 19 + m9s-example).
6. ✅ Changesets aggregated for 5 minor bumps.
7. ✅ EVID-007 active + linked SPEC-006 + ADR-004 + PRD-001.

## Risks (Sprint 3.2)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | History-preserve extraction (W-2 tenant) drags HTTP/Moleculer coupling | Medium | Medium | Worker may fall back to fresh-code with documented TODO |
| R-2 | OTel SDK peer-dep matrix complex | Medium | Low | All peer-deps optional + lazy-required; smoke test confirms graceful no-op |
| R-3 | BullMQ wrapper extraction (W-5) interferes with ApiController | Low | Medium | W-5 ships package only; ApiController migration is Sprint 3.x — explicit docs |
| R-4 | publint/attw fail on new packages | Medium | Low | Workers use Sprint 3.0.1 patterns from existing packages as templates (incl. typesVersions for any subpath exports) |
| R-5 | Cross-worker package.json conflicts | Low | Low | Each worker creates its own `packages/<name>/` — disjoint scope |

## Implementation Plan — sequenced для AgentTeams

**Phase A** (5∥ disjoint workers, ~2-4h wall-clock):

- **config-worker (W-1)**
- **tenant-worker (W-2)**
- **otel-worker (W-3)**
- **pg-client-worker (W-4)**
- **queue-worker (W-5)**

Each worker creates a NEW package directory; no shared file edits → 0 conflicts. Each follows the Sprint 3.0.1 packaging template (uniform package.json scripts, tsup dual ESM+CJS, typesVersions for subpaths).

**Phase B** (team-lead solo, ~30-60min): W-6 + W-7.

**Phase C** (team-lead solo, ~30min): W-8.

## Affected Files

- `packages/config/**` (NEW, ~10 files)
- `packages/tenant/**` (NEW, ~12 files)
- `packages/otel/**` (NEW, ~12 files)
- `packages/pg-client/**` (NEW, ~10 files)
- `packages/queue/**` (NEW, ~12 files)
- `CLAUDE.md` (W-6 tier table + count update)
- `pnpm-lock.yaml` (regenerated)
- `.changeset/sprint-3-2-foundation-libs-wave-1.md` (NEW combined entry)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 (Wave 2 — Clean Library Platform, amended 2026-05-05) | PRD | based_on |
| ADR-004 (Foundation libs naming + extraction strategy) | ADR | based_on |
| ADR-003 (Platform Runtime Boundaries) | ADR | refines |
| ADR-002 (Hex layer enforcement) | ADR | informs (foundation libs OUTSIDE hex enforcement per §I-5) |
| EVID-006 (Sprint 3.0.1 complete) | Evidence | informs (clean foundation для Build) |
| ADR-011 (api-rlr / pg-client agnostic invariants) | external (Hub) | informs (W-4) |

> **Next step**: SPEC-006 → AgentTeams Phase A 5∥ workers.


