/**
 * @fileoverview Result<T, E> and Option<T> functional types for safe error handling.
 *
 * Inspired by Rust's Result and Option types, providing type-safe error handling
 * without exceptions. Based on VoltAgent patterns and neverthrow/ts-results.
 *
 * @module @gerts/core/result
 * @since 1.0.0
 */
import { z } from 'zod';
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
export declare function ok<T>(value: T): Ok<T>;
/**
 * Creates a failed Result with the given error.
 */
export declare function err<E>(error: E): Err<E>;
/**
 * Type guard to check if a Result is Ok.
 */
export declare function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
/**
 * Type guard to check if a Result is Err.
 */
export declare function isErr<T, E>(result: Result<T, E>): result is Err<E>;
/**
 * Unwraps the value from an Ok Result, or throws if it's an Err.
 * Use only when you're certain the Result is Ok.
 */
export declare function unwrap<T, E>(result: Result<T, E>): T;
/**
 * Unwraps the value from an Ok Result, or returns the default value.
 */
export declare function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T;
/**
 * Unwraps the value from an Ok Result, or calls the function to get default.
 */
export declare function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T;
/**
 * Unwraps the error from an Err Result, or throws if it's an Ok.
 */
export declare function unwrapErr<T, E>(result: Result<T, E>): E;
/**
 * Maps the value of an Ok Result using the provided function.
 * If the Result is Err, returns the Err unchanged.
 */
export declare function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
/**
 * Maps the error of an Err Result using the provided function.
 * If the Result is Ok, returns the Ok unchanged.
 */
export declare function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>;
/**
 * Chains Result-returning operations (flatMap/andThen).
 * If the Result is Ok, applies the function and returns its Result.
 * If the Result is Err, returns the Err unchanged.
 */
export declare function flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>;
/**
 * Alias for flatMap (Rust naming convention).
 */
export declare const andThen: typeof flatMap;
/**
 * If the Result is Err, applies the function and returns its Result.
 * If the Result is Ok, returns the Ok unchanged.
 */
export declare function orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F>;
/**
 * Matches on the Result and applies the appropriate function.
 */
export declare function match<T, E, U>(result: Result<T, E>, handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
}): U;
/**
 * Converts a Result to an Option, discarding the error.
 */
export declare function toOption<T, E>(result: Result<T, E>): Option<T>;
/**
 * Wraps a function that may throw into a Result.
 */
export declare function tryCatch<T, E = Error>(fn: () => T): Result<T, E>;
/**
 * Wraps an async function that may throw into a Promise<Result>.
 */
export declare function tryCatchAsync<T, E = Error>(fn: () => Promise<T>): Promise<Result<T, E>>;
/**
 * Combines multiple Results into a single Result.
 * If all are Ok, returns Ok with array of values.
 * If any is Err, returns the first Err.
 */
export declare function combine<T, E>(results: Result<T, E>[]): Result<T[], E>;
/**
 * Combines multiple Results, collecting all errors.
 * If all are Ok, returns Ok with array of values.
 * If any is Err, returns Err with array of all errors.
 */
export declare function combineAll<T, E>(results: Result<T, E>[]): Result<T[], E[]>;
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
export declare function some<T>(value: T): Some<T>;
/**
 * Creates a None Option.
 */
export declare function none(): None;
/**
 * Type guard to check if an Option is Some.
 */
export declare function isSome<T>(option: Option<T>): option is Some<T>;
/**
 * Type guard to check if an Option is None.
 */
export declare function isNone<T>(option: Option<T>): option is None;
/**
 * Unwraps the value from a Some Option, or throws if it's None.
 */
export declare function unwrapOption<T>(option: Option<T>): T;
/**
 * Unwraps the value from a Some Option, or returns the default value.
 */
export declare function unwrapOptionOr<T>(option: Option<T>, defaultValue: T): T;
/**
 * Unwraps the value from a Some Option, or calls the function to get default.
 */
