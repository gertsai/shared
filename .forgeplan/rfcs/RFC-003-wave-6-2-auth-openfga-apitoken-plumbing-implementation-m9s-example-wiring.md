---
depth: standard
id: RFC-003
kind: rfc
last_modified_at: 2026-05-07T21:25:37.215163+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Wave 6.2 — auth-openfga apiToken plumbing implementation + m9s-example wiring
---

# RFC-003 — Wave 6.2 apiToken plumbing implementation

## Summary

Concrete implementation plan for **PRD-005** (apiToken plumbing in
`@gertsai/auth-openfga`). Three ordered edges, no parallel work — small
package, single owner. Total scope: 6 files modified, 2 new test files,
1 KNOWN-ISSUES entry flipped to RESOLVED.

## Motivation

See PRD-005. TL;DR: token is silently dropped today; production deployments
on authenticated OpenFGA can't use our adapter. Sprint 3.11 §P1-1 fix
(throw on apiToken in m9s gate) was a holding pattern. This RFC is the
proper end-to-end fix.

## Proposed Direction

The change adds **one optional field** (`apiToken: string | undefined`) to
`FgaClientConfig` and forwards it as
`credentials: { method: CredentialsMethod.ApiToken, config: { token } }`
to every `new OpenFgaClient(...)` instantiation inside `GertsFgaClient`.
The field is `undefined` by default; when it is unset the credentials
branch is omitted entirely so existing call sites observe identical
behaviour.

In the consumer (`m9s-example`), the matching change is **removing** the
existing throw-on-apiToken defensive guard in `OpenFgaPermissionGate`,
because the upstream package no longer drops the value silently. The
gate forwards the token through `getFgaClient(...)`, and composition
forwards `config.FGA_API_TOKEN` from the env-driven `project.config.ts`.

The shape mirrors how the OpenFGA SDK exposes credentials: a
discriminated `CredentialsMethod` enum (`None | ApiToken | ClientCredentials`).
We model only `ApiToken` for now (per PRD-005 Non-Goals); `ClientCredentials`
remains future work as a strict superset (additive at the same field).

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ examples/m9s-example                                               │
│                                                                    │
│  project.config.ts        FGA_API_TOKEN ← process.env.FGA_API_TOKEN│
│         │                                                          │
│         ▼                                                          │
│  composition/infrastructure.ts                                     │
│    pickGate() → new OpenFgaPermissionGate({                        │
│         client: { apiUrl, storeId, apiToken } })                   │
│         │                                                          │
│         ▼                                                          │
│  src/infrastructure/openfga-permission.gate.ts                     │
│    can() → mod.getFgaClient({ apiUrl, storeId, apiToken })         │
└────────────────────────────────────────────────────────────────────┘
                          │
                          ▼ (workspace dep)
