/**
 * @fileoverview Result<T, E> and Option<T> functional types for safe error handling.
 *
 * Inspired by Rust's Result and Option types, providing type-safe error handling
 * without exceptions. Based on VoltAgent patterns and neverthrow/ts-results.
 *
 * @module @gertsai/core/result
 * @since 1.0.0
 */

import { z } from 'zod';

// ============================================================================
// Result<T, E> - Type-safe error handling
// ============================================================================

/**
 * Represents a successful result containing a value.
 */
export interface Ok<T> {
  readonly _tag: 'Ok';
  readonly value: T;
}

/**
 * Represents a failed result containing an error.
 */
export interface Err<E> {
  readonly _tag: 'Err';
  readonly error: E;
}

/**
 * Result type - either Ok with value or Err with error.
 * Use this instead of throwing exceptions for expected errors.
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err('Division by zero');
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (isOk(result)) {
 *   console.log(result.value); // 5
 * }
 * ```
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a successful Result with the given value.
 */
export function ok<T>(value: T): Ok<T> {
  return { _tag: 'Ok', value };
}

/**
 * Creates a failed Result with the given error.
 */
export function err<E>(error: E): Err<E> {
  return { _tag: 'Err', error };
}

/**
 * Type guard to check if a Result is Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result._tag === 'Ok';
}

/**
 * Type guard to check if a Result is Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result._tag === 'Err';
}

/**
 * Unwraps the value from an Ok Result, or throws if it's an Err.
 * Use only when you're certain the Result is Ok.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw new Error(`Attempted to unwrap an Err: ${String(result.error)}`);
}

/**
 * Unwraps the value from an Ok Result, or returns the default value.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Unwraps the value from an Ok Result, or calls the function to get default.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  return isOk(result) ? result.value : fn(result.error);
}

/**
 * Unwraps the error from an Err Result, or throws if it's an Ok.
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (isErr(result)) {
    return result.error;
  }
  throw new Error(`Attempted to unwrapErr an Ok: ${String(result.value)}`);
}

/**
 * Maps the value of an Ok Result using the provided function.
 * If the Result is Err, returns the Err unchanged.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

/**
 * Maps the error of an Err Result using the provided function.
 * If the Result is Ok, returns the Ok unchanged.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? err(fn(result.error)) : result;
}

/**
 * Chains Result-returning operations (flatMap/andThen).
 * If the Result is Ok, applies the function and returns its Result.
 * If the Result is Err, returns the Err unchanged.
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}

/**
 * Alias for flatMap (Rust naming convention).
 */
export const andThen = flatMap;

/**
 * If the Result is Err, applies the function and returns its Result.
 * If the Result is Ok, returns the Ok unchanged.
 */
export function orElse<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => Result<T, F>
): Result<T, F> {
  return isErr(result) ? fn(result.error) : result;
}

/**
 * Matches on the Result and applies the appropriate function.
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }
): U {
  return isOk(result) ? handlers.ok(result.value) : handlers.err(result.error);
}

/**
 * Converts a Result to an Option, discarding the error.
 */
export function toOption<T, E>(result: Result<T, E>): Option<T> {
  return isOk(result) ? some(result.value) : none();
}

/**
 * Wraps a function that may throw into a Result.
 */
export function tryCatch<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Wraps an async function that may throw into a Promise<Result>.
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Combines multiple Results into a single Result.
 * If all are Ok, returns Ok with array of values.
 * If any is Err, returns the first Err.
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/**
 * Combines multiple Results, collecting all errors.
 * If all are Ok, returns Ok with array of values.
 * If any is Err, returns Err with array of all errors.
 */
export function combineAll<T, E>(results: Result<T, E>[]): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (isErr(result)) {
      errors.push(result.error);
    } else {
      values.push(result.value);
    }
  }

  return errors.length > 0 ? err(errors) : ok(values);
}

// ============================================================================
// Option<T> - Represents optional values
// ============================================================================

