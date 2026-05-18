---
depth: standard
id: PRD-045
kind: prd
last_modified_at: 2026-05-18T22:34:27.608596+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 14.3+14.5 — URL validator consolidation + m9s-cache FIFO docs rename
---

## Problem Statement

EVID-057 §URL Validator Audit surfaced 2 full-featured SSRF impls with disjoint APIs: `@gertsai/fetch` (result-shape, granular allow flags, IPv4 int-CIDR) and `@gertsai/utils/security` (throw-primary `validateWebhookUrl`, DNS rebinding async path, HTTPS-default). Both block same network ranges; only `@gertsai/fetch` has a self-consumer (`undiciFetcher`); `@gertsai/utils` is greenfield.

EVID-057 also flagged `@gertsai/m9s-cache MemoryCacheDriver` as **mislabelled FIFO not LRU** — no `get()`-side recency touch, evicts oldest by insertion order via `keys().next().value`. Docs need clarification.

## Goals

1. Wave 14.3 — Consolidate URL validator into `@gertsai/utils/security` (more security-complete: DNS rebinding + credential rejection + HTTPS-default).
2. Port `@gertsai/fetch`'s features (granular `allow*` flags, `maxUrlLength`, IPv4 int-CIDR, result-shape `validateUrl` wrapper) into `@gertsai/utils/security`.
3. Replace `@gertsai/fetch/lib/url-validator.ts` body with thin shim re-exporting from `@gertsai/utils`.
4. Mark `@gertsai/fetch validateUrl` `@deprecated` for v0.3.0 removal.
5. Wave 14.5 — Update `@gertsai/m9s-cache MemoryCacheDriver` README/JSDoc to clarify FIFO semantics (not LRU).

## Functional Requirements

**FR-001** — `@gertsai/utils/security` extends `validateWebhookUrl` (or adds new `validateUrl` wrapper) accepting `{ allowHttp, allowLocalhost, allowPrivateNetworks, allowLinkLocal, allowCloudMetadata, maxUrlLength }` options. Returns result-shape `{ valid, error?, url? }` per fetch convention. Throw-primary `validateWebhookUrl` unchanged.

**FR-002** — `@gertsai/utils/security` adds IPv4 int-CIDR fast-path for `inCidr` checks (currently regex; port from fetch).

**FR-003** — `@gertsai/fetch/lib/url-validator.ts` becomes a re-export shim. `undiciFetcher.ts:297` consumer continues working unchanged. Test suite for fetch URL validator continues passing (or migrates to utils).

**FR-004** — `@gertsai/fetch validateUrl` + `assertSafeUrl` marked `@deprecated` with `@see` pointing to `@gertsai/utils/security`.

**FR-005** — `@gertsai/m9s-cache MemoryCacheDriver` JSDoc + README explicitly state "FIFO eviction (not LRU)" with rationale + migration path to LRU if needed.

## Non-Functional Requirements

**NFR-001** — Build green: all touched packages + dependent packages compile + test successfully.
**NFR-002** — Net LOC: ~-236 LOC per EVID-057 estimate.
**NFR-003** — Zero public-API breaks. `@gertsai/utils` minor (new exports + extended options); `@gertsai/fetch` patch (shim + deprecation); `@gertsai/m9s-cache` patch (docs).

## Out of Scope

- Wave 14.4 GertsErrorResponse @deprecated (separate PR)
- Wave 14.6 GertsErrorResponse removal (v1.0.0)
- Promoting `@gertsai/core LRUCache` heavyweight option docs (separate)

## Related Artifacts

- EVID-057 (Wave 12.F audit — §URL Validator + §LRU §m9s-cache notes)
- EVID-062 (Wave 14.1+14.2 LRU consolidation precedent — same shim pattern)
- PRD-044 (Wave 14.1+14.2 LRU precedent)

## Target Audience

- Maintainers of `@gertsai/utils`, `@gertsai/fetch`, `@gertsai/m9s-cache`
- Application consumers of `validateUrl` / `validateWebhookUrl` (undiciFetcher + any future SSRF-validating callers)



