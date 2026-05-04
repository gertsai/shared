/**
 * Custom error classes for @gertsai/collection
 * Provides typed errors for better error handling and debugging
 */

/**
 * Base error class for all collection errors
 */
export class CollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionError';
    // Maintains proper stack trace for where error was thrown (only in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when an invalid argument is provided
 */
export class InvalidArgumentError extends CollectionError {
  public readonly argument: string;
  public readonly reason: string;

  constructor(argument: string, reason: string) {
    super(`Invalid argument '${argument}': ${reason}`);
    this.name = 'InvalidArgumentError';
    this.argument = argument;
    this.reason = reason;
  }
}

/**
 * Error thrown when a key is not found in the collection
 */
export class KeyNotFoundError<K> extends CollectionError {
  public readonly key: K;

  constructor(key: K) {
    super(`Key not found: ${String(key)}`);
    this.name = 'KeyNotFoundError';
    this.key = key;
  }
}

/**
 * Error thrown when an operation is not supported
 */
export class UnsupportedOperationError extends CollectionError {
  public readonly operation: string;

  constructor(operation: string, reason?: string) {
    super(
      reason
        ? `Operation '${operation}' is not supported: ${reason}`
        : `Operation '${operation}' is not supported`,
    );
    this.name = 'UnsupportedOperationError';
    this.operation = operation;
  }
}

/**
 * Error thrown when a path is invalid for deep operations
 */
export class InvalidPathError extends CollectionError {
  public readonly path: ReadonlyArray<unknown>;

  constructor(path: ReadonlyArray<unknown>, reason?: string) {
    super(
      reason
        ? `Invalid path [${path.map(String).join(', ')}]: ${reason}`
        : `Invalid path [${path.map(String).join(', ')}]`,
    );
    this.name = 'InvalidPathError';
    this.path = path;
  }
}

/**
 * Error thrown when an index is out of bounds
 */
export class IndexOutOfBoundsError extends CollectionError {
  public readonly index: number;
  public readonly size: number;

  constructor(index: number, size: number) {
    super(`Index ${index} is out of bounds for collection of size ${size}`);
    this.name = 'IndexOutOfBoundsError';
    this.index = index;
    this.size = size;
  }
}
