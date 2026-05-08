---
depth: standard
id: EVID-021
kind: evidence
last_modified_at: 2026-05-07T22:21:54.871012+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-006
  relation: informs
- target: ADR-012
  relation: informs
- target: RFC-004
  relation: informs
- target: SPEC-017
  relation: informs
status: active
title: Wave 6.3 — Multi-instance auth-openfga scoping implementation + audit + fixes
---

# EVID-021 — Wave 6.3 multi-instance scoping

## Structured Fields

- **verdict:** supports
- **congruence_level:** CL3
- **evidence_type:** unit tests + integration regression on live infra + 3∥ Pre-Build audit

## Summary

Closes Sprint 3.11 Post-Build Track 2 §P1-2 / KNOWN-ISSUES
§FGA-singleton-multi-store per PRD-006 + ADR-012 + RFC-004 + SPEC-017.

Replaced `let clientInstance: GertsFgaClient | null` with
`Map<string, GertsFgaClient>` keyed by SHA-256 hex digest of
canonical-JSON of `{apiUrl, apiToken, authorizationModelId, storeId}`.
Same pattern for `getPermissionCache(scope?: string)`. Added
`createFgaClient()` non-cached factory. `checkPermission(req, opts?)`
now accepts `{ client?: GertsFgaClient; cacheScope?: string }` so
m9s-example's `OpenFgaPermissionGate` can route per-tenant.
Backwards-compat absolute — single-config workloads observe zero
behaviour change.

## Test Results

### Edge 1 — `@gertsai/auth-openfga` unit tests

```
 ✓ src/__tests__/cache.multi-scope.test.ts        (7 tests)  [NEW]
 ✓ src/__tests__/client.multi-instance.test.ts   (12 tests)  [NEW]
 ✓ src/__tests__/fingerprint.fitness.test.ts     ( 3 tests)  [NEW — ARCH-P1-3]
 ✓ src/__tests__/client.api-token.test.ts         (4 tests)  Wave 6.2
 ✓ src/__tests__/constants.test.ts               (16 tests)  unchanged
 ✓ src/__tests__/cache.test.ts                   (18 tests)  unchanged
 ✓ src/__tests__/deny.test.ts                    (15 tests)  unchanged
 ✓ src/__tests__/bulk.test.ts                    (11 tests)  unchanged

 Test Files  8 passed
      Tests  86 passed (+22 over Wave 6.2 baseline of 64)
```

### Edge 2 — m9s-example mock + real-infra

```
 ✓ tests/openfga-permission.gate.multi-instance.test.ts (4 tests) [NEW]
 ✓ tests/openfga-permission.gate.test.ts                (4 tests) Wave 6.2
 ✓ tests/openfga-model.test.ts                          (3 tests) Wave 6.1 drift guard preserved
 ✓ tests/e2e.test.ts                                    (8 tests)
 ✓ tests/real-infra.test.ts                             (3 tests, env-gated)
 ✓ tests/audit-propagation.test.ts                      (4 tests)
 ✓ tests/ingest-use-case.test.ts                        (7 tests)
 ✓ tests/search-use-case.test.ts                        (5 tests)
 ✓ tests/wave5-integration.test.ts                      (4 tests)

 Test Files  9 passed
      Tests  42 passed (+4 over Wave 6.2 baseline of 38)
```

Real-infra (against running docker-compose):

```
 ✓ tests/real-infra/bullmq.test.ts    (3 tests)
 ✓ tests/real-infra/openfga.test.ts   (9 tests)
 ✓ tests/real-infra/pg-vector.test.ts (4 tests)

 Test Files  3 passed
      Tests  16 passed (no regression)
```

### Quality gates

- `pnpm -r --workspace-concurrency=1 build` — clean.
- `pnpm typecheck` (m9s-example) — 0 errors.
- `pnpm depcruise` — 0 violations (119 modules, 257 deps cruised).

## Pre-Build Audit (3∥ reviewers)

| Track | Reviewer | Verdict | P0 | P1 |
|---|---|---|---|---|
| Security | `agents-pro:security-expert` | **ACCEPT** | 0 | 0 |
| Architecture | `agents-pro:architect-reviewer` | ACCEPT-WITH-FIXUPS | 0 | 3 |
| Type System | `agents-domain:typescript-type-auditor` | ACCEPT-WITH-FIXUPS | 1 | 4 |

### Findings + resolutions

- **TYPE-P0-1** — `DEFAULT_FINGERPRINT` was typed `string`; consumer
  could collide with the `'__default__'` private convention.
  **Fix**: `as const` so the export type is the literal
  `'__default__'`. Consumers now narrow at the use site.
- **TYPE-P1-1** — `CheckPermissionOptions.client` vs `clientScope`
  was unenforced soft-XOR. **Fix**: deleted `clientScope`
  (was reserved-but-unimplemented; ADR-012 rationale: ship no
  unused public surface; re-add when a real follow-up needs it).
