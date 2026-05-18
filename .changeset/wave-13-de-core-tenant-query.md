---
'@gertsai/core': minor
---

Wave 13.D+E — close 14 MEDIUM/LOW findings from EVID-059 across tenant-config + session + query + agent domains.

**Wave 13.D — Teammate O (tenant-config + session polish)**:

- **FR-D-1** (M, `tenant-config.ts:1492`): Zod `chunkingStrategy` enum now includes `'hierarchical'` matching the TS union 1:1.
- **FR-D-2** (M, `types.ts:316-321`): `createGraphRAGSettings` factory now clamps `maxHops ∈ [1,5]`, `topK ∈ [1,100]`, `communityLevel ∈ [0,3]` matching `isGraphRAGSettings` ranges. Non-finite inputs fall back to defaults.
- **FR-D-3** (M, `tenant-config.ts:2478`): Renamed `calculateConfigHash` → `configCacheKey` to disclaim cryptographic intent (FNV-like fold used for cache invalidation only). `calculateConfigHash` preserved as `@deprecated` alias for back-compat.
- **FR-D-4** (M, `tenant-config.ts:2578`): `sanitizeTenantConfig` rewritten as allowlist via `pickAllowlist(source, KEYS)` helper. Three allowlists (`SAFE_LLM_KEYS`, `SAFE_EMBEDDING_KEYS`, `SAFE_RERANKER_KEYS`) `satisfies ReadonlyArray<keyof Sanitized*Config>` so TS catches type drift. Future sensitive fields excluded by default.
- **FR-D-5** (L, `tenant-config.ts:2245,2248,2371,2375,2380`): 5 `DEFAULT_TENANT_CONFIG.agentReasoning!` non-null assertions removed. Extracted `DEFAULT_AGENT_REASONING` as top-level export; merge sites use `?? DEFAULT_AGENT_REASONING` fallback.
- **FR-D-6** (M, `session-context.ts:301`): `throwIfAborted` 3-branch normaliser — Error instances rethrown as-is; undefined/null wrapped in `new Error('Session aborted')`; other non-Error values coerced via `String(reason)`. Downstream `e instanceof Error` always narrows.
- **FR-D-7** (M, `session-context.ts:365`): `fromJSON` adds new exported `isSerializedSessionContext` guard performing JSON-friendly shape check (avoids `isRequestMeta` which requires Date instance post-`JSON.parse`). Throws typed `TypeError` with clear message on mismatch.

**Wave 13.E — Teammate P (query + agent type-system tightening)**:

- **FR-E-1** (M, `executor.ts:328,338,352,362` + `router.ts:203`): Replaced `IQueryExecutor<any, any>` with new exported `AnyQueryExecutor = IQueryExecutor<QueryRequest, unknown, unknown>` alias. Callers who got `any` back now get `unknown` — forces narrowing at use site (desired invariant). No consumer breakage; alias re-exported from `query/index.ts`.
- **FR-E-2** (M, `types.ts:querySuccess/queryPartial`): `confidence` clamped `[0,1]` via `Math.max(0, Math.min(1, ...))` + `Number.isFinite` guard. `durationMs >= 0` floor. `queryFailure` has no such fields per interface — no-op as designed (flagged in EVID-059 audit as PRD misread).
- **FR-E-3** (M, `registry.ts:511-516` + 4 sibling factories): Spread-after-literal pattern fixed across `createNLQuery/createGraphQuery/createVectorQuery/createRAGQuery`. `...options` now first; discriminator + required fields second. Hostile caller passing `options.type = 'graph'` to `createNLQuery` now correctly gets `type: 'nl'`.
- **FR-E-4** (L, `router.ts:101-105`): `LATENCY_ORDER = Object.freeze({fast:0, medium:1, slow:2})` hoisted to module const (avoids per-comparator allocation in routing hot paths).
- **FR-E-5** (L, `router.ts:386-396`): `asTool()` now returns typed `QueryRouterAsTool { name, description, router }` interface (re-exported from `query/index.ts`). Consumers can `tool.router` / `tool.name` without casts.
- **FR-E-6** (M+L, `agent.ts:85,153`): `run(input: string | unknown, ...)` → `run(input: unknown, ...)` (decorative `string |` removed). JSDoc on `tools?: readonly ITool[]` explains `readonly` only freezes array shell, not element fields.

**Tests**: 61 new regression tests across `wave-13-d-fixes.test.ts` (31), `query.test.ts` (28 new), `agent.test.ts` (2 updated). Total: 1244 pass (was 1199 before Wave 13.D+E), 53 skipped, 0 fail.

**Public API additions** (warrants minor bump): `configCacheKey`, `DEFAULT_AGENT_REASONING`, `isSerializedSessionContext`, `AnyQueryExecutor`, `QueryRouterAsTool`. All additive; no removals.

**Behaviour break**: `createGraphRAGSettings` now clamps values that previously violated `isGraphRAGSettings` invariants — those outputs were already rejected downstream by the guard, so this tightens correctness without breaking valid use.

After Wave 13.A+B+C+D+E, EVID-059's 2 CRITs + 11 HIGHs + 6 LLM MED/LOW + 14 query/session/tenant-config/agent MED/LOW = **33 findings closed**.

Refs: PRD-048, EVID-059, EVID-060/061/065 (13.A/B/C precedents).