┌────────────────────────────────────────────────────────────────────┐
│ packages/auth-openfga                                              │
│                                                                    │
│  src/types.ts                                                      │
│    interface FgaClientConfig {                                     │
│      apiUrl?: string                                               │
│      storeId?: string                                              │
│      apiToken?: string   ← NEW                                     │
│      ...                                                           │
│    }                                                               │
│                                                                    │
│  src/client.ts                                                     │
│    GertsFgaClient.buildClientConfig() returns:                     │
│      { apiUrl, [storeId, authorizationModelId,                     │
│        credentials: { method: ApiToken,                            │
│                       config: { token: apiToken } }] }             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                 @openfga/sdk OpenFgaClient(credentials)
```

Module identity, no new abstractions, no new files in the package
itself — only `__tests__/client.api-token.test.ts`.

## Implementation Phases

Single sprint, three sequential edges (no parallelism — small scope,
single owner).

### Edge 1 — `@gertsai/auth-openfga` types + client

**Files**:
- `packages/auth-openfga/src/types.ts` (MODIFY)
- `packages/auth-openfga/src/client.ts` (MODIFY)
- `packages/auth-openfga/src/__tests__/client.api-token.test.ts` (NEW)

**Changes**:

1. `types.ts`:
   - Add `apiToken?: string` to `FgaClientConfig` interface
   - Add `apiToken?: string` to `FgaResolvedConfig` interface

2. `client.ts`:
   - Import `CredentialsMethod` from `@openfga/sdk`
   - In `GertsFgaClient` constructor, copy `apiToken` from input config
     into `this.config.apiToken`
   - Helper `private buildClientConfig(): ConstructorParameters<typeof OpenFgaClient>[0]`
     that returns base `{ apiUrl }` + conditionally adds
     `credentials: { method: CredentialsMethod.ApiToken, config: { token: this.config.apiToken } }`
     when `this.config.apiToken` is set
   - Replace 3 inline `new OpenFgaClient({ apiUrl: ... })` sites in
     `doInitialize()` with calls that spread `buildClientConfig()` first
   - In `resolvedConfig` populate `apiToken: this.config.apiToken`

3. New unit test (NEW):
   - Mock `@openfga/sdk` `OpenFgaClient` constructor via `vi.mock`
   - Assert that when `apiToken` is in the config, the SDK was called
     with `credentials.method === 'api_token'` and
     `credentials.config.token === '<expected>'`
   - Assert that when `apiToken` is omitted, `credentials` is omitted
     entirely (preserves NFR-2 backwards compat)

**Risk**: SDK Credentials shape change between minor versions. Mitigation:
SDK pinned `^0.8.1`; the unit test would catch a shape regression.

### Edge 2 — m9s-example `OpenFgaPermissionGate` accepts apiToken

**Files**:
- `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` (MODIFY)
- `examples/m9s-example/src/composition/infrastructure.ts` (MODIFY)
- `examples/m9s-example/tests/openfga-permission.gate.test.ts` (NEW)

**Changes**:

1. `openfga-permission.gate.ts`:
   - Remove the throw-on-apiToken constructor guard (Sprint 3.11 §P1-1
     defensive measure — no longer needed)
   - Pass `apiToken` through to `mod.getFgaClient({ apiUrl, storeId, apiToken })`
   - Update header docstring: "apiToken is now plumbed end-to-end via
     @gertsai/auth-openfga ≥ <next minor version>"

2. `composition/infrastructure.ts`:
   - In `pickGate()`, when constructing `OpenFgaPermissionGate`, include
     `apiToken: config.FGA_API_TOKEN || undefined` in the `client` option

3. New unit test:
   - Construct gate with `client.apiToken: 'secret123'` — must NOT throw
   - Assert subsequent `can()` failure path still fails-closed (returns
     `false`) so we don't regress §A2.4

### Edge 3 — KNOWN-ISSUES + EVID + activation

**Files**:
- `KNOWN-ISSUES.md` (MODIFY)
- `.forgeplan/evidence/EVID-020-...md` (NEW via MCP)
- `.forgeplan/state/EVID-020.yaml`

**Changes**:

1. KNOWN-ISSUES.md: flip §FGA_API_TOKEN-plumbing entry to ~~strikethrough~~
   + "RESOLVED in Wave 6.2 (PR <#>)"
2. EVID-020 (CL3 supports): structured fields + R_eff link to PRD-005,
   RFC-003
3. `forgeplan_activate` PRD-005, RFC-003, EVID-020

## Cross-Edge Contracts

- Edge 1 MUST be merged + a new minor version of `@gertsai/auth-openfga`
  is **NOT** required for the m9s-example update because they live in the
  same workspace (pnpm `workspace:*`). m9s-example will pick up the new
  field at the next install.
- Edge 2 depends on Edge 1's type change in `FgaClientConfig.apiToken`.
- Edge 3 depends on Edge 1 + Edge 2 being green.

## Invariants

- **I-1 — Backwards compat absolute.** Every existing call to
  `getFgaClient({ apiUrl, storeId })` (no `apiToken`) MUST behave
  exactly as before. The credentials branch is gated on
  `if (this.config.apiToken)`. Verified by unit test E1.3.b.
- **I-2 — Token never logged.** No `console.log` / `logger.error`
  argument MAY contain `this.config.apiToken` or any substring of it.
  Existing `maskResourceId` covers logged resources; tokens are simply
  not added to any log argument anywhere on the new code path.
- **I-3 — Fail-closed on any token-related error.** If the SDK rejects
  the bearer (401), the gate's existing try/catch returns `false` —
  same as for any other SDK error per ADR-011 I-4. The new credentials
  config does NOT introduce a new throw path outside the catch.
- **I-4 — Singleton semantics preserved.** Existing `getFgaClient(config)`
  caches the FIRST non-empty config. Adding `apiToken` to a config that
  was already initialized **without** a token does NOT rebind the
  singleton — same behaviour as the existing `apiUrl`/`storeId` fields.
  Production multi-token isolation remains
  KNOWN-ISSUES §FGA-singleton-multi-store (out of scope for this RFC).

## Alternatives

A1. **Drop the gate's `apiToken` field entirely** and require operators to
    plumb credentials via `getFgaClient({ ... })` directly before
    constructing the gate. Rejected: violates separation of concerns —
    gate is the per-deployment configuration boundary; tokens belong
    there alongside `apiUrl`/`storeId`.
A2. **Add ClientCredentials (OAuth2) at the same time.** Rejected: out
    of scope per PRD-005 Non-Goals; ApiToken covers the
    `--authn-method=preshared` path that m9s-example documents and is
    the most common production pattern. Add OAuth2 in a separate ADR if
    asked.
A3. **Read `FGA_API_TOKEN` from `process.env` inside `GertsFgaClient`
    directly.** Rejected: violates 12-factor — config must be passed
    explicitly; reading env inside a library couples it to deployment
    shape and makes tests harder.

## Compatibility

- **Backwards** — no consumer breaking change. New field is `string |
  undefined`, defaults to undefined, omitted from SDK call when unset.
- **Forwards** — adding `clientCredentials` later is additive (a discriminated
  union or a separate `auth?: { kind: 'apiToken' | 'clientCredentials', ... }`
  field can layer on top without breaking apiToken users).

## Rollback Plan

If Edge 1 lands and a downstream regression appears (SDK Credentials
shape mismatch, or tests pass but live OpenFGA rejects the token):

1. Revert the `client.ts` change via `git revert <sha>` — types.ts
   field is harmless to leave (optional, unused) but can be reverted
   too in the same revert commit.
2. m9s-example's gate still has `apiToken` in `OpenFgaPermissionGateOptions`
   — re-add the throw-on-apiToken guard from Sprint 3.11 §P1-1 in the
   same revert commit so callers don't silently get the dropped-token
   behaviour back.
3. KNOWN-ISSUES §FGA_API_TOKEN-plumbing returns to "open".

The revert is mechanical because Edge 1 is contained to a single
package and the diff is small (~30 lines).

## Drawbacks

- More surface area in `@gertsai/auth-openfga` (1 field, mostly cosmetic).
- Test added that mocks `@openfga/sdk` — couples test to SDK constructor
  signature. Acceptable risk per Risk R-1 in PRD-005.

## Unresolved Questions

(none — explicit)

## References

- PRD-005 — Wave 6.2 apiToken plumbing requirements (this RFC implements it)
- KNOWN-ISSUES §FGA_API_TOKEN-plumbing
- Sprint 3.11 Post-Build Track 2 §P1-1
- OpenFGA SDK `Credentials` types
  (`@openfga/sdk@0.8.1/dist/credentials/types.d.ts`)



