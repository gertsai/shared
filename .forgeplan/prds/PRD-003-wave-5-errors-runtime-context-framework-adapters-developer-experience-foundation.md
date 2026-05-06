---
depth: standard
id: PRD-003
kind: prd
last_modified_at: 2026-05-06T14:57:25.121457+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-002
  relation: refines
status: active
title: Wave 5 — Errors + Runtime Context + Framework Adapters (developer experience foundation)
---

# PRD-003: Wave 5 — Errors + Runtime Context + Framework Adapters

## Vision

Production-grade **developer experience layer** для `@gertsai/*` — стандартизированные ошибки (HTTP↔gRPC ready), tenant resolution в multi-strategy chain, session scoping для multi-tenancy, runtime context для Moleculer, и UI framework adapters для Entity. Wave 5 завершает foundation libraries: после Wave 5 любой backend developer может построить production-grade gertsai app **без переписывания** errors/tenant/context boilerplate, и любой UI framework может потреблять `@gertsai/entity` без gymnastics.

Wave 4 закончила **data foundation** (entity/session/audit/storage). Wave 5 завершает **DX foundation** (errors/tenant/runtime-context/adapters). Sprint 3.6-3.9 покрывают: errors+tenant+session-scoping (3.6) → runtime-context (3.7) → 4 entity framework adapters parallel (3.8) → 4 Orchestra HIGH candidates (3.9).

## Problem

Wave 4 закончен — production-grade entity/storage/audit foundation. Что осталось boilerplate, который каждый downstream проект изобретает:

1. **Errors**: каждый проект пишет свою иерархию (ValidationError, NotFoundError, UnauthorizedError…) с собственным HTTP↔gRPC mapping. Inconsistency между downstream apps. Type-safety на error.kind отсутствует.

2. **Tenant resolution**: multi-tenancy требует extracting tenantId из request (header / JWT / subdomain / path). Каждый проект изобретает chain-of-responsibility. ADI: ad-hoc resolution создаёт security holes.

3. **Session scoping**: `operatorUuid` + `dataAccessUuid` существуют (Wave 4), но **без `tenantId/projectId/spaceId` scoping невозможно безопасно отсечь cross-tenant data leak в multi-tenant SaaS**. Repository tests не имеют способа задать tenant scope без обхода API.

4. **Runtime context**: `RequestContext` с lazy getters (`currentSession`, `currentTenant`, `currentRequestId`, `currentLocale`, etc.) — Moleculer `ctx.meta` hint pattern duplicated в каждом сервисе. Type-unsafe access (`ctx.meta.tenantId as string`).

5. **UI Framework adapters**: Vue / React / Solid / Svelte имеют свой reactivity layer. `@gertsai/entity` нейтрален (Wave 4), но adapter нужен — иначе каждый user пишет свой shim. `@gertsai/entity/vue` уже есть; React/Solid/Svelte отсутствуют.

6. **Orchestra HIGH candidates** (per W-7 reference coverage triage): rpc-proxy-builder, logger-factory, async-utils, rest-request-manager — patterns идентифицированы как HIGH OSS value across multi-project Orchestra scan. Без extraction остаются captive Orchestra impl.

**Impact без Wave 5**:

- Каждый gertsai-style app переизобретает error hierarchy + HTTP/gRPC mapping (~300-500 LOC × проект).
- Multi-tenant apps drift: subset вообще не делает `getTenantStrict()` checks → cross-tenant leakage в production.
- AI agents (acting on behalf of users) обходят session scoping ad-hoc.
- UI users либо принимают plain-object reactivity (медленно/неестественно для Vue/React) либо реализуют framework adapter сами.
- Orchestra-extracted HIGH patterns остаются captive в одном проекте.

## Target Users

| Персона | Описание | Боль без Wave 5 |
|---------|----------|------------------|
| **Backend application developer** | Строит сервисы поверх `@gertsai/api-core` | Изобретает error hierarchy, tenant extraction, ctx.meta accessor pattern. Каждый раз. |
| **Multi-tenant SaaS author** | Multi-tenant backend с строгой isolation | Session scoping incomplete — приходится ad-hoc tenant guard в каждом repo. |
| **AI agent author** | Делает агентов, действующих от имени users | Identity scoping (operator vs dataAccess) есть, но cross-tenant guards нет. |
| **Frontend / fullstack developer** | Vue / React / Solid / Svelte UI поверх `@gertsai/entity` | Только Vue имеет adapter; для остальных — manual shim. |
| **Library reuse adopter** | Использует gertsai-style patterns в external repo | Patterns captive в Orchestra; нет извлечённой версии. |
| **Maintainer (мы)** | Развиваем foundation | Каждый downstream проект ломает наши patterns по-своему. |

