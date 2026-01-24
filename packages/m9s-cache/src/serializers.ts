import type { CachePayload, CacheSerializer } from './types';

/**
 * JSON serializer for cache values.
 */
export class JsonSerializer implements CacheSerializer {
  serialize(value: unknown): CachePayload {
    return JSON.stringify(value);
  }

  deserialize<T>(payload: CachePayload): T {
    const text = Buffer.isBuffer(payload) ? payload.toString('utf-8') : payload;
    return JSON.parse(text) as T;
  }
}
