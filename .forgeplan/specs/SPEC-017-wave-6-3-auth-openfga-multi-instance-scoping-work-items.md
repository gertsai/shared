---
depth: standard
id: SPEC-017
kind: spec
last_modified_at: 2026-05-07T22:08:48.472322+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Wave 6.3 — auth-openfga multi-instance scoping work items
---

# SPEC-017 — Wave 6.3 work items

## Summary

Concrete work-item list (W-6-3-1..W-6-3-9) backing PRD-006 + ADR-012
+ RFC-004. Single owner (autopilot), sequential execution. Total
diff ~150 lines across `@gertsai/auth-openfga` (5 files modified +
3 new) and `examples/m9s-example` (1 file modified + 1 new test).
Replaces process-wide `let clientInstance` with
`Map<string, GertsFgaClient>` keyed by SHA-256 fingerprint of
canonical-JSON of distinguishing config fields.

## Scope

Single-package change in `@gertsai/auth-openfga` core +
m9s-example gate adoption. Tests in two locations.

## Work Items

### W-6-3-1 — `util/fingerprint.ts` (NEW)

Pure helper exporting `fingerprint(config?: FgaClientConfig): string`.

```ts
import { createHash } from 'node:crypto';
import type { FgaClientConfig } from '../types.js';

export function fingerprint(config?: FgaClientConfig): string {
  if (!config) return '__default__';
  const canonical = JSON.stringify({
    apiUrl: config.apiUrl ?? '',
    apiToken: config.apiToken ?? '',
    authorizationModelId: config.authorizationModelId ?? '',
    storeId: config.storeId ?? '',
  });
  return createHash('sha256').update(canonical).digest('hex');
}
```

Object literal keys MUST be alphabetically sorted in the canonical
JSON to satisfy ADR-012 invariant I-3 (determinism). `JSON.stringify`
preserves insertion order, so we hardcode the order in the literal.

**File**: `packages/auth-openfga/src/util/fingerprint.ts`

### W-6-3-2 — `client.ts` rewrite

Replace `let clientInstance: GertsFgaClient | null = null` with
`const clientInstances = new Map<string, GertsFgaClient>()`.

Rewrite three exports:

- `getFgaClient(config?)` — get-or-create by fingerprint
- `createFgaClient(config?)` — NEW; always fresh
- `resetFgaClient(config?)` — selective by fingerprint; no-arg = clear all

Logic per ADR-012 §Decision. `GertsFgaClient` class itself untouched.

**File**: `packages/auth-openfga/src/client.ts`

### W-6-3-3 — `cache/index.ts` rewrite

Replace `let permissionCacheInstance: PermissionCache | null = null`
with `const permissionCaches = new Map<string, PermissionCache>()`.

Rewrite three exports:

- `getPermissionCache(config?, scope: string = '__default__')` —
  scope = Map key
- `setPermissionCache(cache, scope: string = '__default__')` — same
- `resetPermissionCache(scope?)` — selective; no-arg = clear all

`createInvalidationHandler()` continues to call `getPermissionCache()`
no-arg → uses `__default__` scope (back-compat).

**File**: `packages/auth-openfga/src/cache/index.ts`

### W-6-3-4 — `queries/index.ts` `checkPermission` opts

Add second optional arg:

```ts
export async function checkPermission(
  request: FgaCheckRequest,
  opts?: { clientScope?: string; cacheScope?: string },
): Promise<FgaCheckResponse>
```

`opts?.cacheScope` → passed as `scope` to `getPermissionCache`.
`opts?.clientScope` is reserved; current `getFgaClient()` no-arg
path is unchanged (back-compat).

**File**: `packages/auth-openfga/src/queries/index.ts`

### W-6-3-5 — `index.ts` exports

```ts
export { GertsFgaClient, getFgaClient, createFgaClient, resetFgaClient } from './client.js';
export { fingerprint } from './util/fingerprint.js';
```

**File**: `packages/auth-openfga/src/index.ts`

### W-6-3-6 — `client.multi-instance.test.ts` (NEW, ≥7 tests)

