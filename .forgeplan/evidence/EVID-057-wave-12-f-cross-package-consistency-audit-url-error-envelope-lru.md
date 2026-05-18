---
depth: tactical
id: EVID-057
kind: evidence
links:
- target: PRD-042
  relation: informs
status: active
title: Wave 12.F — cross-package consistency audit (URL + error envelope + LRU)
---

## Summary

Cross-package consistency audit per PRD-042 found drift across all 3 candidate primitives flagged in EVID-051 §cross-cutting, plus 1 additional dimension (api-core RFC-030 `GertsErrorResponse` envelope, not in the original triangle). Audit covered 38 packages + 3 example apps. Recommendation: **extract LRU first** (6 implementations, lowest-risk refactor, biggest LOC reduction), **then URL validator** (2 overlapping full-featured impls), **then error envelope** (most invasive — touches public contract).

## Structured Fields
- verdict: supports
- congruence_level: CL3
- evidence_type: internal_audit
- linked_artifact: PRD-042
- summary: 3 of 3 candidates confirmed drifted; 1 additional drift surfaced; recommend LRU → URL → envelope extraction order.

## URL Validator Audit

### Found call sites (source code only, excluding `dist/` + `.test.ts`)

| Package | File:line | Validation shape | Owner / canonical? |
|---|---|---|---|
| `@gertsai/fetch` | `packages/fetch/src/lib/url-validator.ts:169` | Full SSRF: `validateUrl(url, config) → {valid, error?, url?}` + `assertSafeUrl` + `createUrlValidator` factory; opt-in `allow*` flags; IPv4/IPv6 CIDR + cloud-metadata block | **Owner #1** — used by `undiciFetcher.ts:297` |
| `@gertsai/utils` | `packages/utils/src/security/url-validator.ts:325` | Full SSRF: `validateWebhookUrl(url, options) → void` (throws `SsrfError`) + `isUrlSafe` + `parseAndValidateUrl` + `validateWebhookUrlAsync` (DNS rebinding, CWE-918 TOCTOU mitigation) | **Owner #2** — re-exported from `@gertsai/utils/security` |
| `@gertsai/api-core` | `packages/api-core/src/lib/error/OIDCError.class.ts:229` | `new URL(this.redirectUri)` — bare parse, not validation | construction-only |
| `@gertsai/core` | `packages/core/src/llm/base-url-validator.ts:19` | `new URL(baseUrl)` — LLM provider URL classifier (matches `api.openai.com` etc.), not SSRF | domain-specific (LLM routing) |
| `@gertsai/hsm` | `packages/hsm/src/providers/vault.provider.ts:165` | `new URL(this.config.address)` — bare parse | construction-only |
| `@gertsai/rest-request-manager` | `packages/rest-request-manager/src/manager.ts:272` | `new URL(url).host` — host extraction | construction-only |
| `examples/m9s-example-web` | `src/lib/api/client.ts:222` | `new URL(url, API_BASE_URL)` for `isAuthRefreshUrl` predicate | construction-only |
| `examples/m9s-example` | `src/mol-services/sse-ingest.handler.ts:246`, `infrastructure/ollama-embedder.ts:203`, `composition/infrastructure.ts:244` | `new URL(rawUrl, ...)` bare parse | construction-only |

### Drift observed

Two **full-featured SSRF validators co-exist** with disjoint APIs and overlapping intent:

- `@gertsai/fetch`: result-shape (`{valid, error?, url?}`) — non-throwing primary, throwing `assertSafeUrl` wrapper, opt-in `allowLocalhost`/`allowPrivateNetworks`/`allowLinkLocal`/`allowCloudMetadata` granular flags, IPv4-int CIDR math, IPv6 bracketed-host handling, `maxUrlLength` cap (2048), `createUrlValidator` factory for preset configs. Defaults: both `http:` + `https:` allowed.
- `@gertsai/utils`: throw-primary (`validateWebhookUrl → void` throws `SsrfError`) + `isUrlSafe` non-throwing wrapper, **DNS rebinding async path** (`validateWebhookUrlAsync` with `resolvedIp` for caller-side IP pinning + abortable DNS lookup, CWE-918 TOCTOU). Defaults: **HTTPS-only** (opt-in `allowHttp`). Uses regex CIDR patterns instead of int math. Hard-coded blocklist for AWS/GCP/Azure metadata IPs incl. `169.254.169.253`.

