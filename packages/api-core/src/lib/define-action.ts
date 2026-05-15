// SPDX-License-Identifier: Apache-2.0
/**
 * `defineAction()` — type-preserving wrapper for `controller.register(...)`
 * action exports.
 *
 * Closes EVID-036 audit findings W-Type-1 / W-Type-2 at the
 * `@gertsai/api-core` boundary; Wave 13 (EVID-043 Type C3 closure) tightens
 * the original Wave 11.B signature.
 *
 * History
 * -------
 * - Wave 10.E (PRD-022): local helper inside `examples/m9s-example/src/
 *   lib/define-action.ts`, signature `(unknown) => RegisteredAction`.
 * - Wave 11.B (PRD-024): upstreamed to this package; same signature.
 * - Wave 13 (PRD-027): tightened to `<T extends Record<string, unknown>>
 *   (registration: T) => T & RegisteredAction`. Two improvements:
 *     1. Constraint rejects `defineAction(undefined)`, `null`, primitives
 *        at compile time (the brand alone never enforced this at runtime).
 *     2. Output preserves the inferred shape of the registration —
 *        consumers who declaration-merge `RegisteredActions` keep the
 *        action's typed metadata accessible.
 *
 * Background
 * ----------
 * `controller.register(...)` (from `ApiController` in `@gertsai/api-core/
 * moleculer`) returns a Moleculer-specific shape that includes typia
 * transformer-only types (`ITypiaValidator` etc.) which leak into the
 * emitted `.d.ts` of the consumer. Annotating each action export as
 * `: any` hid the leak but surrendered type-safety at the export site
 * (and triggered per-file `eslint-disable @typescript-eslint/no-explicit-any`).
 *
 * `defineAction()` adds an opaque `RegisteredAction` brand to the
 * registration result. The export site sees `T & RegisteredAction`
 * (no `any`, no eslint suppression). The handler body inside
 * `register({ ... })` retains full typia/Moleculer typing because the
 * brand is applied only at the OUTER call.
 *
 * Migration
 * ---------
 *
 *     // Before:
 *     // eslint-disable-next-line @typescript-eslint/no-explicit-any
 *     export const upload: any = controller.register('upload', { ... });
 *
 *     // After:
 *     import { defineAction } from '@gertsai/api-core/moleculer';
 *     export const upload = defineAction(controller.register('upload', { ... }));
 *
 * The runtime body is a no-op cast — `controller.register` already
 * executed its side effect (eager argument evaluation), and the helper
 * only retypes the return.
 */

/**
 * Opaque marker for a registered action.
 *
 * The brand is structural (TypeScript structural typing): the marker
 * cannot prevent `{ __brand: 'registered-action' } as RegisteredAction`
 * — it is a developer-intent signal, not a security boundary. We
 * intentionally keep it as a string-literal brand (NOT `unique symbol`)
 * so consumers can declaration-merge `RegisteredActions` interfaces
 * across module boundaries.
 */
export interface RegisteredAction {
  readonly __brand: 'registered-action';
}

/**
 * Wrap a `controller.register(...)` result in a typed marker.
 *
 * Generic constraint `T extends Record<string, unknown>` rejects
 * `defineAction(undefined)`, `defineAction(null)`, and primitive inputs
 * at compile time. The return type `T & RegisteredAction` preserves the
 * inferred shape of the registration while adding the brand.
 *
 * The runtime body is a single `as` cast — unavoidable because the brand
 * is a type-only intersection (there is no value to "add" at runtime).
 * `controller.register()` produced its side effect before `defineAction`
 * runs (JavaScript argument-evaluation order); this helper changes only
 * the static type of the return.
 *
 * @typeParam T - Inferred from the input shape. Constraint
 *   `extends Record<string, unknown>` excludes nullish + primitive
 *   inputs at compile time.
 * @param registration - The result of `controller.register(...)`. Must
 *   be a non-null object value at compile + runtime.
 * @returns The input value, retyped as `T & RegisteredAction`.
 */
export function defineAction<T extends Record<string, unknown>>(
  registration: T,
): T & RegisteredAction {
  // Single `as` cast — the entire point of this helper. The brand exists
  // only in the type system; at runtime the registration object is
  // unchanged. Centralising the cast here lets every consumer action
  // export benefit without per-file eslint suppressions.
  return registration as T & RegisteredAction;
}