/**
 * Represents a value that exists.
 */
export interface Some<T> {
  readonly _tag: 'Some';
  readonly value: T;
}

/**
 * Represents the absence of a value.
 */
export interface None {
  readonly _tag: 'None';
}

/**
 * Option type - either Some with value or None.
 * Use this instead of null/undefined for optional values.
 *
 * @example
 * ```typescript
 * function findUser(id: string): Option<User> {
 *   const user = db.get(id);
 *   return user ? some(user) : none();
 * }
 *
 * const user = findUser('123');
 * if (isSome(user)) {
 *   console.log(user.value.name);
 * }
 * ```
 */
export type Option<T> = Some<T> | None;

/**
 * Creates a Some Option with the given value.
 */
export function some<T>(value: T): Some<T> {
  return { _tag: 'Some', value };
}

/**
 * Creates a None Option.
 */
export function none(): None {
  return { _tag: 'None' };
}

/**
 * Type guard to check if an Option is Some.
 */
export function isSome<T>(option: Option<T>): option is Some<T> {
  return option._tag === 'Some';
}

/**
 * Type guard to check if an Option is None.
 */
export function isNone<T>(option: Option<T>): option is None {
  return option._tag === 'None';
}

/**
 * Unwraps the value from a Some Option, or throws if it's None.
 */
export function unwrapOption<T>(option: Option<T>): T {
  if (isSome(option)) {
    return option.value;
  }
  throw new Error('Attempted to unwrap a None');
}

/**
 * Unwraps the value from a Some Option, or returns the default value.
 */
export function unwrapOptionOr<T>(option: Option<T>, defaultValue: T): T {
  return isSome(option) ? option.value : defaultValue;
}

/**
 * Unwraps the value from a Some Option, or calls the function to get default.
 */
export function unwrapOptionOrElse<T>(option: Option<T>, fn: () => T): T {
  return isSome(option) ? option.value : fn();
}

/**
 * Maps the value of a Some Option using the provided function.
 * If the Option is None, returns None.
 */
export function mapOption<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
  return isSome(option) ? some(fn(option.value)) : none();
}

/**
 * Chains Option-returning operations.
 * If the Option is Some, applies the function and returns its Option.
 * If the Option is None, returns None.
 */
export function flatMapOption<T, U>(
  option: Option<T>,
  fn: (value: T) => Option<U>
): Option<U> {
  return isSome(option) ? fn(option.value) : none();
}

/**
 * Alias for flatMapOption (Rust naming convention).
 */
export const andThenOption = flatMapOption;

/**
 * If the Option is None, returns the alternative Option.
 * If the Option is Some, returns the Some.
 */
export function orOption<T>(option: Option<T>, alternative: Option<T>): Option<T> {
  return isSome(option) ? option : alternative;
}

/**
 * If the Option is None, calls the function to get the alternative.
 */
export function orElseOption<T>(option: Option<T>, fn: () => Option<T>): Option<T> {
  return isSome(option) ? option : fn();
}

/**
 * Matches on the Option and applies the appropriate function.
 */
export function matchOption<T, U>(
  option: Option<T>,
  handlers: {
    some: (value: T) => U;
    none: () => U;
  }
): U {
  return isSome(option) ? handlers.some(option.value) : handlers.none();
}

/**
 * Converts a nullable value to an Option.
 */
export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value != null ? some(value) : none();
}

/**
 * Converts an Option to a nullable value.
 */
export function toNullable<T>(option: Option<T>): T | null {
  return isSome(option) ? option.value : null;
}

/**
 * Converts an Option to an undefined value.
 */
export function toUndefined<T>(option: Option<T>): T | undefined {
  return isSome(option) ? option.value : undefined;
}

/**
 * Converts an Option to a Result.
 */
export function toResult<T, E>(option: Option<T>, error: E): Result<T, E> {
  return isSome(option) ? ok(option.value) : err(error);
}

/**
 * Filters an Option based on a predicate.
 * Returns None if the Option is None or the predicate returns false.
 */
