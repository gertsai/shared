---
depth: standard
id: ADR-013
kind: adr
last_modified_at: 2026-05-08T13:47:23.502035+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-008
  relation: based_on
status: active
title: Tri-state storage capability flag — boolean to structured object reshape (Wave 7.2)
---

# ADR-013: Tri-state storage capability flag — boolean → structured object reshape (Wave 7.2)

## Status

Accepted (2026-05-08, shipped commit `f791e8a`, PR #7).

## Context

Wave 6.5 (commit `b45ed4b`, EVID-022) added a 1-RTT fast path for upsert in `@gertsai/storage-core`:

```ts
interface IStorageProvider {
  upsertDoc(id: string, data: Partial<T>): Promise<void>;  // optional, fast-path
}
interface StorageCapabilities {
  readonly upsert?: boolean;  // declared TRUE if upsertDoc present
}
```

`BaseEntityStorageService.upsert()` then routed callers to `provider.upsertDoc(...)` when `capabilities.upsert === true`, else fell back to the original 2-RTT `getDoc → set/update` path.

The boolean flag was sufficient to gate **availability** of the fast path — but it was insufficient to encode **audit-correctness**.

## Problem

The 2-RTT fallback path read the existing document first, copied `creator_uuid` + `created_at` from the old row, then wrote the merged record. This preserved audit lineage on UPDATE: a stamping operator changed `updater_uuid` + `updated_at`, the original creator stayed untouched.

The 1-RTT fast path skipped the read. A naive `upsertDoc` impl would either:

1. **Overwrite all fields** including `creator_uuid` + `created_at` — silently rewriting the creator on UPDATE. Audit regression.
2. **Stamp creator on every call** — wrong on UPDATE (creator changes), right on INSERT.
3. **Preserve creator only on UPDATE** via SQL `INSERT ... ON CONFLICT DO UPDATE` with explicit field exclusion.

Only option 3 is audit-correct. The pre-Wave-7 `upsert?: boolean` flag did not distinguish a provider that implemented option 3 from one that implemented option 1 or 2. A consumer trusting the flag would silently lose audit invariants depending on which provider was wired.

KNOWN-ISSUES §10 documented this risk: "BaseEntityStorageService.upsert() must NOT short-circuit to provider.upsertDoc until provider self-declares audit-correctness". Until Wave 7.2 the workaround was for the service to never use the fast path — defeating the Wave 6.5 optimization.

## Preconditions

- Wave 6.5 already shipped (`upsertDoc` primitive on `IStorageProvider` + boolean `upsert` capability flag).
- `@gertsai/storage-core` not yet published to npm under v0.2.0 — public-API reshape allowed without semver-major.
- Both shipped IStorageProvider implementations (`InMemoryStorageProvider`, `PgStorageProvider`) under monorepo control — no third-party impls in the wild.
- `KNOWN-ISSUES.md` §10 still open at decision time, documenting the workaround dependency.

## Decision

Replace the boolean flag with a structured object:

```ts
interface StorageCapabilities {
  readonly upsert?: {
    readonly supported: boolean;
    readonly preservesCreatorAudit: boolean;
  };
}
```

`BaseEntityStorageService.upsert()` requires BOTH flags `=== true` to route to `provider.upsertDoc(...)`. Otherwise it falls back to the 2-RTT path. Both shipped providers updated to opt in:

- `InMemoryStorageProvider.upsertDoc()` — pre-checks `Map.has(id)` (zero RTT, sync local Map) and merges create-time fields from existing on UPDATE.
- `PgStorageProvider.upsertDoc()` — surgical jsonb SQL: `INSERT ... ON CONFLICT (id) DO UPDATE SET data = <table>.data || (EXCLUDED.data - 'creator_uuid' - 'created_at')`. One round-trip; `-` strips creator from incoming, `||` merges remaining onto existing.

KNOWN-ISSUES §10 marked RESOLVED.

## Alternatives Considered

### Alt 1 — Keep boolean, add side-channel

Document the audit-correctness invariant in `IStorageProvider` JSDoc; trust impls to honor it.

**Rejected**: silent regressions are exactly the failure mode this ADR exists to prevent. JSDoc is not type-checked. A new impl author may not read it.

### Alt 2 — Discriminated union

```ts
upsert?: { kind: 'audit-aware-native' | 'lossy-native' | 'fallback' };
```

**Rejected**: over-engineered for two flags. The product (`supported × preservesCreatorAudit`) yields four states but only three are meaningful (`{F,*}` is the same as `{F,F}` — not supported = no fast path). The two-flag form expresses the same logic with less ceremony, and adding a third dimension later (e.g. `supportsTransactions`) is additive — a single discriminator would force re-modeling.

### Alt 3 — Two separate top-level capabilities

```ts
interface StorageCapabilities {
  readonly upsertSupported?: boolean;
  readonly upsertPreservesCreatorAudit?: boolean;
}
```

**Rejected**: leaks the dual-flag contract into namespace-flat capability bag. Reader has to discover by convention that `upsertPreservesCreatorAudit` only meaningful when `upsertSupported`. Nesting the flags inside `upsert?: { ... }` makes the conjunction structural.

### Alt 4 — Type-only (nominal subtype)

`type AuditAwareUpsertProvider extends IStorageProvider` with a brand. Service narrows on type at runtime via `instanceof` or brand check.

**Rejected**: TypeScript erases types at runtime; brand check at runtime requires impls to set a flag anyway — same problem as boolean, expressed less clearly.

## Consequences

### Positive

- **Audit-correctness invariant lifted to the type system** — capability declaration forces impl authors to confront `preservesCreatorAudit` semantics. They cannot accidentally opt into the fast path without saying they preserve audit.
- **Fast path safely re-enabled** — Wave 6.5 1-RTT optimization now usable. Workaround in §10 retired.
- **Forward-compatible** — adding future invariants (e.g. `supportsListeners`, `atomicMultiKey`) follows the same nested-flag pattern.

### Negative

- **Public-API breaking** for any consumer typing capabilities directly. `upsert?: boolean` → `upsert?: { supported, preservesCreatorAudit }` is incompatible. Mitigated by: (a) only two shipped providers, both updated in the same commit; (b) consumers typically destructure off the service interface, not the capability bag directly; (c) v0.2.0 not yet published — no external blast radius.

### Neutral

- Fast path does NOT emit `ENTITY_CREATED` / `ENTITY_UPDATED` events because the service cannot tell insert from update without a pre-read (defeating the optimization). Listeners requiring create-vs-update discrimination must use `provider.onDocumentSnapshot` (where supported) or stay on the slow path by setting `capabilities.upsert.preservesCreatorAudit: false`.

## Postconditions

- `StorageCapabilities.upsert` typed as the tri-state object (or `undefined`); the boolean form no longer compilable.
- Both shipped providers declare `{ supported: true, preservesCreatorAudit: true }`.
- `BaseEntityStorageService.upsert()` short-circuits to fast path only when both flags `true`; falls back otherwise.
- KNOWN-ISSUES.md §10 marked RESOLVED with reference to commit `f791e8a` and this ADR.
- Test suites cover both routing branches (`upsert.fast-path.test.ts` for capability gating; `upsert.test.ts` for audit-preservation invariant).

## Affected Files

| Path | Reason |
|---|---|
| `packages/storage-core/src/types.ts` | `StorageCapabilities.upsert` shape change (W-7-2-1) |
| `packages/entity-storage/src/BaseEntityStorageService.ts` | dual-flag check at routing boundary (W-7-2-2) |
| `packages/entity-storage/src/InMemoryStorageProvider.ts` | audit-aware `upsertDoc()` impl + capability declaration (W-7-2-3) |
| `packages/pg-client/src/storage-provider.ts` | jsonb-SQL `upsertDoc()` impl + capability declaration (W-7-2-4) |
| `packages/pg-client/src/storage-provider.test.ts` | capability-shape assertion update (W-7-2-4) |
| `packages/entity-storage/src/__tests__/upsert.fast-path.test.ts` | RecordingProvider tri-state shape (W-7-2-5) |
| `packages/entity-storage/src/__tests__/upsert.test.ts` | event-emission assertions removed; audit-preservation kept (W-7-2-5) |
| `KNOWN-ISSUES.md` | §10 RESOLVED marker (W-7-2-6) |

## Rollback Plan

If the tri-state reshape causes downstream breakage discovered post-merge but pre-publish:

1. **Diagnose** — run `pnpm --filter @gertsai/entity-storage test` + `pnpm --filter @gertsai/pg-client test` + m9s real-infra suite. Failure pattern indicates whether breakage is in the routing logic, capability declaration, or audit-preservation impl.
2. **Tactical revert** — `git revert f791e8a` reverts Wave 7.2 cleanly. KNOWN-ISSUES §10 returns to open. Wave 6.5 boolean flag restored. Workaround (`BaseEntityStorageService.upsert()` always 2-RTT path) automatic — service falls back when capability shape doesn't match expected boolean.
3. **Partial rollback** — keep capability shape, revert one provider impl. Set `preservesCreatorAudit: false` on the broken provider; service falls back to 2-RTT path automatically (I-1 invariant). Other provider remains on fast path.
4. **Post-publish rollback** (if v0.2.0 already shipped and external consumers wired the boolean) — release v0.2.x with `upsert?: boolean | { supported, preservesCreatorAudit }` union; deprecate boolean form across one minor cycle, then remove. NOT applicable today (v0.2.0 not yet published per CLAUDE.md §Текущий статус).

Confidence: rollback is straightforward because (a) capability flag is opt-in (default fallback path always works), (b) only two impls under monorepo control, (c) tests cover both routing branches.

## Invariants

- **I-1** — `BaseEntityStorageService.upsert()` MUST short-circuit to `provider.upsertDoc()` only when `capabilities.upsert?.supported === true && capabilities.upsert?.preservesCreatorAudit === true`. Either flag missing or false → fallback to 2-RTT `getDoc → set/update` path. Test coverage: `entity-storage/__tests__/upsert.fast-path.test.ts`.
- **I-2** — KNOWN-ISSUES §10 is RESOLVED for both shipped providers; future providers must self-declare BOTH flags or accept fallback automatically. Test coverage: `entity-storage/__tests__/upsert.test.ts` (audit-preservation assertions retained from Sprint 3.5; pass against audit-aware InMemory impl).
- **I-3** — Field names `creator_uuid` and `created_at` MUST match `@gertsai/entity-audit` convention. If the convention changes, update both `InMemoryStorageProvider.upsertDoc` AND `PgStorageProvider.upsertDoc` in lockstep — there is no shared constants module today (intentional: storage-core is backend-agnostic, entity-audit field names are domain convention not infrastructure).

## Cross-references

- PRD-008 (Wave 7 closure) — based_on (this ADR)
- SPEC-018 (Wave 7 work items) — based_on (this ADR for W-7-2-* items)
- EVID-023 (Wave 7 ship evidence) — supports (this ADR — `f791e8a` shipped + tests + KNOWN-ISSUES §10 closure)
- EVID-022 (Wave 6.5 upsertDoc primitive) — informs (this ADR reshapes capability flag introduced in 6.5)
- ADR-005 (storage-core architecture) — informs (this ADR extends `IStorageProvider` capability surface from ADR-005)
- KNOWN-ISSUES.md §10 — informs (this ADR closes the section)
- PR #7 — implementation reference (`f791e8a`)