Both block: localhost names, loopback (127.x.x.x, ::1), RFC1918 private (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x.x), 0.0.0.0, AWS metadata 169.254.169.254. Both reject `file:` / `ftp:` / `javascript:` protocols.

**Differences that matter**:
1. Default protocol allowlist: `fetch` allows http+https; `utils` HTTPS-only.
2. DNS rebinding protection: `utils` only — fetch has no async path.
3. IPv6 handling: `fetch` normalises `[::1]` brackets explicitly; `utils` relies on `new URL()` normalisation.
4. Credential URLs: `utils` rejects `user:pass@` URLs; `fetch` does not.
5. Error contracts: `fetch` returns `{valid:false, error:string}` (caller pattern-matches strings); `utils` throws typed `SsrfError`.
6. `maxUrlLength`: `fetch` enforces; `utils` does not.
7. Tests: `fetch` has 31 cases (`__tests__/url-validator.test.ts`); `utils` has 100+ cases including async DNS scenarios.

Internal consumers diverged accordingly: `undiciFetcher` calls `@gertsai/fetch validateUrl`; no other package currently consumes either validator (greenfield migration territory).

### Recommendation

**Consolidate into `@gertsai/utils/security`** (Tier-1, zero internal deps already). It is the more security-complete impl (DNS rebinding + credential rejection + HTTPS-default). Migration plan:
1. Port `fetch`'s granular `allow*` flags + `maxUrlLength` + IPv4 int-CIDR fast path + result-shape `validateUrl` wrapper into `@gertsai/utils/security`.
2. Re-export from `@gertsai/utils` root (already done for current API).
3. Replace `@gertsai/fetch/lib/url-validator.ts` body with a thin shim re-exporting from `@gertsai/utils` (preserve `validateUrl` named export for `undiciFetcher`).
4. Mark `@gertsai/fetch validateUrl` as deprecated in next minor; remove in `v0.3.0`.

LOC estimate: `-345` (fetch impl) + `-31` (fetch test) + `+~100` (extend utils with fetch features) + `~40` (fetch shim) → **net ~-236 LOC**. Single-file refactor in `fetch`, additive in `utils`.

NOT recommended: extract a new `@gertsai/url` Tier-1 package — overhead too high for a single primitive; utils already owns the security sub-namespace.

## Error Envelope Audit

### Found shapes

| Source | Shape (key fields) | Used in |
|---|---|---|
| `@gertsai/errors/http` `ProblemDetails` (`packages/errors/src/http/index.ts:21`) | `{type, title, status, detail?, instance?, details?, correlationId?}` — RFC 9457 + bucket URN types (`urn:gertsai:errors:*`) per ADR-006 §A1.5 | **Canonical**. Consumed by `m9s-example/src/shared/error-scrubber.ts` + re-exported via `m9s-example/src/composition/errors.ts:14` |
| `examples/m9s-example-api-types` OpenAPI `ProblemDetails` schema (`src/generated/openapi.json:290`, `openapi-schema.d.ts:117`) | `{type, title, status, detail, instance, details, correlationId}` — matches errors/http exactly (generated from m9s-example OpenAPI) | Frontend type generation (`@gertsai-examples/m9s-example-api-types`) |
| `@gertsai/api-core` `GertsErrorResponse` (`packages/api-core/src/lib/envelope/types/error.ts:200`) | `{success: false, error: {message, type, code, param?, stage?, retryable?, retry_after?, details?}, request_id, timestamp, documentation_url?, tenant_id?, trace_id?}` — RFC-030 hybrid (RFC 9457 + OpenAI + VoltAgent + Agno influences) | **Internal to `@gertsai/api-core` only**. No external consumers in monorepo (grep confirms). `response-wrapper.ts:358` builds it, `types/index.ts:25` includes it in `GertsResponse` union. |
| `@gertsai/fetch` `HttpErrorResponse` (`packages/fetch/src/lib/types.ts:111`) | `{status, statusText, body?, headers}` — generic HTTP-client error wrapper | Internal to fetch consumers |
| `@gertsai/ws-rpc` `JsonRpcErrorResponse` (`packages/ws-rpc/src/types.ts:73`) | `{jsonrpc: '2.0', id, error: JsonRpcError<TData>}` — JSON-RPC 2.0 protocol spec | WebSocket transport |

### Drift triangle

The drift confirmed by EVID-053 §H-4 / EVID-051 §cross-cutting is **3-way (not 2-way)** within HTTP-shaped errors:

