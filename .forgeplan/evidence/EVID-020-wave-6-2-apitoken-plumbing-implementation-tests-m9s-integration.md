---
depth: standard
id: EVID-020
kind: evidence
last_modified_at: 2026-05-07T21:31:19.223864+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-005
  relation: informs
- target: RFC-003
  relation: informs
status: active
title: Wave 6.2 — apiToken plumbing implementation + tests + m9s integration
---

# EVID-020 — Wave 6.2 apiToken plumbing

## Structured Fields

- **verdict:** supports
- **congruence_level:** CL3
- **evidence_type:** unit tests + integration regression on live infra

## Summary

Closes Sprint 3.11 Post-Build Track 2 §P1-1 / KNOWN-ISSUES
§FGA_API_TOKEN-plumbing per PRD-005 + RFC-003. apiToken is now plumbed
end-to-end from m9s-example env (`FGA_API_TOKEN`) through composition
root → `OpenFgaPermissionGate` → `@gertsai/auth-openfga.getFgaClient` →
`GertsFgaClient.buildSdkConfig()` → `OpenFgaClient credentials = { method: ApiToken, config: { token } }`.

## Test Results

### Edge 1 — `@gertsai/auth-openfga` unit tests

```
 ✓ src/__tests__/constants.test.ts (16 tests)
 ✓ src/__tests__/deny.test.ts (15 tests)
 ✓ src/__tests__/cache.test.ts (18 tests)
 ✓ src/__tests__/client.api-token.test.ts (4 tests) [NEW]
 ✓ src/__tests__/bulk.test.ts (11 tests)

 Test Files  5 passed
      Tests  64 passed
```

`client.api-token.test.ts` mocks the `@openfga/sdk` `OpenFgaClient`
constructor via `vi.mock` and asserts:
1. When `apiToken` is set, every internal SDK client is constructed
   with `credentials.method === CredentialsMethod.ApiToken` and
   `credentials.config.token === <input>`.
2. When `apiToken` is omitted, `credentials` is **undefined** on every
   SDK client (RFC-003 invariant I-1: backwards compat absolute).
3. `resolvedConfig.apiToken` echoes the input so callers can confirm
   acceptance.
4. Token never appears in `console.log` / `console.error` /
   `console.warn` arguments at construction (smoke check on RFC-003 I-2).

### Edge 2 — m9s-example mock-mode + real-infra

Mock mode (default `pnpm test`):

```
 ✓ tests/openfga-permission.gate.test.ts (4 tests) [NEW]
 ✓ tests/openfga-model.test.ts (3 tests) — Wave 6.1 drift guard preserved
 ✓ tests/e2e.test.ts (8 tests)
 ✓ tests/real-infra.test.ts (3 tests, env-gated)
 ✓ tests/audit-propagation.test.ts (4 tests)
 ✓ tests/ingest-use-case.test.ts (7 tests)
 ✓ tests/search-use-case.test.ts (5 tests)
 ✓ tests/wave5-integration.test.ts (4 tests)

 Test Files  8 passed
      Tests  38 passed (was 34, +4 new gate-acceptance tests)
```

`tests/openfga-permission.gate.test.ts` covers:
1. Constructor accepts `client.apiToken: 'secret-bearer-123'` without throwing.
2. `can()` against `http://127.0.0.1:1` (unreachable) returns `false` —
   ADR-011 Amendment 2 §A2.4 fail-closed semantic preserved.
3. Constructor accepts `apiToken: undefined` (no regression on the
   unset path).
4. Constructor accepts `apiToken: ''` (composition layer maps `""` → `undefined`).

Real-infra (`pnpm test:real-infra` against live docker-compose):

```
 ✓ tests/real-infra/bullmq.test.ts (3 tests)
 ✓ tests/real-infra/openfga.test.ts (9 tests)
 ✓ tests/real-infra/pg-vector.test.ts (4 tests)

 Test Files  3 passed
      Tests  16 passed (no regression)
```

### Quality gates

- `pnpm -r --workspace-concurrency=1 run build` — clean (Sprint 3.10
  lesson: sequential to avoid DTS race on `entity-vue` ↔ `entity`).
- `pnpm --filter @gertsai-examples/m9s-example run typecheck` — 0 errors.
- `pnpm depcruise` — 0 violations (119 modules, 256 deps cruised).
- `pnpm exec oxlint examples/m9s-example/ packages/auth-openfga/ --quiet` —
  0 errors, 55 stylistic warnings only.

## Files Changed

NEW (3):
- `packages/auth-openfga/src/__tests__/client.api-token.test.ts`
- `examples/m9s-example/tests/openfga-permission.gate.test.ts`
- `.forgeplan/evidence/EVID-020-...md` (this artifact)

MODIFIED (5):
- `packages/auth-openfga/src/types.ts` — added `apiToken?: string` to
  both `FgaClientConfig` and `FgaResolvedConfig`
- `packages/auth-openfga/src/client.ts` — imported `CredentialsMethod`,
  added `SdkClientOptions` local alias, added private
  `buildSdkConfig()` helper, replaced 3 inline
  `new OpenFgaClient({ apiUrl })` instantiations in `doInitialize()`
  with `new OpenFgaClient(this.buildSdkConfig({ ... }))`,
  populated `resolvedConfig.apiToken`
- `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts`
  — removed Sprint 3.11 §P1-1 throw-on-apiToken constructor guard;
  forwarded `apiToken` to `mod.getFgaClient(...)` in the lazy-load path
- `examples/m9s-example/src/composition/infrastructure.ts` — composition
  comment update; existing `apiToken: config.FGA_API_TOKEN || undefined`
  pass-through preserved
- `KNOWN-ISSUES.md` — flipped §FGA_API_TOKEN-plumbing to RESOLVED with
  Wave 6.2 detail

## Methodology trace

OBSERVE (`forgeplan health` — healthy, 52 active artifacts) →
ROUTE (Standard, 90% confidence, pipeline = PRD → RFC) →
SHAPE (PRD-005 + RFC-003, both validated clean) →
BUILD (Edges 1+2 + KNOWN-ISSUES) →
PROVE (this evidence, CL3 supports, R_eff link to PRD-005 + RFC-003) →
SHIP (commit + PR pending CI green).

## Notes

- ADR was NOT created — Standard depth pipeline = PRD + RFC only.
  RFC-003 already documents the SDK Credentials shape decision (ApiToken
  only vs full union) under "Alternatives" §A2.
- The OpenFGA SDK pin (`@openfga/sdk@^0.8.1`) is unchanged. The
  `CredentialsMethod` enum import is the only new symbol from the SDK.
- Manual smoke against `--authn-method=preshared` was NOT run in this
  cycle (acceptance criteria AC-4 in PRD-005 marked optional). The
  unit test asserts the SDK call shape; live preshared verification can
  be added as a separate evidence pack later if needed.




