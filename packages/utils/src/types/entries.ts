/* c8 ignore start */

/**
 * A utility type for `Object.entries`.
 * It provides a more specific type for the entries of an object, excluding `undefined` values.
 *
 * @template T - The object type.
 *
 * @example
 * ```typescript
 * const obj = {
 *   a: 1,
 *   b: 'hello',
 *   c: undefined,
 * };
 *
 * const entries: Entries<typeof obj> = Object.entries(obj) as any;
 * // entries has type ['a', number] | ['b', string]
 * ```
 */
export type Entries<T> = Exclude<
  {
    [K in keyof T]: [K, Exclude<T[K], undefined>];
  }[keyof T],
  undefined
>[];