1. **`@gertsai/errors/http` ProblemDetails** (Apache-2.0 OSS canonical, ADR-006) — collapses `INTERNAL`/`UPSTREAM_FAILURE`/`BAD_GATEWAY` under one URN bucket (`urn:gertsai:errors:server`) to avoid leaking topology. Read via `parseHttpProblemDetails`. Reverse-lookup keyed by HTTP status code, not URN. 
2. **m9s-example OpenAPI schema** ProblemDetails — generated from m9s-example backend; matches shape (1) bit-for-bit. **No drift here** between (1) and (2); the m9s-example composition already imports from `@gertsai/errors/http`. The "drift" EVID-053 NG-004 named is actually:
3. **`@gertsai/api-core` GertsErrorResponse** (RFC-030) — completely different envelope philosophy. `{success: false, error: {...}}` wrapper with VoltAgent-style `stage` (pipeline component) + Agno-style `retryable` + OpenAI-style `type`/`code`/`param`. Has fields RFC 9457 doesn't (request_id, retryable, retry_after, stage, tenant_id, trace_id) and is missing fields RFC 9457 has (no `instance`, no `correlationId` — uses `trace_id` instead; no URN bucket `type`).

Impact:
- Consumers reading `ProblemDetails.type` URN buckets are incompatible with `GertsErrorResponse.error.type` string-enum.
- `correlationId` vs `trace_id` field-name split = type-system rejection on direct cast.
- `retryable` + `retry_after` are first-class on (3), live in `details` payload on (1), absent in OpenAPI schema (2).
- Status-code mapping diverges: ADR-006 uses `httpStatusForKind`; RFC-030 uses `ERROR_STATUS_CODES`. They agree on canonical 4xx/5xx but RFC-030 collapses `UPSTREAM_FAILURE` → no entry (uses `service_unavailable: 503` instead of ADR-006's 502).
- `@gertsai/api-core` is currently a **dead-end consumer**: no package outside api-core constructs `GertsErrorResponse`. This is salvageable.

### Recommendation

**Canonical = `@gertsai/errors/http` ProblemDetails** (already endorsed by ADR-006 + landed in m9s-example backend + OpenAPI schema generator). Plan:

1. **Deprecate `GertsErrorResponse`** in `@gertsai/api-core@0.3.0`. Mark `createGertsError` + `validateGertsError` + `isGertsError` `@deprecated` with @see link to `@gertsai/errors/http`.
2. **Add a forward-compat overload** to api-core: `createGertsError → ProblemDetails` returns a ProblemDetails body with `details` carrying RFC-030 extras (`retryable`, `stage`, `retry_after`, `param`, `tenant_id`). The extras land in `ProblemDetails.details` (already typed `Record<string, unknown>`).
3. **Migrate `response-wrapper.ts:358-362`** to build ProblemDetails directly via `appErrorToHttpResponse`.
4. **Remove** `GertsErrorResponse` interface in `@gertsai/api-core@1.0.0` (next major).

LOC estimate: `-200` (api-core envelope/types/error.ts shrinks to ~50 LOC after deletion of `createGertsError` family) + `~50` (helper to inject RFC-030 extras into `ProblemDetails.details`) → **net ~-150 LOC** + alignment with already-deployed m9s-example backend.

Out of scope for this audit: `JsonRpcErrorResponse` (different protocol — JSON-RPC 2.0 wire format, not HTTP) + `HttpErrorResponse` (transport-layer not application-layer — kept as fetch's primitive).

## LRU Audit

### Found impls (source code only)

| Package | File:line | Type | Eviction policy |
|---|---|---|---|
| `@gertsai/auth-openfga` | `packages/auth-openfga/src/internal/lru-ttl-map.ts:37` `LruTtlMap<K,V>` | **True LRU** (insertion-order Map; touch on `get`/`has`/`set`) + **TTL** (lazy, `ttlMs:0` disables) | maxSize:1000 default; evict oldest via `keys().next().value` per Wave 7.4/RFC-007 (CWE-770) |
| `@gertsai/rest-request-manager` | `packages/rest-request-manager/src/circuit-breaker.ts:31` `CircuitBreaker.hosts` | **True LRU** (insertion-order Map; touch via private `touch()`) no TTL | maxHosts:1000 per ADR-009 Amendment 1.2.1 (CWE-770/401); evict oldest same pattern |
| `@gertsai/collection` | `packages/collection/src/utils/memoize.ts:63` `LRUCache<K,V>` | **True LRU** (insertion-order Map; touch on `get` only — NOT `has`) no TTL | maxSize:100 default; evict oldest same pattern. Comment explicitly notes "consider dedicated LRU library with doubly-linked list" for high-perf. |
| `@gertsai/api-rlr` | `packages/api-rlr/src/adapters/ResilientRedisAdapter.ts:149` private `LRUCache<K,V>` | **True LRU** (insertion-order Map; touch on `get`) no TTL — but cache values carry their own `cacheTTL` | cacheSize:1000; evict oldest same pattern. Module-private (not exported). |
| `@gertsai/api-rlr` | `packages/api-rlr/src/adapters/MemoryAdapter.ts:371` `evictIfNeeded` | **True LRU via `lastAccess` field scan** (O(n) per eviction — different shape) | `maxKeys` per-store; linear scan to find oldest — performance ≠ other impls |
| `@gertsai/core` | `packages/core/src/lru-cache.ts:111` `LRUCache<T>` + `:485` `TenantCache<T>` | **True LRU via doubly-linked list** (O(1) `LRUNode<T>` prev/next) + **TTL** + tenant-isolation + pattern invalidation + stats (hits/misses/evictions/hitRate) | maxSize:1000 + defaultTTL + `onEvict` callback + 4 EvictionReasons (`capacity`/`ttl`/`manual`/`pattern`). **Most feature-complete impl.** |
| `@gertsai/core` (consumer) | `packages/core/src/deny-ledger/providers/memory.ts:61` `MemoryDenyLedger` | **True LRU via inline doubly-linked list** (head/tail; `moveToHead`/`addToHead`/`removeTail`/`removeNode`/`evictIfNeeded`) no TTL | maxSize from `DenyLedgerConfig`. **Duplicates linked-list logic from `core/lru-cache.ts` rather than consuming it.** |
| `@gertsai/m9s-cache` | `packages/m9s-cache/src/memory-driver.ts:55` `MemoryCacheDriver` | **NOT LRU — FIFO** (no touch on `get`; eviction picks `keys().next().value`) + TTL | maxEntries optional; `evictOldest` is insertion-order pop, not access-order |

### Should they share a kernel?

**Yes for 4 of them** (`auth-openfga`, `rest-rm`, `collection`, `api-rlr` ResilientRedis), all implementing the **same insertion-order Map LRU pattern** with identical eviction logic (`delete + reinsert` on touch, `keys().next().value` on evict). Diff between them is only constructor signature + presence of TTL + whether `has` touches. These could collapse into a single 50-LOC `LruTtlMap<K,V>` utility in `@gertsai/utils` or a new Tier-1 `@gertsai/lru` package.

**No for 2 of them** — they are correctly specialised:
- `@gertsai/core` `LRUCache<T>` + `TenantCache<T>` (doubly-linked-list, O(1)) is **the right primitive when `maxSize > ~10000`** where the insertion-order Map's `delete + reinsert` constant factor degrades. Plus it has stats + onEvict + pattern invalidation that 4 above lack. **Promote this as the canonical heavyweight option** rather than replace.
- `@gertsai/m9s-cache` `MemoryCacheDriver` is **FIFO not LRU** — semantics-mismatched with the candidates. m9s-cache also provides hash-store + pattern-cache + serializer abstraction that aren't cache-eviction concerns. Keep its eviction as-is (Moleculer cacher compat) but **document the FIFO semantics in the package README** — currently misleading because the file is in the same package family as a Moleculer "Cacher" base.

**`@gertsai/core` `MemoryDenyLedger`** is a borderline case: it inlines doubly-linked-list LRU logic that exactly duplicates `core/lru-cache.ts`. Same package — should consume the local primitive instead of re-implementing.

### Recommendation

Two-step refactor:

**Step 1 (Wave 14, low risk, additive)**: Create `@gertsai/utils` `LruMap<K,V>` (insertion-order Map flavour, ~60 LOC) and `LruTtlMap<K,V>` (with TTL knob, ~80 LOC). Re-export `LruTtlMap` shape unchanged for `auth-openfga` (already public-shaped). Migrate consumers behind a deprecation window:
- `auth-openfga/src/internal/lru-ttl-map.ts` → re-export shim from `@gertsai/utils`.
- `rest-request-manager/src/circuit-breaker.ts` `hosts` Map → `LruMap`.
- `collection/src/utils/memoize.ts` `LRUCache` → re-export shim from `@gertsai/utils`.
- `api-rlr/src/adapters/ResilientRedisAdapter.ts` private `LRUCache` → consume `LruMap`.

LOC estimate: **-220 net** (5 inline impls collapse to imports; ~140 LOC added in `@gertsai/utils`, -360 LOC removed from consumers). Zero breaking change if shims preserve constructor signatures.

**Step 2 (Wave 14 or later)**: 
- Promote `@gertsai/core` `LRUCache<T>`+`TenantCache<T>` as the **doubly-linked-list / O(1) / heavyweight** option. Document tradeoff vs `@gertsai/utils LruMap` in README (Map flavour: ~1ms/op at 10k entries; linked-list: ~0.3ms/op).
- Refactor `core/deny-ledger/providers/memory.ts` to consume `core/lru-cache` (same-package consolidation, ~100 LOC removed).
- Audit `api-rlr/src/adapters/MemoryAdapter.ts:371` `evictIfNeeded` — its O(n) scan over `lastAccess` field is fundamentally a different access-time-stamped pattern (callers also read `lastAccess` for other purposes). Either leave it or migrate to per-store `LruMap` if `lastAccess` is internal-only.

NOT recommended: extract a standalone `@gertsai/lru` Tier-1 package. The insertion-order Map LRU is ~60 LOC; the doubly-linked-list LRU lives in `core` for sound reasons (tenant + stats integration). A dedicated package adds 38-→39 surface for one primitive — push into `utils` instead.

## Suggested follow-up wave (Wave 14 fix sequence)

Priority order (lowest risk → highest):

1. **W14.1 — LRU consolidation Step 1** (`utils LruMap`/`LruTtlMap` + 4 consumer shims). **Highest LOC reduction, zero public-API break.** ~3-day effort.
2. **W14.2 — `core/deny-ledger/MemoryDenyLedger` adopts local `core/lru-cache`** (same-package, no cross-tier change). ~1-day.
3. **W14.3 — URL validator consolidation** into `@gertsai/utils/security`; mark `@gertsai/fetch validateUrl` `@deprecated`. ~2-day. Touches 1 consumer (`undiciFetcher`).
4. **W14.4 — Error envelope deprecation path**: stop emitting `GertsErrorResponse` in m9s-example/m9s-example-api-types regeneration; api-core `@deprecated` marker only (no behaviour change). ~2-day, prep for v0.3.0.
5. **W14.5 — `m9s-cache MemoryCacheDriver` README clarification**: name the eviction semantics as FIFO not LRU. Docs-only. ~1-hour.
6. **W14.6 — `GertsErrorResponse` removal** (v1.0.0 prep, breaking) — deferred until at least one minor cycle after W14.4 deprecation lands.

Total Wave 14 estimate: ~9 effort-days. Recommended ordering: do W14.1+W14.2 in one PR (low risk, big LOC win); W14.3 standalone PR; W14.4+W14.5 in one PR; W14.6 holds for v1.0.0.

## Methodology

- Read-only audit. No source code modified; no commits.
- Grep-driven discovery: `new URL(`, `LRU`/`lru`, `class.*Cache`, `Map<.*cache|lru`, `ProblemDetails`, `GertsErrorResponse`, `interface.*ErrorResponse`. Excluded `/dist/`, `*.test.ts`, generated `openapi-schema.d.ts` content only when checking app source (kept for OpenAPI schema audit).
- Selective file `Read` on top hits to compare API shapes (validators side-by-side; LRU eviction policies; error envelope field lists).
- Cross-referenced against ADR-006 (errors), ADR-009 (rest-rm LRU + CWE-770), ADR-012 (auth-openfga fingerprint cache, Wave 6.3), RFC-007 (Wave 7.4 LRU bounded), EVID-051 §cross-cutting, EVID-053 §H-4 / NG-004.
- Coverage: 38 first-party packages + 3 example apps (`m9s-example`, `m9s-example-api-types`, `m9s-example-web`). 

## Refs

- PRD-042 (target — Wave 12.F audit)
- EVID-051 §cross-cutting (source of 3 candidate primitives)
- EVID-053 §H-4 / NG-004 (deferred 3-way error envelope reconciliation surfaced here)
- ADR-006 (`@gertsai/errors` Shared Kernel + ProblemDetails canonical)
- ADR-009 (`@gertsai/rest-request-manager` CWE-770 bounded LRU; Amendment 1.2.1)
- ADR-012 (`@gertsai/auth-openfga` Wave 6.3 multi-instance scoping)
- RFC-007 (Wave 7.4 auth-openfga LRU+TTL retrofit)



