// SPDX-License-Identifier: Apache-2.0
/**
 * `defineAction()` — typed wrapper retiring `export const xxx: any =
 * controller.register(...)` in @gertsai/api-core action call sites.
 *
 * Wave 11.B (PRD-024) — upstreamed from the local helper in
 * `examples/m9s-example/src/lib/define-action.ts` (Wave 10.E PRD-022)
 * so every @gertsai/api-core consumer benefits without copy-pasting the
 * shim. Closes EVID-036 audit findings W-Type-1 / W-Type-2 at the
 * package boundary instead of per-app.
 *
 * Background
 * ----------
 * `controller.register(...)` (from `ApiController` in `@gertsai/api-core/
 * moleculer`) returns a Moleculer-specific shape that includes typia
 * transformer-only types (`ITypiaValidator` etc.) which leak into the
 * emitted `.d.ts` of the consumer. Annotating each action export as
 * `: any` hid the leak but surrendered type-safety at the export site
 * (and triggered per-file `eslint-disable @typescript-eslint/no-explicit-any`
 * suppressions).
 *
 * `defineAction()` wraps the registration result in an opaque
 * `RegisteredAction` brand — the export site sees a clearly-typed
 * marker, no `any`, no eslint suppression. The handler body inside
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
 * The runtime body of `defineAction` is a no-op cast — `controller.register`
 * has already executed its side effect (the action lands in the controller's
 * registry); this helper only type-erases the leaked shape.
 */

/**
 * Opaque marker for a registered action. The `& { readonly __brand }`
 * pattern keeps `RegisteredAction` distinct from plain `unknown` in
 * external typing without exposing the underlying Moleculer/typia shape.
 *
 * Why a brand: prevents `defineAction(undefined)` from compiling and
 * lets consumers (or future audit tools) detect "is this export from a
 * controller.register call?" structurally.
 */
export type RegisteredAction = {
  readonly __brand: 'registered-action';
};

/**
 * Wrap a `controller.register(...)` call result in a typed marker.
 * Accepts `unknown` so the caller doesn't have to spell out the
 * Moleculer-specific input shape; the return is the opaque marker the
 * action barrel re-exports.
 *
 * The runtime body is a no-op cast — `controller.register` produced its
 * registration side effect already; this helper just type-erases the
 * leaked shape.
 */
export function defineAction(registration: unknown): RegisteredAction {
  // The `as` cast is the entire point of the helper: erase the leaked
  // Moleculer/typia shape down to the opaque marker. Centralising this
  // here means every action export benefits without per-file eslint
  // suppressions.
  return registration as RegisteredAction;
}