export function filter<T>(option: Option<T>, predicate: (value: T) => boolean): Option<T> {
  return isSome(option) && predicate(option.value) ? option : none();
}

/**
 * Combines multiple Options into a single Option.
 * If all are Some, returns Some with array of values.
 * If any is None, returns None.
 */
export function combineOptions<T>(options: Option<T>[]): Option<T[]> {
  const values: T[] = [];
  for (const option of options) {
    if (isNone(option)) {
      return none();
    }
    values.push(option.value);
  }
  return some(values);
}

// ============================================================================
// Zod Schemas for serialization/validation
// ============================================================================

/**
 * Zod schema for Ok Result.
 */
export const OkSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.object({
    _tag: z.literal('Ok'),
    value: valueSchema,
  });

/**
 * Zod schema for Err Result.
 */
export const ErrSchema = <E extends z.ZodType>(errorSchema: E) =>
  z.object({
    _tag: z.literal('Err'),
    error: errorSchema,
  });

/**
 * Zod schema for Result.
 */
export const ResultSchema = <T extends z.ZodType, E extends z.ZodType>(
  valueSchema: T,
  errorSchema: E
) => z.discriminatedUnion('_tag', [OkSchema(valueSchema), ErrSchema(errorSchema)]);

/**
 * Zod schema for Some Option.
 */
export const SomeSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.object({
    _tag: z.literal('Some'),
    value: valueSchema,
  });

/**
 * Zod schema for None Option.
 */
export const NoneSchema = z.object({
  _tag: z.literal('None'),
});

/**
 * Zod schema for Option.
 */
export const OptionSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.discriminatedUnion('_tag', [SomeSchema(valueSchema), NoneSchema]);

// ============================================================================
// Result Class (OOP style for method chaining)
// ============================================================================

/**
 * Result class for method chaining (OOP style).
 * Provides fluent API for Result operations.
 *
 * @example
 * ```typescript
 * const result = ResultClass.ok(10)
 *   .map(x => x * 2)
 *   .flatMap(x => x > 0 ? ResultClass.ok(x) : ResultClass.err('negative'))
 *   .unwrapOr(0);
 * ```
 */
export class ResultClass<T, E> {
  private constructor(private readonly result: Result<T, E>) {}

  static ok<T, E = never>(value: T): ResultClass<T, E> {
    return new ResultClass(ok(value));
  }

  static err<E, T = never>(error: E): ResultClass<T, E> {
    return new ResultClass(err(error));
  }

  static fromResult<T, E>(result: Result<T, E>): ResultClass<T, E> {
    return new ResultClass(result);
  }

  static tryCatch<T>(fn: () => T): ResultClass<T, Error> {
    return new ResultClass(tryCatch(fn));
  }

  static async tryCatchAsync<T>(fn: () => Promise<T>): Promise<ResultClass<T, Error>> {
    return new ResultClass(await tryCatchAsync(fn));
  }

  isOk(): boolean {
    return isOk(this.result);
  }

  isErr(): boolean {
    return isErr(this.result);
  }

  map<U>(fn: (value: T) => U): ResultClass<U, E> {
    return new ResultClass(map(this.result, fn));
  }

  mapErr<F>(fn: (error: E) => F): ResultClass<T, F> {
    return new ResultClass(mapErr(this.result, fn));
  }

  flatMap<U>(fn: (value: T) => ResultClass<U, E>): ResultClass<U, E> {
    if (isOk(this.result)) {
      return fn(this.result.value);
    }
    return new ResultClass(this.result);
  }

  andThen<U>(fn: (value: T) => ResultClass<U, E>): ResultClass<U, E> {
    return this.flatMap(fn);
  }

  orElse<F>(fn: (error: E) => ResultClass<T, F>): ResultClass<T, F> {
    if (isErr(this.result)) {
      return fn(this.result.error);
    }
    return new ResultClass(this.result);
  }

