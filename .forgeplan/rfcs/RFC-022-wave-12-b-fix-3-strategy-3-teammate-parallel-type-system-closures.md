---
depth: standard
id: RFC-022
kind: rfc
last_modified_at: 2026-05-16T18:32:34.449723+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-031
  relation: informs
status: active
title: Wave 12.B-fix-3 strategy — 3-teammate parallel type-system closures
---

# RFC-022 — Wave 12.B-fix-3 execution strategy

## Summary

3 parallel teammates close 7 HIGH type-system findings from EVID-044 across 3 packages. Teammate A: `@gertsai/collection` (4 findings: `any` in exported generics, brand-bypass factories, missing `typesVersions`, return-type widening). Teammate B: `@gertsai/utils` (1 finding: `getSyncFields` `Record<string, any>` → `Record<string, unknown>`). Teammate C: `@gertsai/ws-rpc` (2 findings: `WsRpcOptions` discriminated split for Node-only `headers?` + concurrent-`connect()` race via shared promise). Disjoint file ownership; 3 changesets. Total wallclock ≤2 hours.

## Context

PRD-031 closes the last batch of HIGH-severity items from EVID-044. After this lands, all 16 actionable HIGH/CRITICAL findings from Wave 12.B audit are closed; MEDIUM/LOW deferred to polish sprint. Same shape as Wave 12.B-fix-1 (RFC-020) and Wave 12.B-fix-2 (RFC-021) — surgical fixes, parallel teammates, single PR per wave.

## Motivation

Pervasive `any` in `@gertsai/collection`'s exported generic constraints disables consumer narrowing across the largest Tier-1 package. Brand-bypass factories defeat the entire branded-type pattern's safety guarantee (a brand whose factory casts is just a type lie). `WsRpcOptions` silently drops `headers?` in browser — type system should catch this at compile time. `connect()` race could reject a successful connect's second concurrent caller — runtime hazard with type-shape root cause.

## Proposed Direction

### D-1 — Teammate roster

| Teammate | Subagent | Scope | LOC budget |
|---|---|---|---|
| **A** | `agents-core:coder` | `packages/collection/**` only | ≤250 LOC |
| **B** | `agents-core:coder` | `packages/utils/**` only | ≤50 LOC |
| **C** | `agents-core:coder` | `packages/ws-rpc/**` only | ≤150 LOC |

### D-2 — Per-finding fix patterns

**FR-001 (collection `any` widening):**
```ts
// Before
export type Constructor<T> = new (...args: any[]) => T;
export function memoize<T extends (...args: any[]) => any>(fn: T): T { ... }

// After
export type Constructor<T> = new (...args: readonly unknown[]) => T;
export function memoize<T extends (...args: readonly unknown[]) => unknown>(fn: T): T { ... }
```
Sites to update (from EVID-044 citations): `mixins/prototype.ts:8,28,29`; `mixins/PositionalAccess.ts:141,204,215,238,261,266,275,281`; `utils/memoize.ts:32,39,169,229,236,254,255,259,376,383,423,431,434,437`; `operations/memoized.ts:102,126,130,141`.

Call-sites that consume `Parameters<T>` / `ReturnType<T>` continue to narrow correctly because TS treats `readonly unknown[]` as a valid input shape.

**FR-002 (brand factory validation):**
```ts
// Before
export function createCacheKey(value: string): CacheKey {
  return value as CacheKey;
}

// After
export class BrandValidationError extends Error {
  override readonly name = 'BrandValidationError';
  constructor(message: string) { super(message); }
}

export function createCacheKey(value: string): CacheKey {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BrandValidationError(`createCacheKey: value must be non-empty string, got ${typeof value}`);
  }
  return value as CacheKey;
}
// Same shape for createCollectionId / createSeqOperationIndex / createHashCode
```
For each brand, define minimal validator (non-empty string, valid pattern, number range).

**FR-003 (typesVersions for subpaths):**
Add to `packages/collection/package.json` mirroring the `@gertsai/m9s-cache` pattern:
```json
"typesVersions": {
  "*": {
    "core/*":        ["./dist/core/*.d.ts"],
    "mixins/*":      ["./dist/mixins/*.d.ts"],
    "operations/*":  ["./dist/operations/*.d.ts"],
    "specialized/*": ["./dist/specialized/*.d.ts"]
  }
}
```
Note: requires verifying that `tsup` emits subpath `.d.ts` files. Check current `dist/` shape; if not, may need to add per-entry exports OR keep monolithic `index.d.ts` and update the `typesVersions` to map subpath-named lookups to the single `index.d.ts` (legacy compat pattern).

**FR-004 (helper/operation return-type widening):**
- `entriesArray(value: unknown): Array<[PropertyKey, unknown]>` (was `Array<[any, any]>`)
- `frequencies<K, V>(...)`: return `Map<K, number>` parameterised
- `flatten<T>(...)`: return `Array<unknown>` (callers narrow)

