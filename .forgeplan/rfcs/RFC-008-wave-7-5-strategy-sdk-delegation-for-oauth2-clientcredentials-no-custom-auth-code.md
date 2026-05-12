---
depth: standard
id: RFC-008
kind: rfc
last_modified_at: 2026-05-12T19:23:31.768257+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-012
  relation: refines
status: active
title: 'Wave 7.5 strategy: SDK delegation for OAuth2 ClientCredentials (no custom auth code)'
---

# RFC-008: Wave 7.5 strategy — SDK delegation for OAuth2 ClientCredentials

## Summary

Add `oauth2?: FgaOAuth2Config` field to `FgaClientConfig` as a thin plumbing layer around `@openfga/sdk`'s native `CredentialsMethod.ClientCredentials`. The SDK already implements token acquisition (POST to `{issuer}/oauth/token` with `client_credentials` grant), caching (internal `accessToken` + `accessTokenExpiryDate`), and proactive refresh (on every API call before token expiry). Our work is exclusively config translation: map ergonomic `{ clientId, clientSecret, issuer, audience }` to SDK's `ClientCredentialsConfig` shape `{ clientId, clientSecret, apiTokenIssuer, apiAudience }`. No custom auth code.

## Motivation

PRD-012 documents the production requirement (OAuth2 client-credentials for Auth0 FGA, Okta, Keycloak, etc.). Three implementation candidates:

- **H1 — SDK delegation**: route to `@openfga/sdk@0.8.1`'s native `Credentials` class via `CredentialsMethod.ClientCredentials`. Zero custom auth code. ~50 LOC plumbing + ~120 LOC tests.
- **H2 — Custom token acquirer**: implement OAuth2 client-credentials grant ourselves (POST to token endpoint, cache token, refresh on expiry). ~200 LOC + ~250 LOC tests. Adds attack surface; duplicates SDK functionality.
- **H3 — Thin wrapper around `axios` / `fetch`**: middle-ground — own the token cache but defer HTTP to a shared client. Pragmatic but unnecessary given H1 viability.

We choose **H1**. Reasoning:

1. **SDK has shipped this feature** — `@openfga/sdk@0.8.1` exports `CredentialsMethod.ClientCredentials` + `ClientCredentialsConfig` + a working `Credentials` class with `getAccessTokenHeader()` / `refreshAccessToken()`. Re-implementing duplicates code, multiplies bugs.
2. **Security boundary** — auth code is high-risk; using SDK-validated implementation reduces our review burden and aligns with the SDK's threat model.
3. **Token storage** — SDK caches token in-memory inside its `Credentials` instance (per-client); our outer LruTtlMap (Wave 7.4) bounds the population of clients. Two-layer cache works correctly: outer LRU evicts → next call re-instantiates client → SDK fetches fresh token. No interaction bug.
4. **Maintenance** — SDK upstream tracks OAuth2 spec changes; we get them for free.

## Proposed Direction

### Decision

1. **Public type** in `packages/auth-openfga/src/types.ts`:
   ```ts
   export interface FgaOAuth2Config {
     readonly clientId: string;
     readonly clientSecret: string;
     /** OAuth2 token issuer URL (e.g. https://your-tenant.auth0.com). */
     readonly issuer: string;
     /** OAuth2 audience claim (typically the FGA API URL). */
     readonly audience: string;
   }

   export interface FgaClientConfig {
     // ... existing fields ...
     /** Wave 7.5: OAuth2 client-credentials flow. Mutually exclusive with apiToken. */
     readonly oauth2?: FgaOAuth2Config;
   }
   ```

2. **Mutual exclusivity check** in `GertsFgaClient` constructor (before any other config validation):
   ```ts
   if (config?.apiToken !== undefined && config?.oauth2 !== undefined) {
     throw new Error('FgaClientConfig: apiToken and oauth2 are mutually exclusive');
   }
   ```

3. **`buildSdkConfig` branch** in `client.ts`:
   ```ts
   if (this.config.oauth2) {
     opts.credentials = {
       method: CredentialsMethod.ClientCredentials,
       config: {
         clientId: this.config.oauth2.clientId,
         clientSecret: this.config.oauth2.clientSecret,
         apiTokenIssuer: this.config.oauth2.issuer,
         apiAudience: this.config.oauth2.audience,
       },
     };
   } else if (this.config.apiToken) {
     // Wave 6.2 — preserved
     opts.credentials = { method: CredentialsMethod.ApiToken, config: { token: this.config.apiToken } };
   }
   // else: no credentials (Wave 6.3 anonymous path)
   ```

4. **Fingerprint update** in `util/fingerprint.ts`: include all four oauth2 fields in canonical input. Existing SHA-256 hashing preserves NFR-2 (no plaintext secret in cache key per ADR-012 I-2).

5. **Public re-export** of `FgaOAuth2Config` from `packages/auth-openfga/src/index.ts`.