Per RFC-004 Edge 1.6. All cases covered.

**File**: `packages/auth-openfga/src/__tests__/client.multi-instance.test.ts`

### W-6-3-7 — `cache.multi-scope.test.ts` (NEW, ≥4 tests)

Per RFC-004 Edge 1.7.

**File**: `packages/auth-openfga/src/__tests__/cache.multi-scope.test.ts`

### W-6-3-8 — m9s-example gate auto-scope

Per RFC-004 Edge 2. Gate computes its scope from
`mod.fingerprint({ apiUrl, storeId, authorizationModelId, apiToken })`
and passes `cacheScope` to `mod.checkPermission(req, { cacheScope })`.

**Files**:
- `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts`
- `examples/m9s-example/tests/openfga-permission.gate.multi-instance.test.ts` (NEW)

### W-6-3-9 — KNOWN-ISSUES + EVID-021

Per RFC-004 Edge 3.

**Files**:
- `KNOWN-ISSUES.md`
- `.forgeplan/evidence/EVID-021-...md` (NEW via MCP)

## API Contracts

New / modified surface in `@gertsai/auth-openfga`:

```ts
// client.ts (modified)
export function getFgaClient(config?: FgaClientConfig): GertsFgaClient;
export function createFgaClient(config?: FgaClientConfig): GertsFgaClient; // NEW
export function resetFgaClient(config?: FgaClientConfig): void;             // arg added

// cache/index.ts (modified)
export function getPermissionCache(
  config?: PermissionCacheConfig,
  scope?: string,
): PermissionCache;                                                         // arg added
export function setPermissionCache(
  cache: PermissionCache,
  scope?: string,
): void;                                                                    // arg added
export function resetPermissionCache(scope?: string): void;                 // arg added

// queries/index.ts (modified)
export async function checkPermission(
  request: FgaCheckRequest,
  opts?: { clientScope?: string; cacheScope?: string },                     // opts added
): Promise<FgaCheckResponse>;

// util/fingerprint.ts (NEW)
export function fingerprint(config?: FgaClientConfig): string;

// index.ts re-exports — adds:
//   createFgaClient, fingerprint
```

All additions are optional/back-compat — existing call shapes
continue to work unchanged. The single name addition that
consumers may import is `createFgaClient` and `fingerprint`.

## Acceptance Gate

Each W-item is "DONE" when:
1. The file change passes typecheck.
2. Its associated test (if any) passes.
3. The relevant invariant (ADR-012 I-1..I-5) is preserved.

## File Ownership Matrix

| Worker | Files |
|---|---|
| W1 (autopilot) | All — single owner per /autorun |

## Test Plan

| Test File | Lives In | Cases |
|---|---|---|
| `client.multi-instance.test.ts` | `packages/auth-openfga/src/__tests__/` | ≥7 |
| `cache.multi-scope.test.ts` | `packages/auth-openfga/src/__tests__/` | ≥4 |
| `openfga-permission.gate.multi-instance.test.ts` | `examples/m9s-example/tests/` | ≥3 |

Plus existing tests (64 in `auth-openfga`, 38 in m9s mock, 16 in
m9s real-infra) unchanged — no regression permitted.

## Related Artifacts

- **PRD-006** — Wave 6.3 multi-tenant isolation requirements
  (this Spec implements the work-item breakdown)
- **ADR-012** — multi-instance scoping decision (canonical
  conceptual shape)
- **RFC-004** — implementation phases + rollout plan
- **EVID-019** — Sprint 3.11 production-grade m9s-example evidence
  (drives §P1-2 finding)
- **EVID-020** — Wave 6.2 apiToken plumbing evidence (Wave 6.3
  builds on the apiToken field this evidence locked in)
- **KNOWN-ISSUES.md §FGA-singleton-multi-store** — entry to flip
  to RESOLVED in W-6-3-9
- **Sprint 3.11 Post-Build Track 2 §P1-2**

## References

- Node.js `crypto.createHash('sha256')`
- OpenFGA SDK `Credentials` types



