---
'@gertsai/utils': minor
---

Wave 12.B-fix-3 — close HIGH type-system finding (EVID-044) in
`@gertsai/utils`.

**`getSyncFields` `Record<string, any>` → `Record<string, unknown>`**

Exported helper input constraint narrowed from `Record<string, any>`
to `Record<string, unknown>`. Return type now explicitly `Partial<T>`
so callers reading `result[key]` get `T[key] | undefined` instead of
`any` — proper per-key narrowing.

**Soft breaking:** callers explicitly typing input as
`Record<string, any>` need to switch to `Record<string, unknown>` or
a concrete type. Most callers use concrete types and are unaffected.
Inside the function body, two minimal `unknown`-safe casts preserve
soundness without leaking `any` (`(obj as Record<string, unknown>)
[key] = data[key]` and `{} as Partial<T>` reduce seed).

**Tests:** +1 narrowing regression test asserting
`result.name: string | undefined` and `result.progress: number |
undefined` for concrete input. 486/486 total pass.

Refs: PRD-031, RFC-022, EVID-044.
