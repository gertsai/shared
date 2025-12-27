# @orchlab/collection — Architecture Review and Refactoring Plan

This document captures the current architectural assessment, identified issues, proposed improvements, and a step-by-step, testable checklist. All work for this package should be coordinated through this document to maintain architectural integrity and traceability.

## Scope

- Public API (`src/index.ts`)
- Core collections (`src/core/*`)
- Mixins (`src/mixins/*`)
- Operations (`src/operations/*`)
- Utilities (`src/utils/*`)

Tests and docs are intentionally excluded from initial analysis to avoid bias.

---

## High-level Architecture

- Base read-only capabilities provided by `BaseCollection` using composition over pure operation modules.
- `MutableCollection` extends `BaseCollection` to provide write and in-place transforms.
- `ImmutableCollection` is a separate implementation returning new instances for updates.
- `PersistentCollection` wraps `PersistentMap` (HAMT) for structural sharing.
- Mixins (`BatchOps`, `DeepOps`, `PositionalAccess`, `ExtendedOps`) augment instances by defining methods directly on the target object.
- Operation modules (`search`, `transform`, `aggregate`, `set`) are pure functions that operate on iterables of entries.

---

## Findings (Issues and Risks)

1. Immutable integrity can be broken via public data exposure

- `data: Map<K,V>` is public in multiple classes. For immutable collections, `Object.freeze(this.data)` does not freeze the Map’s mutating methods; callers can still mutate via `set/delete/clear` if they obtain a reference.
- Risk: External code can mutate supposedly immutable structures, breaking invariants and memoization assumptions.

2. Inconsistent hierarchy and duplication

- `MutableCollection` inherits from `BaseCollection`, while `ImmutableCollection`/`PersistentCollection` reimplement functionality. Leads to duplication of logic (e.g., `flatMapCollection`, conversion methods) and potential divergence in behavior.

3. Unsafe casts and type looseness

- `as any` used to short-circuit type differences in `ImmutableCollection.mapValues/mapKeys`.
- Aggregates (`min/max/minEntry/maxEntry`) use `(value as any)` comparisons when comparator is absent, undermining strict typing.

4. Public contract inconsistencies

- `index.ts` banner mentions “Version 2.0.0” but `VERSION` constant is `'0.1.0'`.
- Mixed default export object + named exports complicate tree-shaking and API clarity.

5. Mixin application on instances

- Methods are added via `Object.defineProperty` on instances, not prototypes. This hinders predictability, obscures performance characteristics, and tightly couples mixins to `target.data`.

6. Factory options clarity

- `withExtended` exists but is effectively ignored because ExtendedOps are implemented within `MutableCollection` directly. This confuses option semantics.
- HAMT engine disables mixins, but the invariants and rationale aren’t contractually explicit.

7. Transform API coherence

- `map` returns arrays, while `mapValues`/`mapKeys` return collections. This heterogeneity complicates pipelines (alternating arrays/collections).

8. DeepOps semantics

- `deleteIn` for arrays may leave holes (`undefined`). Often undesirable; users may expect compaction.
- Merge strategy for arrays/objects/maps is implicit; should be explicit/configurable.

9. Performance considerations

- Frequent `Array.from(...)` and `new Map(...)` copies. Sorting/reversing create full materializations; consider lazy/iterator strategies or document trade-offs.

10. Documentation consistency

- Mixed English/Russian comments; prefer English-only for code/documentation.

---

## Recommendations

A) Encapsulate internal state

- Make internal storage private/protected and not publicly accessible. Provide controlled accessors only.
- For mixins, introduce an internal accessor (e.g., a private symbol) or pass only iterators/builders, not raw `Map`.
- Remove `Object.freeze(this.data)`; rely on encapsulation and pure update semantics for immutability.

B) Unify core hierarchy and reduce duplication

- Share common behaviors via a base abstract layer or CRTP pattern. Ensure `flatMapCollection`, conversions, equality, `toString`, etc. are implemented once.
- Align `ImmutableCollection`/`PersistentCollection` with the shared base for read-only ops.

C) Strengthen typing

- Eliminate `as any` returns. If no change is detected, return `this` with the original generic parameters; otherwise, construct a new instance with correct generics.
- In aggregates, require comparators when `V` is not `number | string`, or add generic constraints to avoid `any`.

D) Stabilize public API and versioning

- Fix `VERSION` to match the effective version and remove the default export object in favor of named exports only.
- Clean factory options: remove or implement `withExtended`; specify HAMT/mixins policy.

E) Mixin architecture

- Prefer prototype-based augmentation or composition wrappers over instance mutation. Alternatively, expose a stable internal accessor for mixins and keep instance surface minimal.

F) Transform API coherence

- Decide: either provide collection-returning transforms (`mapToCollection`) or clearly separate array-returning ops under a distinct namespace. Avoid mixing in the same interface.

G) DeepOps behavior

- Define explicit strategies: arrays (concat/replace/merge-by-index), delete semantics (compact vs keep holes), object vs Map resolution. Expose options.

H) Performance guidelines

- Adopt iterators where possible, document complexity characteristics, and introduce memoizable adapters for heavy ops.

I) Documentation

- English-only comments and JSDoc; document non-allocating vs allocating behaviors and immutability/no-change-return-same-instance optimization guarantees.

