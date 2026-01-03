"use strict";
/**
 * @fileoverview Result<T, E> and Option<T> functional types for safe error handling.
 *
 * Inspired by Rust's Result and Option types, providing type-safe error handling
 * without exceptions. Based on VoltAgent patterns and neverthrow/ts-results.
 *
 * @module @gerts/core/result
 * @since 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionClass = exports.ResultClass = exports.OptionSchema = exports.NoneSchema = exports.SomeSchema = exports.ResultSchema = exports.ErrSchema = exports.OkSchema = exports.andThenOption = exports.andThen = void 0;
exports.ok = ok;
exports.err = err;
exports.isOk = isOk;
exports.isErr = isErr;
exports.unwrap = unwrap;
exports.unwrapOr = unwrapOr;
exports.unwrapOrElse = unwrapOrElse;
exports.unwrapErr = unwrapErr;
exports.map = map;
exports.mapErr = mapErr;
exports.flatMap = flatMap;
exports.orElse = orElse;
exports.match = match;
exports.toOption = toOption;
exports.tryCatch = tryCatch;
exports.tryCatchAsync = tryCatchAsync;
exports.combine = combine;
exports.combineAll = combineAll;
exports.some = some;
exports.none = none;
exports.isSome = isSome;
exports.isNone = isNone;
exports.unwrapOption = unwrapOption;
exports.unwrapOptionOr = unwrapOptionOr;
exports.unwrapOptionOrElse = unwrapOptionOrElse;
exports.mapOption = mapOption;
exports.flatMapOption = flatMapOption;
exports.orOption = orOption;
exports.orElseOption = orElseOption;
exports.matchOption = matchOption;
exports.fromNullable = fromNullable;
exports.toNullable = toNullable;
exports.toUndefined = toUndefined;
exports.toResult = toResult;
exports.filter = filter;
exports.combineOptions = combineOptions;
const zod_1 = require("zod");
/**
 * Creates a successful Result with the given value.
 */
function ok(value) {
    return { _tag: 'Ok', value };
}
/**
 * Creates a failed Result with the given error.
 */
function err(error) {
    return { _tag: 'Err', error };
}
/**
 * Type guard to check if a Result is Ok.
 */
function isOk(result) {
    return result._tag === 'Ok';
}
/**
 * Type guard to check if a Result is Err.
 */
function isErr(result) {
    return result._tag === 'Err';
}
/**
 * Unwraps the value from an Ok Result, or throws if it's an Err.
 * Use only when you're certain the Result is Ok.
 */
function unwrap(result) {
    if (isOk(result)) {
        return result.value;
    }
    throw new Error(`Attempted to unwrap an Err: ${String(result.error)}`);
}
/**
 * Unwraps the value from an Ok Result, or returns the default value.
 */
function unwrapOr(result, defaultValue) {
    return isOk(result) ? result.value : defaultValue;
}
/**
 * Unwraps the value from an Ok Result, or calls the function to get default.
 */
function unwrapOrElse(result, fn) {
    return isOk(result) ? result.value : fn(result.error);
}
/**
 * Unwraps the error from an Err Result, or throws if it's an Ok.
 */
function unwrapErr(result) {
    if (isErr(result)) {
        return result.error;
    }
    throw new Error(`Attempted to unwrapErr an Ok: ${String(result.value)}`);
}
/**
 * Maps the value of an Ok Result using the provided function.
 * If the Result is Err, returns the Err unchanged.
 */
function map(result, fn) {
    return isOk(result) ? ok(fn(result.value)) : result;
}
/**
 * Maps the error of an Err Result using the provided function.
 * If the Result is Ok, returns the Ok unchanged.
 */
function mapErr(result, fn) {
    return isErr(result) ? err(fn(result.error)) : result;
}
/**
 * Chains Result-returning operations (flatMap/andThen).
 * If the Result is Ok, applies the function and returns its Result.
 * If the Result is Err, returns the Err unchanged.
 */
function flatMap(result, fn) {
    return isOk(result) ? fn(result.value) : result;
}
/**
 * Alias for flatMap (Rust naming convention).
 */
exports.andThen = flatMap;
/**
 * If the Result is Err, applies the function and returns its Result.
 * If the Result is Ok, returns the Ok unchanged.
 */
function orElse(result, fn) {
    return isErr(result) ? fn(result.error) : result;
}
/**
 * Matches on the Result and applies the appropriate function.
 */