export declare function unwrapOptionOrElse<T>(option: Option<T>, fn: () => T): T;
/**
 * Maps the value of a Some Option using the provided function.
 * If the Option is None, returns None.
 */
export declare function mapOption<T, U>(option: Option<T>, fn: (value: T) => U): Option<U>;
/**
 * Chains Option-returning operations.
 * If the Option is Some, applies the function and returns its Option.
 * If the Option is None, returns None.
 */
export declare function flatMapOption<T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U>;
/**
 * Alias for flatMapOption (Rust naming convention).
 */
export declare const andThenOption: typeof flatMapOption;
/**
 * If the Option is None, returns the alternative Option.
 * If the Option is Some, returns the Some.
 */
export declare function orOption<T>(option: Option<T>, alternative: Option<T>): Option<T>;
/**
 * If the Option is None, calls the function to get the alternative.
 */
export declare function orElseOption<T>(option: Option<T>, fn: () => Option<T>): Option<T>;
/**
 * Matches on the Option and applies the appropriate function.
 */
export declare function matchOption<T, U>(option: Option<T>, handlers: {
    some: (value: T) => U;
    none: () => U;
}): U;
/**
 * Converts a nullable value to an Option.
 */
export declare function fromNullable<T>(value: T | null | undefined): Option<T>;
/**
 * Converts an Option to a nullable value.
 */
export declare function toNullable<T>(option: Option<T>): T | null;
/**
 * Converts an Option to an undefined value.
 */
export declare function toUndefined<T>(option: Option<T>): T | undefined;
/**
 * Converts an Option to a Result.
 */
export declare function toResult<T, E>(option: Option<T>, error: E): Result<T, E>;
/**
 * Filters an Option based on a predicate.
 * Returns None if the Option is None or the predicate returns false.
 */
export declare function filter<T>(option: Option<T>, predicate: (value: T) => boolean): Option<T>;
/**
 * Combines multiple Options into a single Option.
 * If all are Some, returns Some with array of values.
 * If any is None, returns None.
 */
export declare function combineOptions<T>(options: Option<T>[]): Option<T[]>;
/**
 * Zod schema for Ok Result.
 */