## Differentiators (после Wave 5)

- **Universal error hierarchy** — `@gertsai/errors` ships ErrorKind enum + 10 specific subclasses с HTTP/gRPC mapping. Единый source of truth.
- **Composable tenant resolution** — `ChainTenantResolver` + 3+ built-in strategies (Header/Subdomain/Path) + Moleculer/HTTP adapters. Drop-in для любого транспорта.
- **Multi-tenant safe by default** — `Session.getTenantStrict()` throws вместо silent leak.
- **Type-safe runtime context** — `getRequestContext().currentTenant` типизирован, не `as string`.
- **Framework-native UI integration** — Vue/React/Solid/Svelte adapters в отдельных subpath packages, peer-dep optional.

## Goals

- **G-1**: `@gertsai/errors` ships как Tier 1 — universal error hierarchy + HTTP/gRPC mapping subpaths. Sprint 3.6.
- **G-2**: `@gertsai/tenant-resolver` ships как Tier 1 — composable strategy chain + Moleculer/HTTP adapters. Sprint 3.6.
- **G-3**: `@gertsai/session` gains additive scoping (`tenantId/projectId/spaceId`) — backward-compatible (NO breaking). Sprint 3.6.
- **G-4**: `@gertsai/runtime-context` ships как Tier 4 + `/moleculer` subpath. Sprint 3.7.
- **G-5**: 4 entity framework adapters ship parallel — `entity-react`, `entity-solid`, `entity-svelte`, refactor `entity-vue`. Sprint 3.8.
- **G-6**: 4 Orchestra HIGH candidates extract — `rpc-proxy-builder`, `logger-factory`, `async-utils`, `rest-request-manager`. Sprint 3.9.
- **G-7**: 7 P2 polish items addressed (post-Sprint-3.5.2 audit findings) во время Sprint 3.6 как opportunistic cleanup.

## Non-Goals

- НЕ extract `@gertsai/auth-moleculer` (deferred per ADR-004 I-5 + needs `@gertsai/auth` ADR first).
- НЕ модифицировать существующие public APIs `@gertsai/{entity, storage-core, entity-storage, query-dsl}` — additive only.
- НЕ extract domain-specific Orchestra entities (Spaces/Chats/Messages — domain-specific).
- НЕ ship multi-master replication, schema migrations, etc. — отдельные waves.
- НЕ embed concrete HTTP framework dependency в `@gertsai/errors` core (HTTP types только в `/http` subpath).
- НЕ embed concrete UI framework runtime в core `@gertsai/entity` (Wave 4 invariant).

## Scope

### Sprint 3.6 — Wave 5 Phase 1 (this sprint)

| Package | Tier | Strategy | Effort | Source |
|---------|------|----------|--------|--------|
| `@gertsai/errors` | 1 | F (fresh, mirroring upstream errors) | 8h | upstream errors module |
| `@gertsai/tenant-resolver` | 1 | F (fresh) | 12h | upstream tenant resolution patterns |
| `@gertsai/session` (additive scoping) | 1 | E+ (enhance existing, additive) | 6h | upstream session scoping fields |
| 7 P2 polish items (batch) | — | F+ (fix on existing) | 2h | post-Sprint-3.5.2 audit |

**Total Sprint 3.6 effort**: ~28h ≈ 1 working week.

### Sprint 3.7 — Wave 5 Phase 2

| Package | Tier | Strategy | Effort | Source |
|---------|------|----------|--------|--------|
| `@gertsai/runtime-context` + `/moleculer` | 4 | F (fresh) | 16-24h | upstream RequestContext |
| `@gertsai/session-guard` | 2 | F (fresh) | 8h | upstream session helpers |
| `@gertsai/audit-primitives` | 2 | F (fresh) | 6h | upstream audit primitives |

### Sprint 3.8 — Wave 5 Phase 3 (parallel-friendly)

| Package | Tier | Strategy | Effort |
|---------|------|----------|--------|
| `@gertsai/entity-vue` (extract from subpath) | 2 | F (lift from `entity/vue`) | 4h |
| `@gertsai/entity-react` | 2 | F (fresh) | 8h |
| `@gertsai/entity-solid` | 2 | F (fresh) | 8h |
| `@gertsai/entity-svelte` | 2 | F (fresh) | 8h |

4-AgentTeams parallel; estimated ~1 week wall-clock.

