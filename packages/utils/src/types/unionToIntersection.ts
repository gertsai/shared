// IDK how does this work :)))
/**
 * Converts a union type to an intersection type.
 *
 * WARN: Doesn't work with unions, that have shared properties.
 * For example, this will fail:
 * ```typescript
 * type ComplexUnion =
 *   | { id: string; name: string; }
 *   | { id: number;  }
 *   | { id: string; role: string; };
 *
 * @template U - The union type to convert.
 */
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Flattens an object type, converting nested objects into a single object with concatenated keys.
 *
 * @template T - The object type to flatten.
 * @template K - The prefix for the keys.
 *
 * @example
 * ```typescript
 * type MyType = {
 *   a: {
 *     b: string;
 *   };
 *   c: number;
 * };
 *
 * type FlattenedType = FlattenObject<MyType>;
 * // FlattenedType is { 'a--b': string; c: number; }
 * ```
 */
export type FlattenObject<
  T extends Record<string, unknown>,
  K extends string = '',
> =
  T extends Record<string, never>
    ? Record<string, never>
    : {} & UnionToIntersection<
        {
          [P in keyof T & string]: T[P] extends Date // Exclude Date from being treated as a nested object
            ? { [key in `${K}${P}`]: T[P] }
            : T[P] extends Array<any>
              ? { [key in `${K}${P}`]: T[P] }
              : T[P] extends Record<string, any>
                ? FlattenObject<T[P], `${K}${P}--`>
                : { [key in `${K}${P}`]: T[P] };
        }[keyof T & string]
      >;
