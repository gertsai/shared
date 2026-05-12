/**
 * Type-safe Lua script wrapper
 * This is a proposed improvement for better type safety with Lua scripts
 */

import type { Redis } from 'ioredis';

/**
 * Type-safe wrapper for Lua scripts with automatic SHA caching
 * and NOSCRIPT handling
 */
export class TypedLuaScript<
  TKeys extends readonly string[],
  TArgs extends readonly any[],
  TResult,
> {
  private sha?: string;
  private loadPromise?: Promise<string>;

  constructor(
    private readonly script: string,
    private readonly name: string,
  ) {}

  /**
   * Execute the Lua script with type-safe parameters
   */
  async execute(store: Redis, keys: TKeys, args: TArgs): Promise<TResult> {
    // Ensure script is loaded
    if (!this.sha && !this.loadPromise) {
      this.loadPromise = this.loadScript(store);
    }

    if (this.loadPromise) {
      this.sha = await this.loadPromise;
      delete this.loadPromise;
    }

    try {
      // Try to execute using SHA first (faster)
      if (this.sha) {
        return (await store.evalsha(
          this.sha,
          keys.length,
          ...keys,
          ...args.map((arg) => String(arg)),
        )) as TResult;
      }

      // Fallback to direct script execution
      return await this.executeDirect(store, keys, args);
    } catch (error) {
      // Handle NOSCRIPT error by reloading and retrying
      if (error instanceof Error && error.message?.includes('NOSCRIPT')) {
        console.warn(`[TypedLuaScript] Script ${this.name} not in cache, reloading...`);
        this.sha = await this.loadScript(store);
        return (await store.evalsha(
          this.sha,
          keys.length,
          ...keys,
          ...args.map((arg) => String(arg)),
        )) as TResult;
      }
      throw error;
    }
  }

  /**
   * Execute script directly without SHA
   */
  private async executeDirect(store: Redis, keys: TKeys, args: TArgs): Promise<TResult> {
    const result = (await store.eval(
      this.script,
      keys.length,
      ...keys,
      ...args.map((arg) => String(arg)),
    )) as TResult;

    // Try to cache SHA for next time
    this.loadScript(store)
      .then((sha) => {
        this.sha = sha;
      })
      .catch(() => {
        // Ignore load errors, will retry next time
      });

    return result;
  }

  /**
   * Load script to Redis and get SHA
   */
  private async loadScript(store: Redis): Promise<string> {
    return (await store.script('LOAD', this.script)) as string;
  }

  /**
   * Check if script is loaded in Redis
   */
  async isLoaded(store: Redis): Promise<boolean> {
    if (!this.sha) {
      return false;
    }

    try {
      const exists = (await store.script('EXISTS', this.sha)) as number[];
      return exists[0] === 1;
    } catch {
      return false;
    }
  }

  /**
   * Force reload the script
   */
  async reload(store: Redis): Promise<void> {
    this.sha = await this.loadScript(store);
  }

  /**
   * Get script SHA (if loaded)
   */
  getSha(): string | undefined {
    return this.sha;
  }
}

/**
 * Typed result for Sliding Window algorithm
 */
export type SlidingWindowScriptResult = readonly [allow: 0 | 1, hits: number, ttl: number];

/**
 * Typed result for GCRA algorithm
 */
export type GCRAScriptResult = readonly [allow: 0 | 1, remaining: number, retryAfter: number];

/**
 * Factory for creating typed Lua scripts
 */
export class LuaScriptFactory {
  /**
   * Create a typed Sliding Window script
   */
  static createSlidingWindowScript(
    script: string,
  ): TypedLuaScript<
    [key: string],
    [timeFrame: number, limit: number, now: number],
    SlidingWindowScriptResult
  > {
    return new TypedLuaScript(script, 'sliding_window');
  }

  /**
   * Create a typed GCRA script
   */
  static createGCRAScript(
    script: string,
  ): TypedLuaScript<
    [key: string],
    [timeFrame: number, limit: number, burst: number, now: number],
    GCRAScriptResult
  > {
    return new TypedLuaScript(script, 'gcra');
  }
}

/**
 * Script manager with type safety
 */
export class TypedScriptManager {
  private readonly scripts = new Map<string, TypedLuaScript<any, any, any>>();

  /**
   * Register a script
   */
  register<TKeys extends readonly string[], TArgs extends readonly any[], TResult>(
    name: string,
    script: TypedLuaScript<TKeys, TArgs, TResult>,
  ): void {
    this.scripts.set(name, script);
  }

  /**
   * Get a registered script
   */
  get<TKeys extends readonly string[], TArgs extends readonly any[], TResult>(
    name: string,
  ): TypedLuaScript<TKeys, TArgs, TResult> | undefined {
    return this.scripts.get(name) as TypedLuaScript<TKeys, TArgs, TResult> | undefined;
  }

  /**
   * Load all scripts to Redis
   */
  async loadAll(store: Redis): Promise<void> {
    const promises = Array.from(this.scripts.values()).map((script) => script.reload(store));
    await Promise.all(promises);
  }

  /**
   * Check if all scripts are loaded
   */
  async checkAll(store: Redis): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, script] of this.scripts.entries()) {
      results.set(name, await script.isLoaded(store));
    }

    return results;
  }
}

/**
 * Example usage with full type safety
 */
export class TypedRedisOperations {
  private readonly slidingWindowScript: TypedLuaScript<
    [string],
    [number, number, number],
    SlidingWindowScriptResult
  >;

  private readonly gcraScript: TypedLuaScript<
    [string],
    [number, number, number, number],
    GCRAScriptResult
  >;

  constructor(slidingWindowLua: string, gcraLua: string) {
    this.slidingWindowScript = LuaScriptFactory.createSlidingWindowScript(slidingWindowLua);
    this.gcraScript = LuaScriptFactory.createGCRAScript(gcraLua);
  }

  async checkSlidingWindow(
    store: Redis,
    key: string,
    timeFrame: number,
    limit: number,
  ): Promise<{ allowed: boolean; hits: number; ttl: number }> {
    const [allow, hits, ttl] = await this.slidingWindowScript.execute(
      store,
      [key],
      [timeFrame, limit, Date.now()],
    );

    return {
      allowed: allow === 1,
      hits,
      ttl,
    };
  }

  async checkGCRA(
    store: Redis,
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
    const [allow, remaining, retryAfter] = await this.gcraScript.execute(
      store,
      [key],
      [timeFrame, limit, burst, Date.now()],
    );

    return {
      allowed: allow === 1,
      remaining,
      retryAfter,
    };
  }
}