---

## Checklist (Executable)

All steps should be performed through this document. Each step must include:

- Implementation commits scoped to a single concern
- Update to this document’s “Progress” section
- Running the full test suite for this package (and dependent packages if applicable)

1. Encapsulate internal state

- Hide `data` (private/protected). Provide minimal internal accessor (symbol) for internal modules only.
- Remove `Object.freeze(this.data)` and adapt immutability guarantees.
- Refactor mixins to not rely on public `data` (accept iterables/builders or an internal accessor).

2. Mixin mechanism

- Replace per-instance `defineProperty` augmentation with prototype-based mixin or a composition wrapper.
- Introduce an internal symbol accessor shared across core/mixins.

3. API unification

- Centralize shared read-only behavior (reduce duplication across `ImmutableCollection`, `PersistentCollection`, and `MutableCollection`).
- Ensure `equals` availability and consistent semantics across all collections.

4. Strict typing pass

- Remove `as any` usages.
- Enforce comparators or type constraints in aggregates and `min/max` family.

5. Transform return types policy

- Decide and implement a consistent policy (documented) for array vs collection return types; adjust interfaces accordingly.

6. Factory/options and version/export cleanup

- Fix `VERSION` and header consistency; remove default export object.
- Clarify `withExtended` and HAMT mixin policy in types and runtime.

7. DeepOps semantics/options

- Implement configurable strategies for arrays and nested structures; adjust `deleteIn` behavior or document it clearly.

8. Performance pass

- Reduce intermediate allocations where safe; consider lazy iterators for sort/reverse or clearly document trade-offs.

9. Documentation normalization

- Convert mixed-language comments to English; add JSDoc for all public methods.

---

## Progress Log

- [x] Step 1 (part 1) — Remove Object.freeze misuse in ImmutableCollection (tests green)
- [x] Step 1 (part 2) — Introduce INTERNAL_DATA symbol and adapt mixins to use it (tests green)
- [x] Step 1 (part 3) — Make data protected across core and update PositionalAccess to use INTERNAL_DATA (tests green)
- [ ] Step 2 — Mixin mechanism (prototype/composition helper scaffold)
  - [ ] Decide based on benchmarks (instance defineProperty vs prototype methods)
  - [x] Add feature flag to toggle prototype augmentation (OFF by default) (tests green)
- [ ] Step 3 — API unification
  - [x] Add equals to ImmutableCollection for parity (tests green)
  - [x] Ensure equals is available across Base/Mutable (inherited)/Persistent (tests green)
  - [x] Unify Mutable.reduce to delegate to aggregate.reduceOp (tests green)
- [ ] Step 4 — Strict typing pass
  - [x] ImmutableCollection: remove unsafe any in mapValues/mapKeys (typed overloads + heuristics) (tests green)
- [ ] Step 5 — Transform return types policy
  - [x] Add mapEntriesCollection on Base/Immutable/Mutable (opt-in collection mapping) (tests green)
  - [x] Introduce explicit mapArray() for array-returning transforms across collections (tests green)
  - [x] Introduce explicit flatMapArray() for array-returning transforms across collections (tests green)
- [ ] Step 6 — Factory/options and version/export cleanup
  - [x] Sync version header in src/index.ts to 0.1.0 (tests green)
  - [x] Mark default export as deprecated (prefer named exports) (tests green)
- [ ] Step 7 — DeepOps semantics/options
  - [x] Add compactArrays option for deleteIn (default false) (tests green)
- [ ] Step 8 — Performance pass
  - [x] Add lazy iterators takeIter/skipIter to avoid allocations (tests green)
  - [x] Add lazy filterIter to avoid allocations (tests green)
  - [x] Sort/reverse remain allocating operations by design; document semantics (tests green)
- [ ] Step 9 — Documentation normalization

## API Policy: Transforms and Lazy Iteration

This section documents the standardized behavior for transforms and iteration across all collections.

- Transforms returning arrays
  - `mapArray(fn)` → always returns `R[]` (array)
  - `flatMapArray(fn)` → always returns `R[]` (array)
  - Example:
    ```ts
    const values = collection.mapArray((v, k) => `${k}:${v}`);
    const expanded = collection.flatMapArray((v) => [v, v * 2]);
    ```

- Transforms returning collections
  - `mapValues(fn)` → returns a collection with transformed values
  - `mapKeys(fn)` → returns a collection with transformed keys
  - `mapEntriesCollection(fn)` → returns a collection mapping both keys and values
  - Immutable collections may return the same instance when the transformation is a no-op.

- Lazy iteration (no allocations)
  - `filterIter(predicate)` → yields matching entries lazily
  - `takeIter(n)` / `skipIter(n)` → yield entries lazily
  - Example:
    ```ts
    for (const [k, v] of collection.filterIter((v) => v > 0)) {
      // process lazily
    }
    ```

- Allocating operations (documented behavior)
  - `sort()` / `reverse()` on immutable collections allocate new collections by design
  - Mutable `sort()` / `reverse()` operate in-place

These guarantees are consistent across `BaseCollection`, `MutableCollection`, `ImmutableCollection`, and `PersistentCollection`.

All subsequent edits and test runs should reference this document.
