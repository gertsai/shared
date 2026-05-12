---
depth: standard
id: PRD-005
kind: prd
last_modified_at: 2026-05-07T21:23:45.652024+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Wave 6.2 — Plumb apiToken through @gertsai/auth-openfga to OpenFGA SDK ApiToken credentials
---

# PRD-005 — Plumb apiToken through @gertsai/auth-openfga (Wave 6.2)

## Context

Closes Sprint 3.11 Post-Build Track 2 §P1-1 / KNOWN-ISSUES §FGA_API_TOKEN-plumbing.

The current `@gertsai/auth-openfga` package (v0.1.0) does NOT forward bearer
tokens to the underlying `@openfga/sdk` client. `FgaClientConfig` only has
`apiUrl`, `storeId`, `authorizationModelId`, `timeout`, `retry` — no
`apiToken` field. As a defensive measure, m9s-example's
`OpenFgaPermissionGate` throws on construction when `client.apiToken` is
supplied (Sprint 3.11 §P1-1 fix), but this is a workaround. Production
deployments using token-authenticated OpenFGA cannot use the gate at all.

## Target Audience

- **Backend service authors** consuming `@gertsai/auth-openfga` — they
  receive a single new optional field `apiToken` that wires straight
  through to the upstream OpenFGA SDK; no migration required for
  existing call sites.
- **Platform/SRE engineers** running production OpenFGA with bearer
  authentication (`--authn-method=preshared`) — they can finally point
  m9s-example (and other consumers) at a hardened deployment by setting
  `FGA_API_TOKEN`.
- **Security reviewers** auditing the m9s-example reference application —
  they get a closed P1 finding (token previously accepted-but-dropped
  without warning) replaced with end-to-end plumbing + a fail-closed
  guard removed.

## Problem

Operators running `OpenFGA` with `--authn-method=preshared` (or any
auth-enforcing deployment) cannot configure a token via our package. Users
who try to set `FGA_API_TOKEN` in m9s-example today see the gate throw
on boot. The result: m9s-example must run against an unauthenticated
OpenFGA instance, which is acceptable for the demo but blocks any real
production rollout that uses our `@gertsai/auth-openfga` adapter.

## Goals

1. Add `apiToken?: string` to `FgaClientConfig` (additive, non-breaking).
2. When set, `GertsFgaClient` constructs `OpenFgaClient` with
   `credentials: { method: ApiToken, config: { token } }`.
3. Remove the throw-on-apiToken guard from `OpenFgaPermissionGate` —
   tokens are now plumbed end-to-end (validates FR-5).
4. Verify token reaches the SDK via a unit test (mock `OpenFgaClient`,
   assert credentials are passed) — covers FR-4.
5. Update m9s-example composition to forward `FGA_API_TOKEN` env var
   (FR-6 — already declared in `project.config.ts`).
6. Mark KNOWN-ISSUES §FGA_API_TOKEN-plumbing RESOLVED.

## Non-Goals

- OAuth2 `client_credentials` flow (`ClientCredentialsConfig`) — separate
  follow-up if needed; not required by m9s-example or known consumers.
- Token rotation / refresh — bearer is read once at construction; rotation
  via `resetFgaClient()` + `getFgaClient(...)` is sufficient for v1.
- Multi-tenant token isolation — that's
  KNOWN-ISSUES §FGA-singleton-multi-store, separate Wave 6+ work.
- Encrypting tokens at rest in process memory — out of scope; tokens are
  already in `process.env`.

## Functional Requirements

- [ ] FR-1. `FgaClientConfig.apiToken?: string` — added, optional, no default.
- [ ] FR-2. `FgaResolvedConfig.apiToken?: string` — added so callers can
      confirm the token was accepted (NOT for logging — see Security below).
- [ ] FR-3. `GertsFgaClient` constructor copies `apiToken` from config
      (passes through to all internal `OpenFgaClient` instantiations).
