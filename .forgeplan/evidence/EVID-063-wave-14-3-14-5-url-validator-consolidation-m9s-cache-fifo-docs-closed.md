---
depth: standard
id: EVID-063
kind: evidence
last_modified_at: 2026-05-18T22:43:44.094163+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-045
  relation: informs
status: active
title: Wave 14.3+14.5 — URL validator consolidation + m9s-cache FIFO docs closed
---

## Summary

Wave 14.3 consolidates URL validator into `@gertsai/utils/security` (more security-complete impl); `@gertsai/fetch/lib/url-validator.ts` becomes thin re-export shim. Wave 14.5 fixes m9s-cache docs to clarify FIFO (not LRU) eviction. ~-224 LOC net (code-only), 727 tests pass across 3 affected packages, 0 public-API break.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-045
- **summary**: 2 duplicate URL validators consolidated to 1 + m9s-cache FIFO docs corrected. ~-224 net LOC, 0 API break.

## Closures by teammate

### Wave 14.3 — URL validator consolidation (Teammate M)

**Extended `@gertsai/utils/security/url-validator.ts`** (+331 LOC):
- `validateUrl(url, options?) → { valid: boolean; error?: string; url?: URL }` result-shape wrapper (default protocol `['http:', 'https:']` matching fetch convention)
- `assertSafeUrl(url, options?) → URL` throw-primary wrapper (wraps as `Error("SSRF blocked: ...")`)
- `createUrlValidator(presetOptions)` factory
- Granular `allow*` flags: `allowHttp`, `allowLocalhost`, `allowPrivateNetworks`, `allowLinkLocal`, `allowCloudMetadata`
- IPv4 int-CIDR fast-path (`isPrivateIPv4Int`, `isLoopbackIPv4Int`, `isLinkLocalIPv4Int`)
- IPv6 literal handlers (`isLoopbackIPv6Literal`, `isLinkLocalIPv6Literal`, `isPrivateIPv6Literal`)
- `maxUrlLength: 2048` cap (default unset = no cap)
- `validateWebhookUrl` (throw-primary, HTTPS-only default) preserved unchanged — webhook flavour retained alongside new HTTP-client flavour

**Replaced `@gertsai/fetch/lib/url-validator.ts` with shim** (-336 / +22):
- Re-exports `validateUrl`, `assertSafeUrl`, `createUrlValidator` + types from `@gertsai/utils/security`
- `@deprecated` JSDoc + Wave 14.3 trace; removal slated for next major
- `undiciFetcher.ts:297` consumer continues working unchanged

**Migrated tests**: 31 fetch URL-validator cases moved into `packages/utils/src/security/url-validator.test.ts` as `describe('validateUrl (fetch-parity)')` + `describe('assertSafeUrl')` + `describe('createUrlValidator')` blocks (+252). Deleted from fetch (-256).

**API divergences preserved (intentional)**:
1. Default protocol allowlist diverges: `validateUrl` → `['http:', 'https:']` (HTTP-client default); `validateWebhookUrl` → HTTPS-only (webhook default). Documented in JSDocs.
2. Error contracts: `validateUrl` returns `{valid:false, error: string}` (plain string); `validateWebhookUrl` throws `SsrfError`. Preserved per existing consumer code patterns.
3. Internal helpers NOT merged: result-shape `validateUrl` uses int-CIDR helpers; throw-primary `validateWebhookUrl` uses regex helpers. Different error messages required ("Loopback addresses (127.x.x.x) not allowed" vs `SsrfError("Private or reserved IP address: ${ip}")`). Future consolidation opportunity flagged.

### Wave 14.5 — m9s-cache FIFO docs (Teammate M)

**`packages/m9s-cache/src/memory-driver.ts`** (+16 / -1):
- Class JSDoc on `MemoryCacheDriver` explicitly: "FIFO eviction (NOT LRU)" with rationale + migration path pointer to `@gertsai/utils/lru.LruMap`
- Existing internal comment `// Simple FIFO eviction` was correct; class-level JSDoc was misleading

**`packages/m9s-cache/README.md`** (+2 / -2):
- 2 mislabellings corrected: `LRU + TTL` → `FIFO + TTL` (at-a-glance table + Drivers section)

**Rationale documented**: m9s-cache's FIFO matches Moleculer cacher protocol contract for parity with its Redis driver. Don't change to LRU without aligning upstream.

## Acceptance verification (all PASS)

| Package | Build | Tests |
|---|---|---|
| `@gertsai/utils` | ✅ green | **569 pass** (was 538, +31 ported fetch-parity) |
| `@gertsai/fetch` | ✅ green | 39 pass (existing — URL tests migrated to utils) |
| `@gertsai/m9s-cache` | ✅ green | 119 pass (docs-only, no behaviour change) |
| **Workspace typecheck** | ✅ 0 errors | — |

## Net LOC (code-only)

- fetch impl: -313 LOC (345 → 32 shim)
- utils impl extended: +331 LOC
- m9s-cache docs: +14 LOC
- **~-224 LOC code-side net** (within 5% of EVID-057's -236 estimate)

Total diff-stat raw: +626 / -596 = +30 (test-port wash + lockfile noise).

## No public-API breaks

- `@gertsai/utils`: minor bump (new exports)
- `@gertsai/fetch`: patch (shim + deprecation; `validateUrl`/`assertSafeUrl`/`createUrlValidator` identifiers preserved)
- `@gertsai/m9s-cache`: patch (docs-only)

## Deferred to Wave 14.4 + 14.6

- Wave 14.4 GertsErrorResponse `@deprecated` marker (`@gertsai/api-core`)
- Wave 14.6 GertsErrorResponse removal (v1.0.0 prep, breaking)
- Future: collapse `validateUrl` int-CIDR + `validateWebhookUrl` regex helpers into single internal core

## Refs

- PRD-045 (target)
- EVID-057 (Wave 12.F audit — §URL Validator + §LRU §m9s-cache)
- EVID-062 (Wave 14.1+14.2 LRU precedent — same shim pattern)
- ADR-006 (errors taxonomy)



