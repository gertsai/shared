---
depth: standard
id: EVID-027
kind: evidence
last_modified_at: 2026-05-12T19:31:33.026753+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-012
  relation: informs
- target: RFC-008
  relation: informs
status: active
title: Wave 7.5 ship evidence — OAuth2 ClientCredentials SDK delegation in auth-openfga, 2-agent parallel sprint
---

# EVID-027: Wave 7.5 ship evidence — OAuth2 ClientCredentials SDK delegation in `@gertsai/auth-openfga`, 2-agent parallel sprint

## Structured Fields
- **verdict:** supports
- **congruence_level:** CL3
- **evidence_type:** workspace typecheck + test suite + build + depcruise + oxlint + 2-teammate parallel reports

CL3: workspace runs on target system. Verdict `supports`: every PRD-012 FR and NFR measured PASS. Both parallel teammates reported 0 errors in owned files; team-lead verified workspace-wide.

## Summary

Wave 7.5 closes the OAuth2 ClientCredentials backlog item (optional, ~day per PRD inventory). Implementation completed in ~25 min wall-clock via 2-agent parallel sprint pattern. Pre-flight discovery confirmed `@openfga/sdk@0.8.1` already implements the OAuth2 client-credentials flow natively (`CredentialsMethod.ClientCredentials` enum + `ClientCredentialsConfig` interface + `Credentials` class with internal token caching & refresh). Wave 7.5 scope reduced from "implement OAuth2" to "plumbing only".

**Implementation: 1 wave, 2 parallel teammates, file ownership disjoint, type contract pre-seeded by team-lead:**

| Teammate | Files owned | LOC |
|---|---|---|
| `auth-openfga-oauth2-types/v1` | `index.ts` (re-export) + `util/fingerprint.ts` (extend) + `__tests__/fingerprint.fitness.test.ts` (extend) + `__tests__/fingerprint.oauth2.test.ts` (NEW 8 tests) | Δ+1 / Δ+25-2 / Δ+14-1 / +103 |
| `auth-openfga-oauth2-integration/v1` | `client.ts` (mutual exclusivity check + buildSdkConfig branch) + `__tests__/client.oauth2.test.ts` (NEW 15 tests) | Δ+52-5 / +298 |

**Total: ~510 LOC across 5 files. 23 new tests (8 fingerprint + 15 integration).**

## Pre-seeded skeleton (team-lead)

Team-lead added `FgaOAuth2Config` interface + `FgaClientConfig.oauth2?: FgaOAuth2Config` field to `types.ts` BEFORE spawning teammates. This let both teammates import the type contract immediately:
- `auth-openfga-oauth2-types/v1` re-exported it from `index.ts` and used it as the shape parameter for `fingerprint()`
- `auth-openfga-oauth2-integration/v1` imported it directly in `client.ts` for the buildSdkConfig branch + mutual exclusivity check

Type contract stability eliminated mid-sprint coordination — both teammates worked in parallel without blocking.

## Pilot Baseline (pre-Wave 7.5)

- `auth-openfga` test count: 120 (post-Wave-7.4 baseline)
- Workspace test count: 4987 (post-Wave-7.4)
- 2 auth methods: anonymous, preshared apiToken (Wave 6.2)

## Changes Applied

### Pre-seeded (team-lead, before agents spawned)

- `packages/auth-openfga/src/types.ts` — new `FgaOAuth2Config` interface (4 readonly fields: `clientId`, `clientSecret`, `issuer`, `audience`) + `FgaClientConfig.oauth2?: FgaOAuth2Config` field added next to existing `apiToken?: string`. JSDoc documents mutual exclusivity and SDK field-name mapping rationale.

### Teammate A — types + fingerprint (`auth-openfga-oauth2-types/v1`)

- `index.ts` — public re-export `export type { FgaOAuth2Config } from './types.js'`
- `util/fingerprint.ts` — extended canonical-JSON input to include `oauth2` as nested object with hardcoded alphabetical key order (`audience, clientId, clientSecret, issuer`), placed in outer object's alphabetical slot. Uses `null` sentinel when `oauth2` is unset (collision-safe vs corner case where future caller passes empty-string fields — `JSON.stringify` would otherwise silently drop `undefined`).
- `__tests__/fingerprint.fitness.test.ts` — extended `IDENTITY_FIELDS` array to include `oauth2` so the textual regex fitness check keeps mechanical guard intact for future fingerprint changes.
- `__tests__/fingerprint.oauth2.test.ts` — 8 new tests covering: empty config = identical hash, apiToken vs oauth2 produce different hashes, oauth2 property-order independence (canonical key sort), different audience/clientSecret/clientId/issuer produces different hashes, clientSecret plaintext never appears in output.