- [ ] FR-4. When `apiToken` is set, every `new OpenFgaClient(...)` call uses
      `credentials: { method: 'api_token' as CredentialsMethod, config: { token } }`.
      When unset, `credentials` is omitted (preserves current behaviour).
      Verified by Goal 4 unit test.
- [ ] FR-5. `OpenFgaPermissionGate` constructor in m9s-example accepts
      `client.apiToken` without throwing; passes it through to
      `getFgaClient({ apiUrl, storeId, apiToken })`. Closes the
      Goal 3 / §P1-1 throw guard.
- [ ] FR-6. Composition root forwards `config.FGA_API_TOKEN` (already in
      `project.config.ts`) to the gate. Closes Goal 5 wiring.

## Non-Functional Requirements

NFR-1. **Security** — token MUST NOT appear in any log line or error
       message. Existing `maskResourceId` pattern in
       `OpenFgaPermissionGate` already covers resource ids; add a guard
       so token never enters `console.error` arguments.
NFR-2. **Backwards compat** — every existing call site that does NOT pass
       `apiToken` MUST continue to work unchanged. The credentials
       branch is gated on `if (apiToken)` only.
NFR-3. **Type safety** — `apiToken` is `string | undefined` in the
       interface; the SDK call uses an explicit `if (config.apiToken)`
       narrowing.
NFR-4. **Observability** — when `apiToken` is set, `GertsFgaClient`
       SHOULD log "OpenFGA client configured with bearer token" once
       at construction (no token value), at debug level. Optional.

## Acceptance Criteria

AC-1. `pnpm --filter @gertsai/auth-openfga test` — all existing tests
      pass + new unit test asserts apiToken plumbed to mocked SDK call.
AC-2. `pnpm --filter @gertsai-examples/m9s-example test` — existing
      tests pass + new test asserts gate accepts apiToken (no throw).
AC-3. `pnpm --filter @gertsai-examples/m9s-example test:real-infra` —
      existing 16/16 still pass against current docker-compose stack.
AC-4. (Manual demo, optional for PR) — start OpenFGA with
      `--authn-method=preshared --authn-preshared-keys=secret123`,
      bootstrap with `FGA_API_TOKEN=secret123`, run smoke test —
      anonymous calls fail 401, authenticated calls succeed.
AC-5. KNOWN-ISSUES.md §FGA_API_TOKEN-plumbing marked RESOLVED.

## Risks

R-1. SDK Credentials shape change between minor versions — mitigated
     by SDK pinning `^0.8.1` and existing test that calls a mocked
     `OpenFgaClient` constructor and asserts credentials shape.
R-2. Token leaked to logs via SDK error response — mitigate by
     wrapping `OpenFgaPermissionGate.can()` errors with the existing
     fail-closed catch + masked logging.

## Out-of-Scope

- ClientCredentials (OAuth2) flow — separate ADR if requested.
- Token caching / refresh — token is read once at gate construction.
- Server-side token validation — that's the OpenFGA server's job.

## Related Artifacts

- **EVID-019** — Sprint 3.11 production-grade m9s-example reference
  application (active, CL3 supports). §P1-1 in that audit is the
  driver for this PRD.
- **ADR-011** — Sprint 3.11 m9s-example storage / authorization /
  async / lint / migration choices (active). Decision B2 (OpenFGA
  ReBAC), I-12 (fail-closed gate selection), Amendment 2 §A2.4
  (gate fail-closed semantics) — all preserved by Wave 6.2.
- **ADR-012** (to be created in this cycle) — concrete OpenFGA SDK
  Credentials shape decision (`ApiToken` only vs full `Credentials`
  union with `ClientCredentials`).
- **RFC-003** (to be created in this cycle) — m9s-example wiring +
  rollout sequencing for the apiToken plumbing change.
- **KNOWN-ISSUES.md §FGA_API_TOKEN-plumbing** — the entry this PRD
  closes; will be flipped to RESOLVED on activation.

Refs: Sprint 3.11 Post-Build Track 2 §P1-1, KNOWN-ISSUES §FGA_API_TOKEN-plumbing