function match(result, handlers) {
    return isOk(result) ? handlers.ok(result.value) : handlers.err(result.error);
}
/**
 * Converts a Result to an Option, discarding the error.
 */
function toOption(result) {
    return isOk(result) ? some(result.value) : none();
}
/**
 * Wraps a function that may throw into a Result.
 */
function tryCatch(fn) {
    try {
        return ok(fn());
    }
    catch (error) {
        return err(error);
    }
}
/**
 * Wraps an async function that may throw into a Promise<Result>.
 */
async function tryCatchAsync(fn) {
    try {
        return ok(await fn());
    }
    catch (error) {
        return err(error);
    }
}
/**
 * Combines multiple Results into a single Result.
 * If all are Ok, returns Ok with array of values.
 * If any is Err, returns the first Err.
 */
function combine(results) {
    const values = [];
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
function combineAll(results) {
    const values = [];
    const errors = [];
    for (const result of results) {
        if (isErr(result)) {
            errors.push(result.error);
        }
        else {
            values.push(result.value);
        }
    }
    return errors.length > 0 ? err(errors) : ok(values);
}
/**
 * Creates a Some Option with the given value.
 */
function some(value) {
    return { _tag: 'Some', value };
}
/**
 * Creates a None Option.
 */
function none() {
    return { _tag: 'None' };
}
/**
 * Type guard to check if an Option is Some.
 */
function isSome(option) {
    return option._tag === 'Some';
}
/**
 * Type guard to check if an Option is None.
 */
function isNone(option) {
    return option._tag === 'None';
}
/**
 * Unwraps the value from a Some Option, or throws if it's None.
 */
function unwrapOption(option) {
    if (isSome(option)) {
        return option.value;
    }
    throw new Error('Attempted to unwrap a None');
}
/**
 * Unwraps the value from a Some Option, or returns the default value.
 */
function unwrapOptionOr(option, defaultValue) {
    return isSome(option) ? option.value : defaultValue;
}
/**
 * Unwraps the value from a Some Option, or calls the function to get default.
 */
function unwrapOptionOrElse(option, fn) {
    return isSome(option) ? option.value : fn();
}
/**
 * Maps the value of a Some Option using the provided function.
 * If the Option is None, returns None.
 */
function mapOption(option, fn) {
    return isSome(option) ? some(fn(option.value)) : none();
}
/**
 * Chains Option-returning operations.
 * If the Option is Some, applies the function and returns its Option.
 * If the Option is None, returns None.
 */
function flatMapOption(option, fn) {
    return isSome(option) ? fn(option.value) : none();
}
/**
 * Alias for flatMapOption (Rust naming convention).
 */
exports.andThenOption = flatMapOption;
/**
 * If the Option is None, returns the alternative Option.
 * If the Option is Some, returns the Some.
 */
function orOption(option, alternative) {
    return isSome(option) ? option : alternative;
}
/**
 * If the Option is None, calls the function to get the alternative.
 */
function orElseOption(option, fn) {
    return isSome(option) ? option : fn();
}
/**
 * Matches on the Option and applies the appropriate function.
 */
function matchOption(option, handlers) {
    return isSome(option) ? handlers.some(option.value) : handlers.none();
}
/**
 * Converts a nullable value to an Option.
 */
function fromNullable(value) {
    return value != null ? some(value) : none();
}
/**
 * Converts an Option to a nullable value.
 */
function toNullable(option) {
    return isSome(option) ? option.value : null;
}
/**
 * Converts an Option to an undefined value.
 */
function toUndefined(option) {
    return isSome(option) ? option.value : undefined;
}
/**
 * Converts an Option to a Result.
 */
function toResult(option, error) {
    return isSome(option) ? ok(option.value) : err(error);
}
/**
 * Filters an Option based on a predicate.
 * Returns None if the Option is None or the predicate returns false.
 */
function filter(option, predicate) {
    return isSome(option) && predicate(option.value) ? option : none();
}
/**
 * Combines multiple Options into a single Option.
 * If all are Some, returns Some with array of values.
 * If any is None, returns None.
 */
function combineOptions(options) {
    const values = [];
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
const OkSchema = (valueSchema) => zod_1.z.object({
    _tag: zod_1.z.literal('Ok'),
    value: valueSchema,
});
exports.OkSchema = OkSchema;
/**
 * Zod schema for Err Result.
 */
const ErrSchema = (errorSchema) => zod_1.z.object({
    _tag: zod_1.z.literal('Err'),
    error: errorSchema,
});
exports.ErrSchema = ErrSchema;
/**
 * Zod schema for Result.
 */
const ResultSchema = (valueSchema, errorSchema) => zod_1.z.discriminatedUnion('_tag', [(0, exports.OkSchema)(valueSchema), (0, exports.ErrSchema)(errorSchema)]);
exports.ResultSchema = ResultSchema;
/**
 * Zod schema for Some Option.
 */
const SomeSchema = (valueSchema) => zod_1.z.object({
    _tag: zod_1.z.literal('Some'),
    value: valueSchema,
});
exports.SomeSchema = SomeSchema;
/**
 * Zod schema for None Option.
 */
exports.NoneSchema = zod_1.z.object({
    _tag: zod_1.z.literal('None'),
});
/**
 * Zod schema for Option.
 */
const OptionSchema = (valueSchema) => zod_1.z.discriminatedUnion('_tag', [(0, exports.SomeSchema)(valueSchema), exports.NoneSchema]);
exports.OptionSchema = OptionSchema;
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
class ResultClass {
    result;
    constructor(result) {
        this.result = result;
    }
    static ok(value) {
        return new ResultClass(ok(value));
    }
    static err(error) {
        return new ResultClass(err(error));
    }
    static fromResult(result) {
        return new ResultClass(result);
    }
    static tryCatch(fn) {
        return new ResultClass(tryCatch(fn));
    }
    static async tryCatchAsync(fn) {
        return new ResultClass(await tryCatchAsync(fn));
    }
    isOk() {
        return isOk(this.result);
    }
    isErr() {
        return isErr(this.result);
    }
    map(fn) {
        return new ResultClass(map(this.result, fn));
    }
    mapErr(fn) {
        return new ResultClass(mapErr(this.result, fn));
    }
    flatMap(fn) {
        if (isOk(this.result)) {
            return fn(this.result.value);
        }
        return new ResultClass(this.result);
    }
    andThen(fn) {
        return this.flatMap(fn);
    }
    orElse(fn) {
        if (isErr(this.result)) {
            return fn(this.result.error);
        }
        return new ResultClass(this.result);
    }
    unwrap() {
        return unwrap(this.result);
    }
    unwrapOr(defaultValue) {
        return unwrapOr(this.result, defaultValue);
    }
    unwrapOrElse(fn) {
        return unwrapOrElse(this.result, fn);
    }
    unwrapErr() {
        return unwrapErr(this.result);
    }
    match(handlers) {
        return match(this.result, handlers);
    }
    toOption() {
        return toOption(this.result);
    }
    toRaw() {
        return this.result;
    }
}
exports.ResultClass = ResultClass;
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
class OptionClass {
    option;
    constructor(option) {
        this.option = option;
    }
    static some(value) {
        return new OptionClass(some(value));
    }
    static none() {
        return new OptionClass(none());
    }
    static fromNullable(value) {
        return new OptionClass(fromNullable(value));
    }
    static fromOption(option) {
        return new OptionClass(option);
    }
    isSome() {
        return isSome(this.option);
    }
    isNone() {
        return isNone(this.option);
    }
    map(fn) {
        return new OptionClass(mapOption(this.option, fn));
    }
    flatMap(fn) {
        if (isSome(this.option)) {
            return fn(this.option.value);
        }
        return new OptionClass(none());
    }
    andThen(fn) {
        return this.flatMap(fn);
    }
    or(alternative) {
        return this.isSome() ? this : alternative;
    }
    orElse(fn) {
        return this.isSome() ? this : fn();
    }
    filter(predicate) {
        return new OptionClass(filter(this.option, predicate));
    }
    unwrap() {
        return unwrapOption(this.option);
    }
    unwrapOr(defaultValue) {
        return unwrapOptionOr(this.option, defaultValue);
    }
    unwrapOrElse(fn) {
        return unwrapOptionOrElse(this.option, fn);
    }
    match(handlers) {
        return matchOption(this.option, handlers);
    }
    toNullable() {
        return toNullable(this.option);
    }
    toUndefined() {
        return toUndefined(this.option);
    }
    toResult(error) {
        return ResultClass.fromResult(toResult(this.option, error));
    }
    toRaw() {
        return this.option;
    }
}
exports.OptionClass = OptionClass;
//# sourceMappingURL=result.js.map