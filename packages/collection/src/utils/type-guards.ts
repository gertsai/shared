/**
 * Type guards for @gerts/collection
 * Provides reusable type predicates and assertion functions for runtime type checking
 *
 * Type guards (is*) return boolean and narrow types via type predicates
 * Assertion functions (assert*) throw on failure and narrow types via asserts keyword
 */

import type { ReadableCollection } from '../types/interfaces';
import { InvalidArgumentError } from '../errors';

/**
 * Check if value is a ReadableCollection
 */
export function isReadableCollection<K = unknown, V = unknown>(
  value: unknown,
): value is ReadableCollection<K, V> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'entries' in value &&
    typeof (value as { entries: unknown }).entries === 'function' &&
    'has' in value &&
    typeof (value as { has: unknown }).has === 'function' &&
    'get' in value &&
    typeof (value as { get: unknown }).get === 'function' &&
    'size' in value &&
    typeof (value as { size: unknown }).size === 'number'
  );
}

/**
 * Check if value is iterable
 */
export function isIterable<T = unknown>(value: unknown): value is Iterable<T> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { [Symbol.iterator]: unknown })[Symbol.iterator] === 'function'
  );
}

/**
 * Check if value is a Map
 */
export function isMap<K = unknown, V = unknown>(value: unknown): value is Map<K, V> {
  return value instanceof Map;
}

/**
 * Check if value is a Set
 */
export function isSet<T = unknown>(value: unknown): value is Set<T> {
  return value instanceof Set;
}

/**
 * Check if value is an array
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Check if value is a plain object (not null, not array, not class instance)
 */
export function isPlainObject(value: unknown): value is Record<string | number | symbol, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Check if value is a function
 */
export function isFunction<T extends (...args: unknown[]) => unknown>(value: unknown): value is T {
  return typeof value === 'function';
}

/**
 * Check if value is a generator function
 */
export function isGeneratorFunction(value: unknown): value is GeneratorFunction {
  return typeof value === 'function' && value.constructor.name === 'GeneratorFunction';
}

/**
 * Check if value is an async iterable
 */
export function isAsyncIterable<T = unknown>(value: unknown): value is AsyncIterable<T> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator] === 'function'
  );
}

/**
 * Type guard for checking if a value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for tuple entries [K, V]
 */
export function isEntry<K, V>(value: unknown): value is [K, V] {
  return Array.isArray(value) && value.length === 2;
}

// ============================================================================
// Assertion Functions
// ============================================================================

/**
 * Assert value is a ReadableCollection.
 * Throws InvalidArgumentError if not, narrows type via asserts keyword.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not a ReadableCollection
 *
 * @example
 * function processCollection(data: unknown) {
 *   assertReadableCollection(data);
 *   // TypeScript now knows data is ReadableCollection
 *   console.log(data.size);
 * }
 */
export function assertReadableCollection<K = unknown, V = unknown>(
  value: unknown,
  message?: string,
): asserts value is ReadableCollection<K, V> {
  if (!isReadableCollection<K, V>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected ReadableCollection');
  }
}

/**
 * Assert value is iterable.
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not iterable
 */
export function assertIterable<T = unknown>(
  value: unknown,
  message?: string,
): asserts value is Iterable<T> {
  if (!isIterable<T>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected Iterable');
  }
}

/**
 * Assert value is a Map.
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not a Map
 */
export function assertMap<K = unknown, V = unknown>(
  value: unknown,
  message?: string,
): asserts value is Map<K, V> {
  if (!isMap<K, V>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected Map');
  }
}

/**
 * Assert value is a Set.
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not a Set
 */
export function assertSet<T = unknown>(value: unknown, message?: string): asserts value is Set<T> {
  if (!isSet<T>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected Set');
  }
}

/**
 * Assert value is an array.
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not an array
 */
export function assertArray<T = unknown>(value: unknown, message?: string): asserts value is T[] {
  if (!isArray<T>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected Array');
  }
}

/**
 * Assert value is a plain object.
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not a plain object
 */
export function assertPlainObject(
  value: unknown,
  message?: string,
): asserts value is Record<string | number | symbol, unknown> {
  if (!isPlainObject(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected plain object');
  }
}

/**
 * Assert value is a function.
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not a function
 */
export function assertFunction<T extends (...args: unknown[]) => unknown>(
  value: unknown,
  message?: string,
): asserts value is T {
  if (!isFunction<T>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected function');
  }
}

/**
 * Assert value is defined (not null or undefined).
 * Throws InvalidArgumentError if null or undefined.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (!isDefined(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected non-null/undefined value');
  }
}

/**
 * Assert value is a tuple entry [K, V].
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not a tuple [K, V]
 */
export function assertEntry<K, V>(value: unknown, message?: string): asserts value is [K, V] {
  if (!isEntry<K, V>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected tuple [K, V]');
  }
}

/**
 * Assert value is an async iterable.
 * Throws InvalidArgumentError if not.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @throws {InvalidArgumentError} If value is not an async iterable
 */
export function assertAsyncIterable<T = unknown>(
  value: unknown,
  message?: string,
): asserts value is AsyncIterable<T> {
  if (!isAsyncIterable<T>(value)) {
    throw new InvalidArgumentError('value', message ?? 'Expected AsyncIterable');
  }
}