**FR-005 (utils `getSyncFields`):**
```ts
// Before
export const getSyncFields = <T extends Record<string, any>>(data: T): Partial<Record<string, any>> => { ... };

// After
export const getSyncFields = <T extends Record<string, unknown>>(data: T): Partial<T> => { ... };
```
Return type narrows to `Partial<T>` — callers reading `result[key]` get `T[key] | undefined` instead of `any`.

**FR-006 (ws-rpc `WsRpcOptions` split):**
```ts
interface WsRpcOptionsBase {
  url: string;
  // ... shared options
}

export interface WsRpcOptionsNode extends WsRpcOptionsBase {
  readonly environment?: 'node';
  /** Custom headers — Node WebSocket only. Ignored in browser. */
  headers?: Record<string, string>;
}

export interface WsRpcOptionsBrowser extends WsRpcOptionsBase {
  readonly environment: 'browser';
  // No headers field — would be silently discarded
}

export type WsRpcOptions = WsRpcOptionsNode | WsRpcOptionsBrowser;
```
At runtime, `connect()` inspects `options.environment` (default 'node') and selects WS implementation.

**FR-007 (ws-rpc `connect()` race fix):**
```ts
class WsRpcClient {
  private _connecting: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this._state === 'open') return;
    if (this._connecting) return this._connecting;  // Share existing promise

    this._connecting = new Promise<void>((resolve, reject) => {
      // single set of once('open') + once('error') listeners
      // ... existing logic
    });

    try {
      await this._connecting;
    } finally {
      this._connecting = null;
    }
  }
}
```

### D-3 — Cross-validation by orchestrator

Same pattern as RFC-021 D-3:
1. Each teammate report: verify each `file:line` in EVID-044 is patched.
2. `pnpm --filter <pkg> test typecheck` for each of the 3 packages.
3. Full `pnpm build` regression check.
4. `head -3 dist/*.d.ts` of all 3 packages (Wave-13-pattern regression check).

### D-4 — Changesets

- `.changeset/wave-12-b-fix-3-collection-type-tightening.md`
- `.changeset/wave-12-b-fix-3-utils-getSyncFields-narrow.md`
- `.changeset/wave-12-b-fix-3-ws-rpc-options-split-connect-race.md`

### D-5 — Branch and PR

```bash
git checkout -b fix/wave-12-b-fix-3-high-type-system
gh pr create --base main --title "..." --body "Refs: PRD-031, EVID-044"
```

### D-6 — STOP at Version Packages PR per CLAUDE.md.

## Implementation Phases

| Phase | Duration | Owner |
|---|---|---|
| Phase 1 — Pre-seed | 5 min | Orchestrator |
| Phase 2 — Parallel teammates | 20–35 min | 3 × coder |
| Phase 3 — Verification | 10 min | Orchestrator |
| Phase 4 — Downstream patch | 5 min | Orchestrator (likely none — additive types) |
| Phase 5 — Evidence + changesets | 10 min | Orchestrator |
| Phase 6 — Activate + commit + PR | 10 min | Orchestrator |
| Phase 7 — STOP | — | User (Y on Version Packages PR) |

## Invariants

- **I-1** — Each teammate touches ONLY its assigned package.
- **I-2** — Each EVID-044 cited `file:line` is verifiably patched.
- **I-3** — No external library types leak into root `dist/index.d.ts` (Wave-13-pattern regression).
- **I-4** — All existing tests pass; new tests added for brand validation, options discriminated types, connect race.
- **I-5** — No new deps.
- **I-6** — `.forgeplan/*` mutations only via MCP.
- **I-7** — Backward-compatibility:
  - `Constructor<T>`, `memoize` — call-sites continue to work (`unknown[]` accepted by TS where `any[]` was).
  - `BrandValidationError` — new export, additive.
  - `WsRpcOptions` — discriminated union with `WsRpcOptionsNode` as default if `environment` unset, so existing code with `headers?` keeps working.
  - `connect()` — concurrent callers now safely share the promise; idempotent for the happy path.
- **I-8** — `getSyncFields` generic narrowing — minor break for callers passing `Record<string, any>` explicitly. Most callers should be unaffected since their types tend to be `Record<string, X>` with concrete X.

## Rollback Plan

If teammate output causes downstream breakage:
1. Identify failing site.
2. Re-spawn teammate with narrowed prompt.
3. Re-run.

Worst-case: close PR, mark PRD-031 superseded, split into per-package sub-waves.

## Risks

- **R-1 — `typesVersions` subpath structure may not match `tsup` output.** Mitigated: pre-seed inspects current `dist/` shape; teammate prompt specifies the actual emitted file paths.
- **R-2 — Brand factory validation may break tests that fed bogus values via the factory.** Mitigated: search for test calls that construct branded values manually; update if needed.
- **R-3 — `WsRpcOptions` discriminated type may force consumer code change.** Mitigated: `WsRpcOptionsNode` is the default when `environment` is unset, so existing code continues to compile.

## Refs

- PRD-031 (this wave's PRD)
- EVID-044 (sources)
- PRD-029 + PRD-030 + EVID-045 + EVID-046 (precedents)



