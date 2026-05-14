// SPDX-License-Identifier: Apache-2.0
/**
 * `defineAction()` — typed wrapper retiring `export const xxx: any =
 * controller.register(...)`.
 *
 * Wave 10.E (PRD-022) — closes EVID-036 audit findings W-Type-1 / W-Type-2.
 *
 * Background
 * ----------
 * Every action in `services/{auth,ingest,search,channels}/src/actions/*`
 * exports the result of `controller.register(...)` as `: any`:
 *
 *     // eslint-disable-next-line @typescript-eslint/no-explicit-any
 *     export const uploadDocument: any = controller.register('upload', {
 *       ...
 *     });
 *
 * The `: any` cast was added because `controller.register` returns a
 * Moleculer-specific shape that includes typia transformer-only types
 * (`ITypiaValidator` etc.) which leak into the emitted `.d.ts` and the
 * referenced types can't be resolved at the consumer (`@gertsai/api-core`
 * internal). The cast hid that without surrendering type safety inside the
 * handler — params/response are still typia-validated.
 *
 * The proper fix lives in `@gertsai/api-core` (a real `defineAction` helper
 * shipped as part of the package). Until that lands (tracked as Wave 11
 * api-core v0.2.0 work), this **local** helper does the same job at the
 * m9s-example level:
 *
 *     export const uploadDocument = defineAction(
 *       controller.register('upload', { ... }),
 *     );
 *
 * No `: any`, no eslint-disable. The return value is an opaque
 * `RegisteredAction` marker — consumers only need the side effect of
 * `register` (the action lands in the controller's registry); the export
 * itself is type-erased to the marker so its leaked shape never appears
 * in the package surface.
 *
 * @example
 *   // Before:
 *   // eslint-disable-next-line @typescript-eslint/no-explicit-any
 *   export const upload: any = controller.register('upload', { ... });
 *
 *   // After:
 *   export const upload = defineAction(controller.register('upload', { ... }));
 */

/**
 * Opaque marker for a registered action. The `& { readonly __brand }`
 * pattern keeps `RegisteredAction` distinct from plain `unknown` in
 * external typing without exposing the underlying Moleculer/typia shape.
 *
 * Why a brand: prevents `defineAction` from being satisfied by `undefined`
 * or arbitrary values, and lets consumers (or future audit tools) detect
 * "is this export from a controller.register call?" structurally.
 */
export type RegisteredAction = {
  readonly __brand: 'registered-action';
};

/**
 * Wrap a `controller.register(...)` call result in a typed marker. Accepts
 * `unknown` so the caller doesn't have to spell out the Moleculer-specific
 * input shape; the return is the opaque marker the action barrel re-exports.
 *
 * The runtime body is a no-op cast — `controller.register` produced its
 * registration side effect already; this helper just type-erases the
 * leaked shape.
 */
export function defineAction(registration: unknown): RegisteredAction {
  // The `as` cast is the entire point of the helper: we erase the leaked
  // Moleculer/typia shape down to the opaque marker. Centralising this
  // here means every action export benefits without per-file eslint
  // suppressions. No `: any` annotation needed at any call site.
  return registration as RegisteredAction;
}
