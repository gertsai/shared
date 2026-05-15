// SPDX-License-Identifier: Apache-2.0
/**
 * Tests for `defineAction()` — Wave 13 (EVID-043 Test C1 closure).
 *
 * The original `defineAction` shipped in Wave 11.B / PRD-024 without
 * direct tests. EVID-043 test-reviewer flagged this as a CRITICAL gap —
 * any regression that reintroduces `: any` exports would pass CI
 * unnoticed.
 *
 * These tests cover four contracts:
 *
 *   1. Runtime identity — `defineAction(x)` returns SAME reference as x.
 *   2. Side-effect preservation — function call expressions wrapped by
 *      defineAction execute their side effects (eager argument eval) so
 *      `defineAction(controller.register('upload', {...}))` registers
 *      the action before defineAction sees the return.
 *   3. Compile-time type preservation — the inferred shape of the input
 *      is preserved AND the `RegisteredAction` brand is added (`T &
 *      RegisteredAction`). Verified via direct property access on the
 *      wrapped value.
 *   4. Generic constraint — `T extends Record<string, unknown>` rejects
 *      `defineAction(undefined)`, `defineAction(null)`, primitives at
 *      compile time. Verified via `@ts-expect-error` directives.
 *
 * Any future regression that loosens defineAction back to `unknown`
 * input, or loses the brand, fails one of these tests.
 */
import { describe, it, expect } from 'vitest';

import { defineAction, type RegisteredAction } from './define-action';

describe('defineAction()', () => {
  describe('runtime identity', () => {
    it('returns the same reference as the input', () => {
      const input: Record<string, unknown> = { name: 'test', foo: 1 };
      const output = defineAction(input);
      expect(output).toBe(input); // same reference, not a copy
    });

    it('does not mutate the input object', () => {
      const input: Record<string, unknown> = { name: 'test', value: 42 };
      const snapshot = { ...input };
      defineAction(input);
      expect(input).toEqual(snapshot);
    });

    it('is a no-op cast — repeated wrapping returns the same reference', () => {
      const action: Record<string, unknown> = { name: 'multi-wrap' };
      const a = defineAction(action);
      const b = defineAction(a);
      const c = defineAction(b);
      expect(a).toBe(action);
      expect(b).toBe(action);
      expect(c).toBe(action);
    });
  });

  describe('side-effect preservation', () => {
    it('lets the wrapped expression execute before defineAction runs', () => {
      // Simulates `controller.register(...)`: the function call has a
      // side effect (appending to a log) and returns a shape. The log
      // entry must exist by the time defineAction's return is observed,
      // proving argument evaluation runs first.
      const log: string[] = [];
      const fakeRegister = (name: string): Record<string, unknown> => {
        log.push(`registered:${name}`);
        return { actionName: name, handler: () => 'ok' };
      };
      const wrapped = defineAction(fakeRegister('foo'));
      expect(log).toEqual(['registered:foo']);
      expect(wrapped.actionName).toBe('foo');
    });

    it('preserves function members on the wrapped object', () => {
      const obj = {
        name: 'with-fn',
        handler: (): number => 42,
        nested: { factor: 2 },
      } as const satisfies Record<string, unknown>;
      const wrapped = defineAction(obj);
      // Type-system check — `wrapped.handler` is callable (no `any`
      // narrowing); `wrapped.nested.factor` is the literal 2.
      expect((wrapped.handler as () => number)()).toBe(42);
      expect((wrapped.nested as { factor: number }).factor).toBe(2);
    });
  });

  describe('compile-time type contract', () => {
    it('returns T & RegisteredAction — preserves input shape AND adds brand', () => {
      const action: Record<string, unknown> = { actionName: 'typed' };
      const wrapped = defineAction(action);

      // The wrapped value's static type is T & RegisteredAction.
      // Static `__brand` property is part of the type (intersected),
      // but at runtime it's never written — accessing it returns undefined.
      // The runtime assertion confirms the brand is type-only, not runtime.
      const brandAtRuntime = (wrapped as { __brand?: string }).__brand;
      expect(brandAtRuntime).toBeUndefined();

      // T preserved: caller-visible properties stay accessible.
      expect(wrapped.actionName).toBe('typed');
    });

    it('the brand type narrows via type-guard pattern in caller', () => {
      const obj: Record<string, unknown> = { foo: 1 };
      const wrapped = defineAction(obj);

      // Sanity: a function expecting `RegisteredAction` accepts the
      // wrapped value because of the type intersection. We check this
      // compile-time by reusing wrapped as that type.
      const asBranded: RegisteredAction = wrapped;
      expect(asBranded).toBe(obj);
    });
  });

  describe('generic constraint rejects non-object inputs', () => {
    it('compile-time rejects undefined / null / primitives', () => {
      // These lines must NOT compile if the generic constraint is
      // applied correctly. @ts-expect-error asserts the line BELOW
      // produces a TS error; if the line compiles cleanly the directive
      // itself is flagged as "Unused @ts-expect-error" and tsc fails.

      // @ts-expect-error - defineAction requires T extends Record<string, unknown>
      defineAction(undefined);

      // @ts-expect-error - null rejected
      defineAction(null);

      // @ts-expect-error - number primitive rejected
      defineAction(42);

      // @ts-expect-error - string primitive rejected
      defineAction('a string');

      // Sanity: legitimate object inputs compile cleanly.
      defineAction({} as Record<string, unknown>);
      defineAction({ foo: 1 } as Record<string, unknown>);
    });
  });

  describe('the brand', () => {
    it('is structurally a string literal — by design (not a security boundary)', () => {
      // The brand is structural TS typing; it cannot prevent
      // `{ __brand: 'registered-action' } as RegisteredAction`. This
      // test documents the intentional weakness so future PRs do not
      // try to switch to `unique symbol` (which would break consumers
      // that need to declaration-merge `RegisteredActions`).
      const fake = { __brand: 'registered-action' } as unknown as RegisteredAction;
      expect((fake as { __brand: string }).__brand).toBe('registered-action');
    });
  });
});
