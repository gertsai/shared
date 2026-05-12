---
depth: standard
id: PRD-012
kind: prd
last_modified_at: 2026-05-12T19:22:45.578431+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-005
  relation: refines
status: active
title: 'Wave 7.5: OAuth2 ClientCredentials auth for @gertsai/auth-openfga (companion to Wave 6.2 apiToken)'
---

# PRD-012: Wave 7.5 — OAuth2 ClientCredentials auth for `@gertsai/auth-openfga`

## Problem Statement

`@gertsai/auth-openfga` currently supports two authentication paths to OpenFGA server:

1. **Anonymous** (default) — no `apiToken`, no headers (development / self-hosted with no auth)
2. **Preshared token** (Wave 6.2, EVID-020) — `apiToken: string` → SDK sends as `Bearer` header via `CredentialsMethod.ApiToken`

Production deployments commonly require **OAuth2 ClientCredentials** (RFC 6749 §4.4) — the package fetches a short-lived access token from an IdP (Auth0, Keycloak, Okta, etc.) via `client_credentials` grant, then uses the token as Bearer. Token rotation handled by IdP; refresh on expiry handled client-side.

The OpenFGA JS SDK (`@openfga/sdk@0.8.1`) **already implements** this flow natively via `CredentialsMethod.ClientCredentials` + `ClientCredentialsConfig`. The SDK's internal `Credentials` class handles token acquisition, caching (with `accessTokenExpiryDate`), and proactive refresh on every API call. Our work is **plumbing only**: expose an ergonomic `oauth2?: { clientId, clientSecret, issuer, audience }` field on `FgaClientConfig`, validate, and pass through `buildSdkConfig()` to the SDK's `ClientCredentials` config.

## Target Audience

| Persona | Description | Pain before Wave 7.5 |
|---|---|---|
| Production SaaS operator | Runs auth-openfga against managed OpenFGA (Auth0 FGA, etc.) requiring OAuth2 client-credentials | Must use the raw SDK directly or pre-fetch tokens via separate code path — bypasses our wrapper's fingerprint cache (Wave 6.3) and LRU cache (Wave 7.4) |
| Single-tenant consumer | Self-hosted OpenFGA with apiToken or no auth | No change — both prior paths preserved |
| Security auditor | Reviews auth methods for completeness | Currently sees only preshared option; OAuth2 is the production-grade choice |

## Goals

1. **G-1**: `FgaClientConfig` gains optional `oauth2?: FgaOAuth2Config` field; when set, SDK is configured with `CredentialsMethod.ClientCredentials`. Measured by integration test: SDK's `Credentials` instance has `method === 'client_credentials'`. Satisfies FR-1, FR-2.
2. **G-2**: Mutual exclusivity — `apiToken` and `oauth2` cannot both be set; ctor rejects with clear error. Measured by unit test. Satisfies FR-3.
3. **G-3**: Backwards compat — existing Wave 6.2 (apiToken) and anonymous call sites unchanged. Measured by existing 86+ auth-openfga tests pass without modification. Satisfies FR-4.
4. **G-4**: Type safety — `FgaOAuth2Config` is a public exported type, all fields readonly, EOPT-strict. Wave 7.3 canon (no widening, no `@ts-expect-error`). Satisfies FR-5.

## Functional Requirements