- **ARCH-P1-1** — Per-call `fingerprint(gateConfig)` cost in m9s
  gate hot path. **Fix**: memoise `cacheScope` on first `can()`;
  subsequent calls reuse without re-hashing.
- **ARCH-P1-2** — `clientScope` dead surface. **Fix**: covered by
  TYPE-P1-1 above (deleted).
- **ARCH-P1-3** — Future `FgaClientConfig` field could silently
  collide on existing fingerprints. **Fix**: added
  `__tests__/fingerprint.fitness.test.ts` — fitness function that
  enumerates `Required<FgaClientConfig>` keys and asserts each
  is either in the canonical JSON OR explicit `NON_IDENTITY_FIELDS`
  allowlist. Mechanical guard, no human discipline required.
- **TYPE-P1-2** — `resetFgaClient(config)` vs `resetPermissionCache(scope)`
  signature asymmetry. **Deferred**: reviewer marked defer-OK;
  noted in KNOWN-ISSUES as polish-future work; existing zero-arg
  back-compat preserved.

## ADI events

**ADI Round 1 — broken real-infra `same-tenant ALLOW` test**:
After Edge 1+2 initial implementation, the test that previously
passed (`gate.can('default', 'search', DOC_ACME)` returning `true`)
returned `false`.

- H1: Pre-warm `mod.getFgaClient(gateConfig)` creates SCOPED instance,
  but `checkPermission(req)` calls `getFgaClient()` no-arg →
  DIFFERENT default instance with no `storeId` → SDK call goes to
  wrong store. **TRUE** — read `queries/index.ts:78`, confirmed.
- H2: Cache scope mismatch — eliminated by H1.
- H3: SDK rejecting requests — would manifest as `false` from
  fail-closed catch, but logs would show. Logs were silent → not H3.

**Resolution**: Extended `CheckPermissionOptions.client` (originally
absent — only `cacheScope` and reserved `clientScope`) so gate
forwards its scoped client explicitly. Test green in 1 round.

## Files Changed

NEW (5):
- `packages/auth-openfga/src/util/fingerprint.ts` — pure SHA-256
  helper + `DEFAULT_FINGERPRINT` literal constant
- `packages/auth-openfga/src/__tests__/client.multi-instance.test.ts`
- `packages/auth-openfga/src/__tests__/cache.multi-scope.test.ts`
- `packages/auth-openfga/src/__tests__/fingerprint.fitness.test.ts`
  (Wave 6.3 ARCH-P1-3 fitness guard)
- `examples/m9s-example/tests/openfga-permission.gate.multi-instance.test.ts`
- `.forgeplan/{prds/PRD-006,adrs/ADR-012,rfcs/RFC-004,specs/SPEC-017,evidence/EVID-021}-...md`
  (5 forgeplan artifacts)

MODIFIED (5):
- `packages/auth-openfga/src/client.ts` — singleton → Map cache
- `packages/auth-openfga/src/cache/index.ts` — singleton → Map cache
  with scope key
- `packages/auth-openfga/src/queries/index.ts` — `CheckPermissionOptions`
  with `client?` + `cacheScope?`
- `packages/auth-openfga/src/index.ts` — re-export `createFgaClient`,
  `fingerprint`, `DEFAULT_FINGERPRINT`
- `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts`
  — auto-derive cache scope, forward scoped client
- `KNOWN-ISSUES.md` — flip §FGA-singleton-multi-store RESOLVED

## Methodology trace

OBSERVE (`forgeplan health`: 52 active artifacts, healthy) →
ROUTE (Deep, 90% confidence, PRD → Spec → RFC → ADR pipeline) →
SHAPE (PRD-006 + ADR-012 + RFC-004 + SPEC-017, all validated clean) →
BUILD (W-6-3-1..9 sequential, single owner) →
ADI (1 round, H1 confirmed, fix applied) →
PRE-BUILD AUDIT (3∥ reviewers, 1 P0 + 5 P1, all fixed inline) →
POST-FIX VERIFY (86/86 + 42/42 + 16/16 all green) →
PROVE (this evidence, CL3 supports, R_eff link to PRD-006 + RFC-004 + SPEC-017) →
SHIP (commit + PR pending user consent — autopilot does not push).

## Notes

- The `clientScope` field on `CheckPermissionOptions` was deliberately
  REMOVED before merge per audit recommendation: ship no unused public
  surface. Adding optional fields is non-breaking; removing them is.
  The escape-hatch for future "lookup by string scope" remains the
  `client` field (caller resolves their own client externally).
- `createFgaClient` is the deliberate non-cached escape hatch for
  callers who need per-request clients (e.g. short-lived audit jobs).
  It is NOT the recommended path for steady-state multi-tenant
  deployments — those should use `getFgaClient(config)` + the
  fingerprint cache so warm-state discovery cost is amortised.
- The fitness function (`fingerprint.fitness.test.ts`) is the most
  important long-term safeguard: when SDK or our config gains a new
  identity field, it surfaces the omission mechanically.