export declare const OkSchema: <T extends z.ZodType>(valueSchema: T) => z.ZodObject<{
    _tag: z.ZodLiteral<"Ok">;
    value: T;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    _tag: z.ZodLiteral<"Ok">;
    value: T;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    _tag: z.ZodLiteral<"Ok">;
    value: T;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>;
/**
 * Zod schema for Err Result.
 */
export declare const ErrSchema: <E extends z.ZodType>(errorSchema: E) => z.ZodObject<{
    _tag: z.ZodLiteral<"Err">;
    error: E;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    _tag: z.ZodLiteral<"Err">;
    error: E;
}>, any> extends infer T ? { [k in keyof T]: T[k]; } : never, z.baseObjectInputType<{
    _tag: z.ZodLiteral<"Err">;
    error: E;
}> extends infer T_1 ? { [k_1 in keyof T_1]: T_1[k_1]; } : never>;
/**
 * Zod schema for Result.
 */
export declare const ResultSchema: <T extends z.ZodType, E extends z.ZodType>(valueSchema: T, errorSchema: E) => z.ZodDiscriminatedUnion<"_tag", [z.ZodObject<{
    _tag: z.ZodLiteral<"Ok">;
    value: T;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    _tag: z.ZodLiteral<"Ok">;
    value: T;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    _tag: z.ZodLiteral<"Ok">;
    value: T;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>, z.ZodObject<{
    _tag: z.ZodLiteral<"Err">;
    error: E;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    _tag: z.ZodLiteral<"Err">;
    error: E;
}>, any> extends infer T_3 ? { [k_2 in keyof T_3]: T_3[k_2]; } : never, z.baseObjectInputType<{
    _tag: z.ZodLiteral<"Err">;
    error: E;
}> extends infer T_4 ? { [k_3 in keyof T_4]: T_4[k_3]; } : never>]>;
/**
 * Zod schema for Some Option.
 */
export declare const SomeSchema: <T extends z.ZodType>(valueSchema: T) => z.ZodObject<{
    _tag: z.ZodLiteral<"Some">;
    value: T;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    _tag: z.ZodLiteral<"Some">;
    value: T;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    _tag: z.ZodLiteral<"Some">;
    value: T;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>;
/**
 * Zod schema for None Option.
 */
export declare const NoneSchema: z.ZodObject<{
    _tag: z.ZodLiteral<"None">;
}, "strip", z.ZodTypeAny, {
    _tag: "None";
}, {
    _tag: "None";
}>;
/**
 * Zod schema for Option.
 */
export declare const OptionSchema: <T extends z.ZodType>(valueSchema: T) => z.ZodDiscriminatedUnion<"_tag", [z.ZodObject<{
    _tag: z.ZodLiteral<"Some">;
    value: T;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    _tag: z.ZodLiteral<"Some">;
    value: T;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    _tag: z.ZodLiteral<"Some">;
    value: T;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>, z.ZodObject<{
    _tag: z.ZodLiteral<"None">;
}, "strip", z.ZodTypeAny, {
    _tag: "None";
}, {
    _tag: "None";
}>]>;
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
export declare class ResultClass<T, E> {
    private readonly result;
    private constructor();
    static ok<T, E = never>(value: T): ResultClass<T, E>;
    static err<E, T = never>(error: E): ResultClass<T, E>;
    static fromResult<T, E>(result: Result<T, E>): ResultClass<T, E>;
    static tryCatch<T>(fn: () => T): ResultClass<T, Error>;
    static tryCatchAsync<T>(fn: () => Promise<T>): Promise<ResultClass<T, Error>>;
    isOk(): boolean;
    isErr(): boolean;
    map<U>(fn: (value: T) => U): ResultClass<U, E>;
    mapErr<F>(fn: (error: E) => F): ResultClass<T, F>;
    flatMap<U>(fn: (value: T) => ResultClass<U, E>): ResultClass<U, E>;
    andThen<U>(fn: (value: T) => ResultClass<U, E>): ResultClass<U, E>;
    orElse<F>(fn: (error: E) => ResultClass<T, F>): ResultClass<T, F>;
    unwrap(): T;
    unwrapOr(defaultValue: T): T;
    unwrapOrElse(fn: (error: E) => T): T;
    unwrapErr(): E;
    match<U>(handlers: {
        ok: (value: T) => U;
        err: (error: E) => U;
    }): U;
    toOption(): Option<T>;
    toRaw(): Result<T, E>;
}
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
export declare class OptionClass<T> {
    private readonly option;
    private constructor();
    static some<T>(value: T): OptionClass<T>;
    static none<T = never>(): OptionClass<T>;
    static fromNullable<T>(value: T | null | undefined): OptionClass<T>;
    static fromOption<T>(option: Option<T>): OptionClass<T>;
    isSome(): boolean;
    isNone(): boolean;
    map<U>(fn: (value: T) => U): OptionClass<U>;
    flatMap<U>(fn: (value: T) => OptionClass<U>): OptionClass<U>;
    andThen<U>(fn: (value: T) => OptionClass<U>): OptionClass<U>;
    or(alternative: OptionClass<T>): OptionClass<T>;
    orElse(fn: () => OptionClass<T>): OptionClass<T>;
    filter(predicate: (value: T) => boolean): OptionClass<T>;
    unwrap(): T;
    unwrapOr(defaultValue: T): T;
    unwrapOrElse(fn: () => T): T;
    match<U>(handlers: {
        some: (value: T) => U;
        none: () => U;
    }): U;
    toNullable(): T | null;
    toUndefined(): T | undefined;
    toResult<E>(error: E): ResultClass<T, E>;
    toRaw(): Option<T>;
}
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
export type InferResult<F> = F extends (...args: unknown[]) => Result<infer T, infer E> ? Result<T, E> : never;
/**
 * Infers Option from a function return type.
 */
export type InferOption<F> = F extends (...args: unknown[]) => Option<infer T> ? Option<T> : never;