- FR-1: `FgaOAuth2Config` interface exported from package root with fields `{ clientId: string; clientSecret: string; issuer: string; audience: string }` — names chosen for ergonomic clarity (mapped to SDK's `apiTokenIssuer` / `apiAudience` internally).
- FR-2: `buildSdkConfig()` branches: when `this.config.oauth2` set → `credentials.method = CredentialsMethod.ClientCredentials`, `credentials.config = { clientId, clientSecret, apiTokenIssuer: oauth2.issuer, apiAudience: oauth2.audience }`. Else when `apiToken` set → existing ApiToken path (Wave 6.2 preserved). Else → no credentials.
- FR-3: `GertsFgaClient` constructor throws `Error('apiToken and oauth2 are mutually exclusive')` when both set.
- FR-4: All existing call patterns work unchanged: `getFgaClient()` no-arg, `getFgaClient({apiToken: 't'})`, `getFgaClient({apiUrl: 'u'})`.
- FR-5: Strict floor satisfied — `pnpm --filter @gertsai/auth-openfga exec tsc --noEmit` exit 0 with EOPT + noUncheckedIndexedAccess.
- FR-6: New unit + integration tests cover: oauth2 config plumbing, mutual exclusivity error, fingerprint cache key includes oauth2 fields (so distinct OAuth2 configs get distinct cached clients per Wave 6.3 invariant).
- FR-7: Workspace quality gates remain green.

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` of the merge commit restores pre-Wave-7.5 state | Manual revert smoke |
| NFR-2 | Security | `clientSecret` never logged or surfaced in error messages; fingerprint hashes it via existing SHA-256 (Wave 6.3 ADR-012 invariant I-2 preserved) | Code review + grep |
| NFR-3 | Compatibility | Wave 6.2 + Wave 6.3 + Wave 7.4 invariants all preserved | Existing tests pass |
| NFR-4 | Operational | No new dependencies (SDK already provides OAuth2 client) | `package.json` diff: 0 new deps |
| NFR-5 | DTS shape | Public type additive — `FgaClientConfig` gains optional field; no breaking change | Manual DTS diff |

## Out of Scope

- Implementing OAuth2 ourselves — SDK does it. Codified in RFC-008 §Decision-1.
- Other OAuth2 grant types (Authorization Code, Refresh Token) — only `client_credentials` is supported by OpenFGA Cloud / Auth0 FGA managed offerings. Other grants not applicable for server-to-server FGA auth.
- Custom token caching layer — SDK has its own. Our LruTtlMap (Wave 7.4) bounds the OUTER `clientInstances` Map; SDK's `Credentials` handles inner token cache per-client.
- Token rotation hooks / observability — possible follow-up (Wave 7.5.1) but not blocking.

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | SDK's internal token cache + our LruTtlMap (Wave 7.4) interaction — TTL expiry on outer cache evicts client before token expires | Low | Low | Outer cache 5-min sliding TTL; token typically valid 1h+; eviction merely triggers re-instantiation which re-acquires token = identical semantics |
| R-2 | `clientSecret` leak via `fingerprint()` cache key visible in logs | Low | High | Wave 6.3 ADR-012 I-2 already SHA-256 hashes before keying; verified by existing `client.multi-instance.test.ts` |
| R-3 | Different OAuth2 configs (different audience for same clientId) aliased in cache | Low | Medium | All 4 fields (clientId, clientSecret, issuer, audience) part of fingerprint input; distinct configs → distinct fingerprints |
| R-4 | Mutual exclusivity check forgotten by caller → silent precedence | Confirmed | Medium | Ctor throws (FR-3); reject early; clear error message |

## Strategy (high level — RFC-008 will detail)

**SDK delegation pattern**: thin plumbing layer around `@openfga/sdk`'s native ClientCredentials support. No custom auth code — the most important architectural decision documented in RFC-008.

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-005 / EVID-020 | precedes — Wave 6.2 apiToken plumbing pattern |
| ADR-012 | informs — Wave 6.3 fingerprint dispatch invariant (preserved) |
| PRD-011 / RFC-007 / EVID-026 | informs — Wave 7.4 LRU cache (outer cache, interacts with SDK's inner token cache) |
| PRD-008 | informs — Wave 7 closure parent |
| RFC-008 (next) | refines — Wave 7.5 implementation strategy |
| EVID-027 (next) | informs — Wave 7.5 ship evidence |

## Affected Files

- `packages/auth-openfga/src/types.ts` (MODIFY — add `FgaOAuth2Config` interface, extend `FgaClientConfig`)
- `packages/auth-openfga/src/index.ts` (MODIFY — re-export `FgaOAuth2Config`)
- `packages/auth-openfga/src/client.ts` (MODIFY — extend `buildSdkConfig()` + add mutual-exclusivity check in ctor)
- `packages/auth-openfga/src/util/fingerprint.ts` (MODIFY — include oauth2 fields in fingerprint input)
- `packages/auth-openfga/src/__tests__/client.oauth2.test.ts` (NEW — ~120 LOC integration tests)
- `packages/auth-openfga/src/__tests__/client.multi-instance.test.ts` (extend — oauth2 fingerprint coverage)

## Acceptance Gate

PRD satisfied when all 4 goals (G-1..G-4) measured PASS, all 7 FRs verified, all 5 NFRs spot-checked, EVID-027 records the new test count + smoke runs.





