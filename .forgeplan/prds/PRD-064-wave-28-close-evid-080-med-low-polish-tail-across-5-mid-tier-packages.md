---
depth: standard
id: PRD-064
kind: prd
last_modified_at: 2026-05-21T05:04:53.519154+00:00
last_modified_by: claude-code/2.1.145
status: active
title: Wave 28 — close EVID-080 MED+LOW polish tail across 5 mid-tier packages
---

# PRD-064: Wave 28 — close EVID-080 MED+LOW polish tail across 7 mid-tier packages

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Standard |
| Created | 2026-05-21 |
| Parent | EVID-080 (Wave 25 audit) |

## Problem Statement

After Wave 26 closed 5/5 HIGH + 3/10 MED from EVID-080, the remaining 7 MED + 10 LOW findings persist as cosmetic / documentation / minor correctness gaps. They are NOT blockers for v1.0, but closing them in a single polish wave lets the audit ledger be fully drained before the v1.0 release decision, leaving zero open findings across all 41 packages.

M4 (OperatorRef._uid → uuid rename) is intentionally **deferred** — it is a surface-breaking rename and properly belongs to a v1.x minor/major bump cycle, not a patch polish wave.

M10 (`ctx.meta ?? {}` lazy-create) is **out-of-scope** — EVID-080 explicitly tags it "code is correct; readability note" — no action required.

## Target Audience

- **Primary**: maintainers of the `@gertsai/*` monorepo (gertsai/shared) preparing for v1.0 release. They need a zero-open-findings ledger before signing off on v1.0.
- **Secondary**: external OSS reviewers and downstream consumers of `@gertsai/*` packages, who will read the changeset for v0.x → v1.0 migration confidence.
- **Tertiary**: future-self / next-wave engineers, who need to know which findings were intentionally deferred (M4) vs closed.

## Goals / Success Criteria

- Close 4/4 actionable MED findings (M3, M5, M8, M9) — patch-bump scope only
- Close 10/10 LOW findings (L1..L10) — patch-bump scope only
- Defer M4 explicitly with a changeset note (no covert deferral)
- Workspace-wide `pnpm typecheck` 0 errors across 45 projects
- +5..15 new tests across affected packages
- Zero public API surface breaks (all patch bumps)
- EVID-082 created + linked `informs` PRD-064 + activated with R_eff > 0.5

## Functional Requirements

### MED tail (4 actionable, FR-1..FR-4)

- **FR-1 (M3)** — `@gertsai/entity/src/EntityWithMetadata.ts:146-149`: `$markSaved` becomes idempotent on `_isMockup === false`, mirroring `$markStaled`/`$markFresh`.
- **FR-2 (M5)** — `@gertsai/session/src/Session.ts:78-83`: default `errorHandler` → `console.error(...)`. Explicit `errorHandler: () => {}` opt remains available.
- **FR-3 (M8)** — `@gertsai/tenant-resolver/src/chain-resolver.ts:42-48`: JSDoc note on serial-by-design strategy execution. Doc-only.
- **FR-4 (M9)** — `@gertsai/runtime-context/src/auth-context.ts:73-89`: `@example` JSDoc on `requireAuthContextWithDataAccess` showing distinction from `isImpersonating`. Doc-only.

### LOW tail (10, FR-6..FR-15)

- **FR-6 (L1)** — `@gertsai/audit-primitives/src/convert.ts`: explicit RangeError for negative epoch ms.
- **FR-7 (L2)** — `@gertsai/async-utils/src/with-timeout.ts`: JSDoc on AbortController best-effort semantics.
- **FR-8 (L3)** — `@gertsai/async-utils/src/throttle.ts`: JSDoc on `cancel()` lastInvoke reset.
- **FR-9 (L4)** — `@gertsai/entity/src/adapters/vue.ts`: `loadVue` triple-check uses `typeof === 'function'` with descriptive error.
- **FR-10 (L5)** — `@gertsai/tenant-resolver/src/strategies/header.strategy.ts`: JSDoc on `string[]` first-value.
- **FR-11 (L6)** — `@gertsai/tenant-resolver/src/strategies/subdomain.strategy.ts`: IPv4 regex range-precise.
- **FR-12 (L7)** — `@gertsai/rpc-proxy-builder/src/proxy.ts`: add `has`/`ownKeys`/`getOwnPropertyDescriptor` traps.
- **FR-13 (L8)** — `@gertsai/rpc-proxy-builder/src/proxy.ts`: get trap special-cases `then`/`catch`/`finally` → `undefined`.
- **FR-14 (L9)** — `@gertsai/logger-factory/src/winston/index.ts`: JSDoc on `fatal→error` mapping loss-of-distinction.
- **FR-15 (L10)** — `@gertsai/logger-factory/src/pino/index.ts`: accept optional `pinoOptions` second arg.

## Non-functional Requirements

- All bumps **patch** (zero public surface breaks)
- Build + typecheck workspace-wide green (0 errors across 45 projects)
- Test coverage: +5..15 new tests covering FR-1, FR-2, FR-6, FR-9, FR-11, FR-12, FR-13, FR-15
- No regression in existing test suites
- Doc-only FRs (3, 4, 7, 8, 10, 14) add JSDoc blocks, no functional change

## Acceptance Criteria

- [x] 4/4 actionable MED closed (FR-1..FR-4)
- [x] 10/10 LOW closed (FR-6..FR-15)
- [x] `pnpm typecheck` 0 errors
- [x] `pnpm test` per affected package: existing tests pass + new tests added & passing
- [x] Changeset created with `patch` bumps for: `@gertsai/entity`, `@gertsai/session`, `@gertsai/tenant-resolver`, `@gertsai/runtime-context`, `@gertsai/audit-primitives`, `@gertsai/async-utils`, `@gertsai/rpc-proxy-builder`, `@gertsai/logger-factory`
- [x] M4 (uuid rename) explicitly **deferred** to v1.x in changeset note
- [x] EVID-082 created + linked `informs` PRD-064 + activated

## Out of Scope

- M4 (OperatorRef._uid → uuid rename) — surface-breaking, defer to v1.1+ minor
- M10 (ctx.meta lazy-create) — already correct per audit; no action
- Wave 27 (api-core action pipeline extraction) — separate PRD-065, Deep depth, defers to user review

## Risks

- **LOW** — All findings are surgical (3..15 LOC each), most are doc-only or additive (Proxy traps).
- **Cascade risk**: FR-1 `$markSaved` idempotency change could surprise consumers who rely on re-emit. Mitigated by patch-bump scope + idempotent matching sibling methods is the documented contract.
- **FR-12/13 (rpc-proxy-builder)**: adding traps changes `'foo' in proxy` semantics — could break consumers that explicitly tested for `false`. Probability: very low (no documented use).

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| EVID-080 | based_on (Wave 25 audit — source of all 14 findings) |
| EVID-082 | informs (Wave 28 evidence — closure proof) |
| PRD-063 | refines (Wave 26 — preceding HIGH/MED closure) |
| EVID-081 | informs (Wave 26 evidence — preceding closure) |
| ADR-006 | informs (errors taxonomy — FR-2 SessionDestroyedError context) |
| ADR-007 | informs (runtime-context — FR-4 docs) |
| ADR-009 | informs (async-utils + logger-factory + rpc-proxy-builder — FR-7..FR-15) |

## Refs

- EVID-080 (Wave 25 audit — source of all 14 findings)
- PRD-063 / EVID-081 (Wave 26 — closed 5 HIGH + 3 MED preceding this wave)
- ADR-006/007/009/010 (invariants confirmed clean in EVID-080)


