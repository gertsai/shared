---
'@gertsai/utils': minor
'@gertsai/fetch': patch
'@gertsai/m9s-cache': patch
---

Wave 14.3+14.5 — URL validator consolidation + m9s-cache FIFO docs clarification per EVID-057.

**Wave 14.3 — URL validator consolidation (Teammate M).**

EVID-057 §URL Validator Audit identified 2 full-featured SSRF impls with disjoint APIs:
- `@gertsai/fetch/lib/url-validator.ts` (result-shape, granular `allow*` flags, IPv4 int-CIDR fast path, `maxUrlLength` cap, `createUrlValidator` factory)
- `@gertsai/utils/security/url-validator.ts` (throw-primary `validateWebhookUrl`, DNS rebinding async path, HTTPS-default, credential URL rejection, `SsrfError` typed)

**Consolidated into `@gertsai/utils/security`** (more security-complete impl). Added to that file:
- `validateUrl(url, options?) → { valid, error?, url? }` result-shape wrapper (default protocol `['http:', 'https:']` for HTTP-client parity; `validateWebhookUrl` keeps HTTPS-only default for webhook parity)
- `assertSafeUrl(url, options?) → URL` throw-primary wrapper (wraps `validateUrl` failure as `Error("SSRF blocked: ...")`)
- `createUrlValidator(presetOptions)` factory for preset configs
- Granular `allow*` flags: `allowHttp`, `allowLocalhost`, `allowPrivateNetworks`, `allowLinkLocal`, `allowCloudMetadata`
- IPv4 int-CIDR fast-path (`isPrivateIPv4Int`, `isLoopbackIPv4Int`, `isLinkLocalIPv4Int`)
- IPv6 literal handlers (`isLoopbackIPv6Literal`, `isLinkLocalIPv6Literal`, `isPrivateIPv6Literal`)
- `maxUrlLength: 2048` cap option (default unset = no cap)

`@gertsai/fetch/lib/url-validator.ts` becomes a thin shim:
```ts
export {
  validateUrl, assertSafeUrl, createUrlValidator,
  type UrlValidatorConfig, type UrlValidationResult
} from '@gertsai/utils/security';
```
Marked `@deprecated` with `@see` pointing to `@gertsai/utils/security`. 31 fetch URL-validator tests migrated to `packages/utils/src/security/url-validator.test.ts` as a `describe('validateUrl (fetch-parity)')` block; deleted from fetch package. `undiciFetcher.ts` consumer continues working unchanged via the shim.

**Wave 14.5 — m9s-cache FIFO documentation (Teammate M).**

EVID-057 §LRU Audit flagged `@gertsai/m9s-cache MemoryCacheDriver` as **FIFO not LRU** (no `get()`-side recency touch — evicts oldest by insertion order). Pre-fix docs misleadingly claimed "LRU". Fix:

- Class JSDoc on `MemoryCacheDriver` explicitly states "FIFO eviction (NOT LRU)" with rationale + migration path pointer to `@gertsai/utils/lru.LruMap`
- README: 2 mislabellings corrected (`LRU + TTL` → `FIFO + TTL` in at-a-glance table + Drivers section)
- Rationale documented: m9s-cache's FIFO matches the Moleculer cacher protocol contract for parity with its Redis driver. Don't change to LRU without aligning the upstream contract.

**Net LOC (code-only, excluding test-port wash)**:
- fetch impl: -313 LOC (345 → ~32 shim)
- utils impl extended: +331 LOC
- m9s-cache docs: +14 LOC
- **~-224 LOC net** (vs EVID-057 estimate of -236, within 5%)

**Tests**: utils 569 pass (was 538, +31 ported fetch-parity); fetch 39 pass (existing); m9s-cache 119 pass.

**No public-API breaks**: `@gertsai/utils` minor (new exports); `@gertsai/fetch` patch (shim + deprecation, `validateUrl`/`assertSafeUrl`/`createUrlValidator` identifiers preserved for `undiciFetcher`); `@gertsai/m9s-cache` patch (docs-only).

Refs: PRD-045, EVID-057 (Wave 12.F audit source), EVID-062 (Wave 14.1+14.2 LRU precedent).
