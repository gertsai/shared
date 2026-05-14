---
'@gertsai/api-core': minor
---

Add `defineAction()` typed wrapper retiring `: any` annotations at every
`controller.register(...)` call site. Exported from
`@gertsai/api-core/moleculer`.

Migration:

```ts
// Before:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const upload: any = controller.register('upload', { ... });

// After:
import { defineAction } from '@gertsai/api-core/moleculer';
export const upload = defineAction(controller.register('upload', { ... }));
```

`defineAction` returns the opaque `RegisteredAction` brand — the export
type-erases the leaked Moleculer/typia shape (`ITypiaValidator` etc.)
without losing handler-body typing. Side effect of registration is
unchanged; the helper is a runtime no-op cast.

Closes EVID-036 audit findings W-Type-1 / W-Type-2 at the package boundary
instead of per-app shim (originally local in `examples/m9s-example/src/lib/`
since Wave 10.E PRD-022).