  unwrap(): T {
    return unwrap(this.result);
  }

  unwrapOr(defaultValue: T): T {
    return unwrapOr(this.result, defaultValue);
  }

  unwrapOrElse(fn: (error: E) => T): T {
    return unwrapOrElse(this.result, fn);
  }

  unwrapErr(): E {
    return unwrapErr(this.result);
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return match(this.result, handlers);
  }

  toOption(): Option<T> {
    return toOption(this.result);
  }

  toRaw(): Result<T, E> {
    return this.result;
  }
}

// ============================================================================
// Option Class (OOP style for method chaining)
// ============================================================================

/**
 * Option class for method chaining (OOP style).
 * Provides fluent API for Option operations.
 *
 * @example
 * ```typescript
 * const value = OptionClass.some(10)
 *   .map(x => x * 2)
 *   .filter(x => x > 10)
 *   .unwrapOr(0);
 * ```
 */
export class OptionClass<T> {
  private constructor(private readonly option: Option<T>) {}

  static some<T>(value: T): OptionClass<T> {
    return new OptionClass(some(value));
  }

  static none<T = never>(): OptionClass<T> {
    return new OptionClass(none());
  }

  static fromNullable<T>(value: T | null | undefined): OptionClass<T> {
    return new OptionClass(fromNullable(value));
  }

  static fromOption<T>(option: Option<T>): OptionClass<T> {
    return new OptionClass(option);
  }

  isSome(): boolean {
    return isSome(this.option);
  }

  isNone(): boolean {
    return isNone(this.option);
  }

  map<U>(fn: (value: T) => U): OptionClass<U> {
    return new OptionClass(mapOption(this.option, fn));
  }

  flatMap<U>(fn: (value: T) => OptionClass<U>): OptionClass<U> {
    if (isSome(this.option)) {
      return fn(this.option.value);
    }
    return new OptionClass(none());
  }

  andThen<U>(fn: (value: T) => OptionClass<U>): OptionClass<U> {
    return this.flatMap(fn);
  }

  or(alternative: OptionClass<T>): OptionClass<T> {
    return this.isSome() ? this : alternative;
  }

  orElse(fn: () => OptionClass<T>): OptionClass<T> {
    return this.isSome() ? this : fn();
  }

  filter(predicate: (value: T) => boolean): OptionClass<T> {
    return new OptionClass(filter(this.option, predicate));
  }

  unwrap(): T {
    return unwrapOption(this.option);
  }

  unwrapOr(defaultValue: T): T {
    return unwrapOptionOr(this.option, defaultValue);
  }

  unwrapOrElse(fn: () => T): T {
    return unwrapOptionOrElse(this.option, fn);
  }

  match<U>(handlers: { some: (value: T) => U; none: () => U }): U {
    return matchOption(this.option, handlers);
  }

  toNullable(): T | null {
    return toNullable(this.option);
  }

  toUndefined(): T | undefined {
    return toUndefined(this.option);
  }

  toResult<E>(error: E): ResultClass<T, E> {
    return ResultClass.fromResult(toResult(this.option, error));
  }

  toRaw(): Option<T> {
    return this.option;
  }
}

// ============================================================================
// Type utilities
// ============================================================================

/**
 * Extracts the Ok type from a Result.
 */
export type OkType<R> = R extends Result<infer T, unknown> ? T : never;

/**
 * Extracts the Err type from a Result.
 */
export type ErrType<R> = R extends Result<unknown, infer E> ? E : never;

/**
 * Extracts the Some type from an Option.
 */
export type SomeType<O> = O extends Option<infer T> ? T : never;

/**
 * Infers Result from a function return type.
 */
export type InferResult<F> = F extends (...args: unknown[]) => Result<infer T, infer E>
  ? Result<T, E>
  : never;

/**
 * Infers Option from a function return type.
 */
export type InferOption<F> = F extends (...args: unknown[]) => Option<infer T>
  ? Option<T>
  : never;
