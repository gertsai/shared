---
"@gertsai/di": minor
---

Sprint 3.4 enhancements (W-4A-4 per SPEC-007 / ADR-005 Decision B):

- Added runtime type guards: `isDestroyable`, `isServiceIdentifier`,
  `assertServiceIdentifier` (new module `src/guards.ts`).
- Added safe-destroy helpers: `safeDestroy`, `safeDestroyAll`, plus
  `SafeDestroyResult` type — formalises the failure-isolating cascade
  pattern used by `ServiceDirectory.$destroy()` for reuse by consumers
  tearing down ad-hoc {@link IDestroyable} collections (new module
  `src/destroy.ts`).
- Added type-level inference helpers: `InferServiceFromIdentifier`,
  `AnyServiceIdentifier` (new module `src/inference.ts`) — pure
  compile-time aliases that simplify generic plumbing over service
  identifiers.

Existing API surface unchanged. All 85 prior tests continue to pass; 29
new tests cover the additions (114 total).

Patterns cherry-picked from Orchestra orchlab/di v0.2.4 (Apache 2.0).
Per ADR-005 R-3, deeper orchlab patterns (args-bearing
`ServiceIdentifier<T, Args>`, `ServiceDirectory.getAll`) were deferred —
they require modifying existing `ServiceIdentifier`, `ServiceFactory`,
and `ServicesRegistry.create` signatures, which would not be strictly
additive.
