/**
 * Checks if a value is not null or undefined.
 * This function can be used as a type guard to filter out nullable values from an array.
 *
 * @param value - The value to check.
 * @returns `true` if the value is not null or undefined, `false` otherwise.
 *
 * @example
 * ```typescript
 * const array = [1, null, 2, undefined, 3];
 * const filteredArray = array.filter(nonNullable);
 * // filteredArray is now [1, 2, 3] and has type number[]
 * ```
 */
export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

/**
 * A utility type that removes `undefined` from the properties of an object type.
 * This is a shallow operation, meaning it only affects the top-level properties.
 *
 * @template T - The object type to transform.
 *
 * @example
 * ```typescript
 * type MyType = {
 *   a: string;
 *   b?: number;
 * };
 *
 * type MyTypeWithNoUndefined = NoUndefinedFieldShallow<MyType>;
 * // MyTypeWithNoUndefined is { a: string; b: number; }
 * ```
 */
export type NoUndefinedFieldShallow<T> = {
  [P in keyof T]-?: Exclude<T[P], undefined>;
};
