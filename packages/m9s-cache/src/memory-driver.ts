import type { CacheDriver, CachePayload } from './types';

interface MemoryEntry {
  value: CachePayload;
  expiresAt?: number;
}

interface MemoryHashEntry {
  fields: Map<string, CachePayload>;
  expiresAt?: number;
}

/**
 * In-memory cache driver (mainly for tests).
 */
export class MemoryCacheDriver implements CacheDriver {
  private readonly store = new Map<string, MemoryEntry>();
  private readonly hashStore = new Map<string, MemoryHashEntry>();

  async get(key: string): Promise<CachePayload | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: CachePayload, ttlSeconds?: number): Promise<void> {
    const entry: MemoryEntry = { value };
    if (ttlSeconds != null && ttlSeconds > 0) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }

    this.store.set(key, entry);
  }

  async del(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    list.forEach((key) => {
      if (this.store.delete(key)) count += 1;
      if (this.hashStore.delete(key)) count += 1;
    });
    return count;
  }

  async mget(keys: string[]): Promise<Array<CachePayload | null>> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  async mset(entries: Array<[string, CachePayload]>): Promise<void> {
    await Promise.all(entries.map(([key, value]) => this.set(key, value)));
  }

  async hset(key: string, entries: Record<string, CachePayload>): Promise<void> {
    const current = this.hashStore.get(key) ?? { fields: new Map<string, CachePayload>() };
    Object.entries(entries).forEach(([field, value]) => current.fields.set(field, value));
    this.hashStore.set(key, current);
  }

  async hget(key: string, field: string): Promise<CachePayload | null> {
    const entry = this.hashStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.hashStore.delete(key);
      return null;
    }
    return entry.fields.get(field) ?? null;
  }

  async hgetall(key: string): Promise<Record<string, CachePayload> | null> {
    const entry = this.hashStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.hashStore.delete(key);
      return null;
    }
    return Object.fromEntries(entry.fields.entries());
  }

  async keys(pattern: string): Promise<string[]> {
    const matcher = createPatternMatcher(pattern);
    const kv = Array.from(this.store.keys());
    const hashes = Array.from(this.hashStore.keys());
    return kv.concat(hashes).filter((key) => matcher(key));
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry) {
      if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
        this.store.delete(key);
      } else {
        return true;
      }
    }
    const hashEntry = this.hashStore.get(key);
    if (hashEntry) {
      if (hashEntry.expiresAt != null && hashEntry.expiresAt <= Date.now()) {
        this.hashStore.delete(key);
        return false;
      }
      return true;
    }
    return false;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
      return;
    }
    const hashEntry = this.hashStore.get(key);
    if (!hashEntry) return;
    hashEntry.expiresAt = Date.now() + ttlSeconds * 1000;
  }

  async ttl(key: string): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (entry) {
      if (entry.expiresAt == null) return -1;
      const remaining = Math.ceil((entry.expiresAt - now) / 1000);
      if (remaining <= 0) {
        this.store.delete(key);
        return -2;
      }
      return remaining;
    }

    const hashEntry = this.hashStore.get(key);
    if (hashEntry) {
      if (hashEntry.expiresAt == null) return -1;
      const remaining = Math.ceil((hashEntry.expiresAt - now) / 1000);
      if (remaining <= 0) {
        this.hashStore.delete(key);
        return -2;
      }
      return remaining;
    }

    return -2;
  }
}

function createPatternMatcher(pattern: string): (key: string) => boolean {
  const normalized = pattern.replace(/\*\*/g, '*');
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexSource = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  const regex = new RegExp(regexSource);
  return (key) => regex.test(key);
}
