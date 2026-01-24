import type { CachePayload, GenericCacheSerializer, CacheSerializer } from './types.js';
import { CacheErrorCode, createCacheError } from './types.js';

/**
 * JSON serializer for cache values.
 * Implements GenericCacheSerializer for use with CacheStore.
 *
 * @example
 * ```typescript
 * const serializer = new JsonSerializer();
 * const payload = serializer.serialize({ name: 'John' });
 * const value = serializer.deserialize<User>(payload);
 * ```
 */
export class JsonSerializer implements GenericCacheSerializer {
  /**
   * Serialize value to JSON string.
   * Handles Date objects by converting to ISO strings.
   */
  serialize<T>(value: T): CachePayload {
    try {
      return JSON.stringify(value, this.replacer);
    } catch (error) {
      throw createCacheError(
        'Failed to serialize value to JSON',
        CacheErrorCode.SERIALIZATION_FAILED,
        error,
      );
    }
  }

  /**
   * Deserialize JSON payload to typed value.
   * Handles Buffer payloads from Redis.
   */
  deserialize<T>(payload: CachePayload): T {
    try {
      const text = Buffer.isBuffer(payload) ? payload.toString('utf-8') : payload;
      return JSON.parse(text, this.reviver) as T;
    } catch (error) {
      throw createCacheError(
        'Failed to deserialize JSON payload',
        CacheErrorCode.DESERIALIZATION_FAILED,
        error,
      );
    }
  }

  /**
   * JSON.stringify replacer function.
   * Override in subclass for custom serialization.
   */
  protected replacer(_key: string, value: unknown): unknown {
    // Handle Date objects
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    // Handle BigInt
    if (typeof value === 'bigint') {
      return { __type: 'BigInt', value: value.toString() };
    }
    // Handle Map
    if (value instanceof Map) {
      return { __type: 'Map', value: Array.from(value.entries()) };
    }
    // Handle Set
    if (value instanceof Set) {
      return { __type: 'Set', value: Array.from(value) };
    }
    return value;
  }

  /**
   * JSON.parse reviver function.
   * Override in subclass for custom deserialization.
   */
  protected reviver(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && '__type' in value) {
      const typed = value as { __type: string; value: unknown };
      switch (typed.__type) {
        case 'Date':
          return new Date(typed.value as string);
        case 'BigInt':
          return BigInt(typed.value as string);
        case 'Map':
          return new Map(typed.value as Array<[unknown, unknown]>);
        case 'Set':
          return new Set(typed.value as unknown[]);
      }
    }
    return value;
  }
}

/**
 * Type-safe serializer for a specific type.
 * Wraps GenericCacheSerializer with type constraints.
 *
 * @example
 * ```typescript
 * interface User { id: string; name: string; }
 * const userSerializer = new TypedSerializer<User>(new JsonSerializer());
 *
 * const payload = userSerializer.serialize({ id: '1', name: 'John' });
 * const user = userSerializer.deserialize(payload); // User type inferred
 * ```
 */
export class TypedSerializer<T> implements CacheSerializer<T> {
  constructor(private readonly inner: GenericCacheSerializer) {}

  serialize(value: T): CachePayload {
    return this.inner.serialize(value);
  }

  deserialize(payload: CachePayload): T {
    return this.inner.deserialize<T>(payload);
  }
}

/**
 * MessagePack-like binary serializer (placeholder).
 * For production, consider using @msgpack/msgpack package.
 */
export class BinarySerializer implements GenericCacheSerializer {
  serialize<T>(value: T): CachePayload {
    // Fallback to JSON for now
    // In production, use: encode(value) from @msgpack/msgpack
    return Buffer.from(JSON.stringify(value), 'utf-8');
  }

  deserialize<T>(payload: CachePayload): T {
    const text = Buffer.isBuffer(payload) ? payload.toString('utf-8') : payload;
    return JSON.parse(text) as T;
  }
}

/**
 * Passthrough serializer for pre-serialized data.
 * Useful when data is already in the correct format.
 */
export class PassthroughSerializer implements GenericCacheSerializer {
  serialize<T>(value: T): CachePayload {
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value;
    throw createCacheError(
      'PassthroughSerializer only accepts string or Buffer',
      CacheErrorCode.SERIALIZATION_FAILED,
    );
  }

  deserialize<T>(payload: CachePayload): T {
    return payload as unknown as T;
  }
}