6. **Tests** in `__tests__/client.oauth2.test.ts` (NEW):
   - oauth2 config plumbing: construct client with oauth2 → inspect SDK config → method === 'client_credentials', config fields mapped correctly
   - mutual exclusivity: `new GertsFgaClient({apiToken, oauth2})` throws expected error
   - fingerprint distinguishes oauth2 configs: same clientId+secret different audience → different cache keys
   - back-compat: apiToken-only config still uses `ApiToken` method
   - back-compat: no-credentials config produces no `credentials` key in SDK opts
   - SDK does NOT make outbound HTTP at construction (lazy — token fetched on first API call)

### Implementation Order (single wave, 2 parallel teammates)

Pre-seed: team-lead adds `FgaOAuth2Config` stub to `types.ts` so both teammates can import the type immediately.

| Teammate | Files (OWN) | LOC |
|---|---|---|
| `auth-openfga-oauth2-types` | `types.ts` (extend) + `index.ts` (re-export) + `util/fingerprint.ts` (extend) + `__tests__/fingerprint.oauth2.test.ts` (NEW) | ~30 + ~5 + ~15 + ~60 |
| `auth-openfga-oauth2-integration` | `client.ts` (extend ctor + buildSdkConfig) + `__tests__/client.oauth2.test.ts` (NEW) | ~30 + ~120 |

File boundary clean. Total ~260 LOC.

## Invariants

- **I-1**: SDK is the sole owner of OAuth2 token lifecycle (acquisition, caching, refresh). Our package only translates config. If SDK changes its auth model, we update only `buildSdkConfig`.
- **I-2**: ADR-012 I-2 preserved — `clientSecret` never appears in cache keys as plaintext (SHA-256 hash via `fingerprint()`).
- **I-3**: apiToken + oauth2 mutually exclusive — ctor rejects, no silent precedence.
- **I-4**: Wave 6.3 multi-instance scoping preserved — distinct oauth2 configs get distinct cached clients (fingerprint includes all 4 oauth2 fields).
- **I-5**: Wave 6.2 apiToken path unchanged — single behavioural diff is the new oauth2 branch.

## Acceptance Test (per PRD-012 FRs)

- FR-1, FR-5 — `FgaOAuth2Config` exported, tsc 0 errors workspace
- FR-2 — integration test: SDK config has `method: 'client_credentials'` + correctly mapped sub-fields
- FR-3 — unit test: ctor throws on `{apiToken, oauth2}`
- FR-4 — existing 86 + 34 (Wave 7.4) auth-openfga tests pass unchanged
- FR-6 — new tests: oauth2 plumbing, mutual exclusivity, fingerprint distinctness, lazy token fetch
- FR-7 — `pnpm typecheck && pnpm test && pnpm build && pnpm depcruise && pnpm oxlint` all green

## Alternatives Considered

| Alt | Rejection reason |
|---|---|
| H2 — Custom token acquirer | Duplicates SDK; security risk; ~5× LOC; maintenance burden |
| H3 — Thin wrapper around fetch | Middle ground; no clear gain over H1; complexity for testability we don't need |
| Drop OAuth2 entirely | Production deployments require it (Auth0 FGA, etc.); blocking real consumers |
| Defer to Wave 8+ | Backlog item flagged as ~day; SDK delegation makes it ~hours; no reason to defer |

## Rollback Plan

- **Tactical revert**: single `git revert` of merge commit removes `oauth2` field + ctor check + buildSdkConfig branch + fingerprint extension. apiToken path (Wave 6.2) returns to sole non-anonymous auth.
- **Partial revert**: if oauth2 logic has bugs but apiToken users want to keep the flag in `FgaClientConfig`, type can remain as documentation while ctor rejects oauth2 with "not implemented" — not recommended; full revert cleaner.

## Risks (delta vs PRD-012)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | SDK token cache misses our LruTtlMap bounds — SDK's per-Credentials token cache is unbounded by count (only by TTL from IdP) | Acceptable: SDK caches ONE token per client instance; outer LruTtlMap bounds the client population. Token cache scales with `min(LRU bound, distinct configs)` — already bounded |
| RFC-R-2 | OpenFGA SDK breaking change in 1.x | Wave 8+ — out of scope here; pin SDK version in package.json (already pinned) |
| RFC-R-3 | `apiAudience` semantic — SDK uses for both Auth0 (audience claim) and other IdPs (resource indicator); ergonomic `audience` rename obscures this | Documented in JSDoc on `FgaOAuth2Config.audience` |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-012 | refines (RFC-008 is the strategy detail for PRD-012) |
| PRD-005 | informs (Wave 6.2 apiToken precedent) |
| ADR-012 | informs (Wave 6.3 fingerprint dispatch invariant — preserved by I-4) |
| RFC-006 | informs (Wave 7.3 strict-floor canonical patterns) |
| RFC-007 | informs (Wave 7.4 outer LruTtlMap — interacts with SDK's inner token cache per RFC-R-1) |