### Sprint 3.9 — Wave 5 Phase 4 (Orchestra HIGH candidates)

| Package | Tier | Strategy | Effort |
|---------|------|----------|--------|
| `@gertsai/rpc-proxy-builder` | 3 | F (fresh) | 8h |
| `@gertsai/logger-factory` | 1 | F (fresh) | 6h |
| `@gertsai/async-utils` | 1 | F (fresh) | 4h |
| `@gertsai/rest-request-manager` | 2 | F (fresh) | 10h |

## Out-of-Scope (Wave 5 explicitly does NOT include)

- Hard imports concrete HTTP framework (`express`, `fastify`, `koa`) в `@gertsai/errors` core. Only via `/http` subpath адаптера.
- Hard imports concrete UI framework runtime (`@vue/runtime-core`, `react`) в `@gertsai/entity` core. Wave 4 invariant preserved.
- Postgres-specific listener implementation для `@gertsai/pg-client/storage` (CDC/LISTEN-NOTIFY bridge — Wave 6+).
- Session cookie management / JWT verification (consumers use `@gertsai/api-core/moleculer/auth` until separate `@gertsai/auth` ADR).
- Breaking changes to `@gertsai/session` constructor — only additive optional fields.
- Auth-moleculer extraction (per ADR-004 I-5).

## Functional Requirements

| ID | Category | Requirement | Priority |
|----|----------|-------------|----------|
| FR-W5-001 | Errors | `@gertsai/errors` provides `ErrorKind` enum (10 kinds: VALIDATION, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, CONFLICT, RATE_LIMITED, INTERNAL, UPSTREAM_FAILURE, TIMEOUT, BAD_GATEWAY) | Must |
| FR-W5-002 | Errors | `@gertsai/errors` provides `AppError` base + 10 subclass per kind с typed `details` field + `cause` propagation | Must |
| FR-W5-003 | Errors | `@gertsai/errors` provides `/http` subpath: `appErrorToHttpResponse(err)` + status code mapping table | Must |
| FR-W5-004 | Errors | `@gertsai/errors` provides `/grpc` subpath: `appErrorToGrpcStatus(err)` + grpc.status code mapping | Must |
| FR-W5-005 | Errors | `@gertsai/errors` provides `isAppError(x)` type guard + `getUserMessage(error, locale?)` helper | Should |
| FR-W5-006 | TenantResolver | `@gertsai/tenant-resolver` provides `TenantResolverStrategy<Source>` interface | Must |
| FR-W5-007 | TenantResolver | `@gertsai/tenant-resolver` provides `ChainTenantResolver` — composable chain-of-responsibility | Must |
| FR-W5-008 | TenantResolver | `@gertsai/tenant-resolver` provides built-in strategies: HeaderStrategy (`X-Tenant-ID`), SubdomainStrategy, PathStrategy (`/t/:id/...`) | Must |
| FR-W5-009 | TenantResolver | `@gertsai/tenant-resolver` provides `/moleculer` subpath — adapter reading `ctx.meta.tenantId` | Must |
| FR-W5-010 | TenantResolver | `@gertsai/tenant-resolver` provides `/http` subpath — adapter for raw `http.IncomingMessage` | Should |
| FR-W5-011 | Session | `@gertsai/session` additive optional fields: `tenantId?`, `projectId?`, `spaceId?` (constructor + accessors) | Must |
| FR-W5-012 | Session | `@gertsai/session` additive helpers: `getTenantStrict()` throws if missing, `getTenantOptional()` returns `string \| null` | Must |
| FR-W5-013 | Session | `@gertsai/session` backward-compat: existing constructor signature works WITHOUT new fields | Must |
| FR-W5-014 | Polish | `InMemoryStorageProvider<Meta = StorageMetadata>` default generic (P2 EG-1) | Should |
| FR-W5-015 | Polish | `BaseEntityStorageService.upsert(entity)` — atomic upsert helper (P2 EG-2) | Should |
| FR-W5-016 | Polish | Remove 4 `as any` casts in `audit-propagation.test.ts` via proper typing (P2 ID-MF-2) | Should |
| FR-W5-017 | Polish | README cleanup: '13 OSS packages' → '28' (P2 ID-MF-1) | Should |
| FR-W5-018 | Polish | `entity-storage/package.json` peer-dep optional flag removal + Phase A/B language cleanup (P2 EG-4) | Should |

## Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-W5-001 | Backward compatibility | `@gertsai/session` existing constructor + getters preserved (additive only) | regression: existing tests pass |
| NFR-W5-002 | Backend agnosticism | `@gertsai/errors` NO HTTP framework imports in core (only in `/http` subpath) | grep audit: 0 matches |
| NFR-W5-003 | Backend agnosticism | `@gertsai/tenant-resolver` core NO Moleculer imports (only in `/moleculer` subpath) | grep audit |
| NFR-W5-004 | Tarball hygiene | Per-package `pnpm pack --dry-run`: 0 leak (test/src/.env/tsconfig artifacts) | preserves Sprint 3.0 baseline |
| NFR-W5-005 | API stability | Wave 5 packages ship as 0.1.0 (initial release); follow SemVer post-publish | changeset minor |
| NFR-W5-006 | Test coverage | Each new package ≥10 tests; `@gertsai/session` +5 scoping tests | per-package vitest |
| NFR-W5-007 | Type safety | strict TS, no `any` без `// reason: ...` | `pnpm typecheck` green |
| NFR-W5-008 | License | SPDX header on every new file | audit script |
| NFR-W5-009 | publint | All new packages: `pnpm run publint` "All good!" | CI gate |
| NFR-W5-010 | attw | Subpath exports — typesVersions per Sprint 3.0.1 F-4 pattern | `pnpm run attw` 0💀 |

## Acceptance Criteria

### AC-W5-1 — Sprint 3.6 complete (Wave 5 Phase 1)

```
Given Sprint 3.6 SPEC-011 implementation is complete
When  CI runs full repo verify (install/build/test/typecheck/lint/publint/depcruise)
Then  2 new packages green (@gertsai/{errors, tenant-resolver})
And   @gertsai/session additive scoping passes regression suite (existing tests untouched)
And   7 P2 polish items addressed
And   grep audit returns 0 matches for forbidden imports (HTTP framework in errors/core, Moleculer in tenant-resolver/core)
And   EVID-013 active с structured measurements
```

### AC-W5-2 — Sprint 3.7 complete (Wave 5 Phase 2)

```
Given Sprint 3.7 implementation is complete
When  CI runs full repo verify
Then  3 new packages green (@gertsai/{runtime-context, session-guard, audit-primitives})
And   /moleculer subpath of runtime-context exports sessionMiddleware factory
And   FeatureContext + ProviderContext interfaces have lazy getter implementation
And   EVID-W5-2 active
```

### AC-W5-3 — Sprint 3.8 complete (Wave 5 Phase 3)

```
Given Sprint 3.8 implementation is complete
When  CI runs full repo verify
Then  4 packages green (@gertsai/{entity-vue, entity-react, entity-solid, entity-svelte})
And   each adapter satisfies @gertsai/entity ReactiveAdapter contract
And   peer-dep gates work: importing entity-react without react throws install-time error
And   EVID-W5-3 active
```

### AC-W5-4 — Sprint 3.9 complete (Wave 5 Phase 4)

```
Given Sprint 3.9 implementation is complete
When  CI runs full repo verify
Then  4 packages green (@gertsai/{rpc-proxy-builder, logger-factory, async-utils, rest-request-manager})
And   EVID-W5-4 active
```

## Dependencies

| Package | Internal deps | External peer-deps |
|---------|---------------|---------------------|
| `@gertsai/errors` (Sprint 3.6) | none | none core; HTTP types in `/http` subpath only |
| `@gertsai/tenant-resolver` (Sprint 3.6) | `@gertsai/errors` (UnauthorizedError when chain fails) | none core; `moleculer` peer-optional in `/moleculer` |
| `@gertsai/session` additive (Sprint 3.6) | existing | existing |
| `@gertsai/runtime-context` (Sprint 3.7) | `@gertsai/session`, `@gertsai/errors`, `@gertsai/di` | `moleculer` in `/moleculer` |
| `@gertsai/session-guard` (Sprint 3.7) | `@gertsai/session`, `@gertsai/errors` | none |
| `@gertsai/audit-primitives` (Sprint 3.7) | `@gertsai/entity-audit` | none |
| `@gertsai/entity-{vue,react,solid,svelte}` (Sprint 3.8) | `@gertsai/entity` | UI framework runtime peer-optional |
| `@gertsai/rpc-proxy-builder` (Sprint 3.9) | `@gertsai/api-core/contracts` | none |
| `@gertsai/logger-factory` (Sprint 3.9) | none | optional pino/winston peer |
| `@gertsai/async-utils` (Sprint 3.9) | none | none |
| `@gertsai/rest-request-manager` (Sprint 3.9) | `@gertsai/errors`, `@gertsai/fetch` | none |