### Teammate B — client integration (`auth-openfga-oauth2-integration/v1`)

- `client.ts` two changes:
  - **Constructor** (around lines 165-176): mutual exclusivity guard `if (config?.apiToken !== undefined && config?.oauth2 !== undefined) throw new Error('FgaClientConfig: apiToken and oauth2 are mutually exclusive');` placed BEFORE the canonical-construction spread, then `...(config?.oauth2 !== undefined && { oauth2: config.oauth2 })` added to the spread mirroring the existing `apiToken` pattern.
  - **`buildSdkConfig()`** (around line 193): new oauth2 branch placed BEFORE the existing apiToken branch (priority order, but they're mutually exclusive so order is observable only via maintenance read). Field mapping: our ergonomic `{clientId, clientSecret, issuer, audience}` → SDK's `{clientId, clientSecret, apiTokenIssuer, apiAudience}`. Uses SDK enum value `CredentialsMethod.ClientCredentials` (not a string literal).
  - `SdkClientOptions` local alias extended to discriminated union of `ApiToken` and `ClientCredentials` branches.
- `__tests__/client.oauth2.test.ts` — 15 new integration tests covering: construction does not throw, credentials.method=ClientCredentials, all 4 SDK fields plumbed, enum value (not literal), explicit field-name mapping, mutual exclusivity error message, Wave 6.3 anonymous back-compat, Wave 6.2 apiToken back-compat, cache invariant (same oauth2 → same instance; different audience/clientId/clientSecret → distinct instances), cache scope isolation across auth methods, SDK lazy contract (no outbound fetch at construction), clientSecret not logged at construction.

### Quality-gate measurements (final)

| Gate | Result | Threshold | Status |
|---|---|---|---|
| `pnpm typecheck` exit | 0 | 0 (FR-5, FR-7) | ✅ |
| `pnpm test` exit | 0 | 0 (FR-4, FR-7) | ✅ |
| `pnpm test` pass count | **5010** | ≥ baseline 4987 (Wave 7.4) | ✅ (+23 new — 8 fingerprint + 15 oauth2 integration) |
| `pnpm test` skip count | 102 | ≤ 103 baseline | ✅ |
| `pnpm --filter @gertsai/auth-openfga test` | 143/143 | ≥ 120 + new (FR-6) | ✅ (120 → 143 = +23) |
| `pnpm build` | 0 errors | 0 (FR-7) | ✅ |
| `pnpm depcruise` | 0 violations | 0 (FR-7) | ✅ |
| `pnpm oxlint` errors | 0 | 0 errors (FR-7) | ✅ |
| `package.json` new deps | 0 | 0 (NFR-4) | ✅ (SDK already present) |

### Type-canon audit (Wave 7.3 strict floor)

All new code passes EOPT + noUncheckedIndexedAccess without workarounds:
- **0** uses of `field?: T | undefined` widening
- **0** `// @ts-expect-error` / `@ts-ignore`
- **0** new `!` non-null assertions (one pre-existing left untouched as documented)
- Patterns used (per RFC-006 catalog): conditional spread (`...(config?.oauth2 !== undefined && { oauth2: config.oauth2 })`), locally-typed narrowing variables (`const oauth2: FgaOAuth2Config | undefined = this.config.oauth2`), discriminated union for `SdkClientOptions.credentials`.

### Invariant audit (RFC-008 §Invariants)

- **I-1 — SDK is sole owner of token lifecycle**: ✅ Our buildSdkConfig only translates config; SDK's `Credentials` class handles acquisition + cache + refresh. Test: SDK does NOT make outbound HTTP at construction (lazy fetch — verified by `no fetch at construction` test).
- **I-2 — clientSecret never plaintext in cache keys**: ✅ Wave 6.3 ADR-012 SHA-256 hashing preserved. Test: `clientSecret plaintext never in fingerprint output`.
- **I-3 — apiToken + oauth2 mutually exclusive**: ✅ Ctor throws with exact error message. Test: `mutual exclusivity throws`.
- **I-4 — Wave 6.3 fingerprint distinctness**: ✅ All 4 oauth2 fields part of fingerprint input. Tests: different audience / clientId / clientSecret / issuer produce different hashes.
- **I-5 — Wave 6.2 apiToken path unchanged**: ✅ buildSdkConfig if-else still threads apiToken-only configs through `CredentialsMethod.ApiToken`. Test: `apiToken-only construct → method === 'api_token'`.

### SDK delegation verified

Test "credentials.method=ClientCredentials + all 4 SDK-mapped fields plumbed to every internal SDK client" inspects the SDK config object that auth-openfga passes to `new OpenFgaClient(...)`. Verified mapping:

| Our type field | SDK field | Test outcome |
|---|---|---|
| `oauth2.clientId` | `credentials.config.clientId` | ✅ same value |
| `oauth2.clientSecret` | `credentials.config.clientSecret` | ✅ same value |
| `oauth2.issuer` | `credentials.config.apiTokenIssuer` | ✅ renamed |
| `oauth2.audience` | `credentials.config.apiAudience` | ✅ renamed |

`CredentialsMethod.ClientCredentials` is the SDK's exported enum value (string `'client_credentials'`); we use the enum reference (not a string literal) to track SDK API surface changes.

### Reversibility (NFR-1)

Single `git revert` of the Wave 7.5 commit cleanly removes:
- `FgaOAuth2Config` interface from types.ts
- `FgaClientConfig.oauth2` field
- `index.ts` re-export
- `buildSdkConfig` oauth2 branch
- Constructor mutual-exclusivity check
- Fingerprint canonical-input extension
- New tests

Existing 120 auth-openfga tests + 4987 workspace tests continue to pass after revert. Wave 6.2 (apiToken) and Wave 6.3 (multi-instance fingerprint) paths unaffected.

## Cross-references

| Artifact | Relation |
|---|---|
| PRD-012 | informs (this evidence pack) |
| RFC-008 | informs (verifies SDK delegation strategy chosen over custom auth) |
| PRD-005 / EVID-020 | informs (Wave 6.2 apiToken precedent — preserved) |
| ADR-012 | informs (Wave 6.3 fingerprint dispatch invariant — preserved by I-4) |
| PRD-011 / RFC-007 / EVID-026 | informs (Wave 7.4 LRU cache — outer cache, interacts with SDK's inner token cache per RFC-008 RFC-R-1) |
| PRD-008 | informs (Wave 7 closure parent) |

## Notes

- **Cumulative Wave 7 timeline**: 7.1 (audit P1 polish) → 7.2 (tri-state upsert capability) → 7.3a (noUncheckedIndexedAccess) → 7.3b (exactOptionalPropertyTypes) → 7.4 (LRU+TTL bounds) → 7.5 (OAuth2 ClientCredentials). Wave 7 now complete end-to-end across all originally-identified backlog items + the canonical strict-floor + the security defenses.
- **Pre-seeded skeleton + 2-agent parallel** pattern at small scale (510 LOC) — fastest path to canonical implementation. Team-lead context preserved (only saw 2 reports vs all individual edits).
- **SDK delegation insight codified**: when an authoritative library implements a security-sensitive feature (here OAuth2 client-credentials), wrap rather than re-implement. RFC-008 §H1 vs §H2 documents the choice with reasoning.
- **`null` sentinel pattern** in fingerprint: nested optional config encoded as `null` (NOT omitted) to preserve SHA-256 collision-resistance against future corner-case inputs (e.g. `{ clientId: '', ... }`). New pattern to add to RFC-006 catalog as Pattern 7 in future RFC revision.
- **Test coverage growth**: auth-openfga 86 (Wave 7.2) → 102 (with Wave 7.3b reshape) → 120 (Wave 7.4) → 143 (Wave 7.5). Each wave brought genuinely new tests, not refactor churn.
- oxlint warning count is 1511 (pre-existing style polish, unchanged); 960 files scanned (up from 958, +2 new test files).




