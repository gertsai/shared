// SPDX-License-Identifier: Apache-2.0
/**
 * Compact structural deep-equality.
 *
 * Replaces `lodash.isequal` per ADR-005 Decision B (no lodash dep). Handles:
 *   - primitives + `Object.is`-style equality (NaN === NaN, +0 !== -0)
 *   - arrays (length + element-wise recursion)
 *   - plain objects (own enumerable keys, recursive)
 *   - `null`/`undefined` symmetry
 *
 * Out of scope (use `lodash.isequal` directly if needed): Map, Set, Date,
 * RegExp, typed arrays, circular references. Entity payloads are expected to
 * be JSON-shaped data, where the simple algorithm suffices.
 *
 * Wave 26 (EVID-080 M1, M2):
 *   - M1: short-circuit uses `Object.is` (was `===`) so `NaN === NaN` returns
 *     `true` and `+0 === -0` returns `false`, matching the docstring + the
 *     `lodash.isequal` semantics this function replaces.
 *   - M2: per-key recursion guards with `Object.prototype.hasOwnProperty.call`
 *     on `b` to reject disjoint-key-set false-positives (e.g.,
 *     `{a: undefined, b: undefined}` vs `{c: undefined, d: undefined}` — same
 *     length, all undefined values, but disjoint keys).
 *
 * @param a - left-hand value
 * @param b - right-hand value
 * @returns `true` if structurally equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
  );
}
