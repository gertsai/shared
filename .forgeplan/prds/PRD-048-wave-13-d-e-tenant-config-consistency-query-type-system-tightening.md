---
depth: standard
id: PRD-048
kind: prd
last_modified_at: 2026-05-18T23:28:44.365438+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 13.D+E — tenant-config consistency + query type-system tightening
---

## Problem Statement

EVID-059's remaining 8 MED + 8 LOW findings cluster into 2 disjoint domains: tenant-config consistency (Zod/TS/factory drift) + query type-system tightening (`any` leak in IQueryExecutor + session/agent polish).

## Goals

**Wave 13.D — tenant-config + session polish (Teammate O)**:
- Reconcile `chunkingStrategy` Zod enum ↔ TS type drift (Zod missing 'hierarchical')
- Reconcile `GraphRAGSettings.maxHops` factory ↔ type-guard drift (factory unclamped vs guard enforced)
- Rename `calculateConfigHash` → `configCacheKey` (disclaims cryptographic intent)
- Replace `sanitizeTenantConfig` blocklist → allowlist via `Pick`
- Remove `DEFAULT_TENANT_CONFIG.agentReasoning!` non-null assertions (5 sites)
- Session: `throw signal.reason || ...` wrap non-Error values; `fromJSON` schema-check before deserialize

**Wave 13.E — query type-system tightening (Teammate P)**:
- Replace `IQueryExecutor<any, any>` with proper generics in `executor.ts` helpers + `router.ts` storage
- `queryPartial` clamps progress; querySuccess/Failure don't validate duration/confidence — add input hygiene
- Spread-after-literal in 4 query/registry.ts factories (cross-cutting pattern from EVID-059)
- `latencyOrder` const hoist + `asTool()` return type tighten
- Agent: `string | unknown` collapse; `readonly ITool[]` element mutability note

## Functional Requirements

**Wave 13.D**:
- **FR-D-1** — Zod `chunkingStrategy` enum extended with `'hierarchical'`
- **FR-D-2** — `createGraphRAGSettings` clamps maxHops/topK to type-guard ranges
- **FR-D-3** — Rename `calculateConfigHash` → `configCacheKey`; back-compat re-export
- **FR-D-4** — `sanitizeTenantConfig` rewritten as allowlist via `Pick<TenantConfig, ...safeKeys>`
- **FR-D-5** — `DEFAULT_TENANT_CONFIG.agentReasoning!` non-null assertions removed; use `?? DEFAULT_AGENT_REASONING` fallback at 5 sites
- **FR-D-6** — `session-context.ts:301` `throw signal.reason` wrapped to coerce non-Error
- **FR-D-7** — `fromJSON` adds schema-check before passing to deserialize

**Wave 13.E**:
- **FR-E-1** — `executor.ts:328,338,352,362` helpers + `router.ts:203` storage: `IQueryExecutor<QueryRequest, unknown>` (or properly-generic helper) replacing `IQueryExecutor<any, any>`
- **FR-E-2** — `querySuccess`/`queryFailure` validate `durationMs ≥ 0` + `confidence ∈ [0,1]`
- **FR-E-3** — Apply withDefaults-style fix to 4 `query/registry.ts` factories (spread-after-literal cross-cutting)
- **FR-E-4** — `latencyOrder` hoisted to module const
- **FR-E-5** — `asTool()` return typed as `AgentTool` interface in `agent.ts` (or inline `{name, description, router}`)
- **FR-E-6** — `agent.ts:85` `string | unknown` → `unknown` (decorative `string |` removed)

## Non-Functional Requirements

**NFR-001** — Zero behaviour change for valid inputs.
**NFR-002** — Patch bump (or minor if FR-D-3 rename is breaking — back-compat re-export keeps it patch).
**NFR-003** — Build + test green + add 1-2 regression tests per FR where applicable.

## Out of Scope

- bcryptjs → native bcrypt (out of @gertsai/core scope; m9s-example concern, deferred per Wave 12.E)
- Future Wave 15 cycles (DDD bounded contexts, etc.)

## Related Artifacts

- EVID-059 (Wave 12.D2 audit — §MED/LOW)
- EVID-060/061/065 (Wave 13.A/B/C precedents)

## Target Audience

- Consumers of `@gertsai/core` tenant-config (~m9s-example primary), query primitives, session lifecycle