## Risks

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | Errors HTTP/gRPC mapping ambiguity (e.g., 422 vs 400 for VALIDATION) | Medium | Medium | Adopt RFC 7807 (Problem Details) + RFC 9457 ProblemDetail extension; document mapping table in ADR-006 |
| R-2 | Tenant chain resolution leaks credentials between strategies | Low | High | Each strategy returns `{tenantId} \| null`; chain fails fast; no shared state; adversarial test fixtures |
| R-3 | Session additive scoping breaks downstream tests via property name shadow | Low | Low | Strict optional fields; existing tests run untouched; CI matrix covers regression |
| R-4 | Runtime-context lazy getters introduce hidden order-of-init bugs | Medium | Medium | Documented init contract; eager-init test fixture; `freeze` after init |
| R-5 | Framework adapters drift API surface from `@gertsai/entity` core | Medium | Medium | Shared ReactiveAdapter contract test suite consumed by all 4 adapters |
| R-6 | Orchestra HIGH candidates require Orchestra-specific dependencies | High | Medium | Each candidate triaged in ADR-006 §C — drop pattern if not OSS-friendly |
| R-7 | Polish batch (P2) accidentally introduces breaking change | Low | High | Each polish item changeset-versioned; reviewer must confirm "additive only" classification |

## Implementation Phases

### Sprint 3.6 (this sprint — Wave 5 Phase 1)

**Phase A** (4∥ workers, disjoint file ownership):
- W-3-6-1 errors-worker → `packages/errors/**` (NEW)
- W-3-6-2 tenant-resolver-worker → `packages/tenant-resolver/**` (NEW)
- W-3-6-3 session-additive-worker → `packages/session/src/**` (additive fields + helpers)
- W-3-6-4 polish-worker → `packages/entity-storage/**` + `examples/m9s-example/tests/audit-propagation.test.ts` + `README.md` + `entity-storage/package.json` (P2 batch)

**Phase B** (team-lead solo): integrated verify (install/build/test/typecheck/lint/publint/depcruise/attw), CLAUDE.md tier table 26 → 28, changesets.

**Phase C** (team-lead solo): post-Build fidelity audit (3 reviewers parallel), address P0/P1 if any, EVID-013 active, SPEC-011 active, single atomic commit, Hindsight retain.

### Sprint 3.7 (Wave 5 Phase 2)

Sequential after Sprint 3.6. 3 parallel workers + team-lead. Same pattern.

### Sprint 3.8 (Wave 5 Phase 3, parallel-friendly with 3.7)

4 parallel framework adapter teams, each isolated package. Can run in parallel with Sprint 3.7 if resources allow.

### Sprint 3.9 (Wave 5 Phase 4)

4 parallel workers + team-lead, sequential after 3.7/3.8.

## Success Criteria

| ID | Criterion | Metric | Timeframe |
|----|-----------|--------|-----------|
| SC-W5-1 | 13 packages added в total Wave 5 (2 Sprint 3.6 + 3 Sprint 3.7 + 4 Sprint 3.8 + 4 Sprint 3.9) | `ls packages/ \| wc -l`: 26 → 39 | end of Wave 5 |
| SC-W5-2 | All Wave 5 core packages backend-agnostic (subpath isolation for adapters) | grep audit: 0 forbidden imports | each sprint |
| SC-W5-3 | Sprint 3.6 zero regressions on existing 4443 tests | test count: ≥4443 + new tests | Sprint 3.6 EVID-013 |
| SC-W5-4 | All Wave 5 packages ship as 0.1.0 на npm (post-Wave-5 publish gate) | `npm view @gertsai/* version` | Q3-Q4 2026 |
| SC-W5-5 | 7 P2 polish items closed | spec checklist complete | Sprint 3.6 EVID-013 |

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | refines (Wave 4 foundation extends here) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | informs (extraction policy reused) |
| ADR-006 (errors + tenant-resolver placement + Wave 5 extraction policy) | ADR | based_on |
| EVID-012 (Sprint 3.5.2 m9s-example Wave 4 migration) | Evidence | informs (Wave 4 production-grade baseline) |
| ADR-004 (Foundation libs naming + extraction strategy) | ADR | informs (E + A markers reused; new F+ marker for additive scoping) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (subpath patterns for /http, /grpc, /moleculer) |

> **Next step**: Activate PRD-003 → Activate ADR-006 → SPEC-011 (Sprint 3.6 Shape) → pre-Build audit → Build → post-Build audit → EVID-013 → Activate.










