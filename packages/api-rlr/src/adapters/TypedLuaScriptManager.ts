/**
 * Enhanced Lua script manager with full type safety
 * This is an improved version that uses TypedLuaScript for better type checking
 */

import fs from 'fs';
import path from 'path';

import type { Redis } from 'ioredis';

import { LuaScriptFactory, TypedScriptManager } from '../scripts/TypedLuaScript';
import type { GCRAScriptResult, SlidingWindowScriptResult } from '../scripts/TypedLuaScript';
import type { RLRRedis } from '../utils/types';

// Internal type for tracking script definition
type RLRRedisWithMarker = RLRRedis & {
  __RLR_LUA_DEFINED__?: boolean;
  __RLR_TYPED_SCRIPTS__?: TypedScriptManager;
};

/**
 * Enhanced Lua script manager with type safety
 */
export class TypedLuaScriptManager {
  private static readonly SLIDING_WINDOW_SCRIPT = fs.readFileSync(
    path.join(__dirname, '../scripts/limitSlightWindowMain.lua'),
    'utf8',
  );

  private static readonly GCRA_SCRIPT = fs.readFileSync(
    path.join(__dirname, '../scripts/limitGcra.lua'),
    'utf8',
  );

  /**
   * Get or create typed script manager for a store
   */
  private static getOrCreateScriptManager(store: RLRRedis): TypedScriptManager {
    const s = store as RLRRedisWithMarker;

    if (!s.__RLR_TYPED_SCRIPTS__) {
      s.__RLR_TYPED_SCRIPTS__ = new TypedScriptManager();

      // Register typed scripts
      s.__RLR_TYPED_SCRIPTS__.register(
        'slidingWindow',
        LuaScriptFactory.createSlidingWindowScript(this.SLIDING_WINDOW_SCRIPT),
      );

      s.__RLR_TYPED_SCRIPTS__.register('gcra', LuaScriptFactory.createGCRAScript(this.GCRA_SCRIPT));
    }

    return s.__RLR_TYPED_SCRIPTS__;
  }

  /**
   * Ensure scripts are loaded and commands are defined
   */
  static async ensureDefined(store: RLRRedis): Promise<void> {
    const s = store as RLRRedisWithMarker;

    // Skip if already defined
    if (s.__RLR_LUA_DEFINED__) {
      return;
    }

    // Load typed scripts
    const manager = this.getOrCreateScriptManager(store);
    await manager.loadAll(store as unknown as Redis);

    // Define legacy commands for backward compatibility
    store.defineCommand('incrementSW', {
      lua: this.SLIDING_WINDOW_SCRIPT,
      numberOfKeys: 1,
    });

    store.defineCommand('gcraCheck', {
      lua: this.GCRA_SCRIPT,
      numberOfKeys: 1,
    });

    s.__RLR_LUA_DEFINED__ = true;
  }

  /**
   * Execute sliding window check with full type safety
   */
  static async executeSlidingWindow(
    store: RLRRedis,
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
  ): Promise<SlidingWindowScriptResult> {
    await this.ensureDefined(store);

    const manager = this.getOrCreateScriptManager(store);
    const script = manager.get<[string], [number, number, number], SlidingWindowScriptResult>(
      'slidingWindow',
    );

    if (!script) {
      throw new Error('Sliding window script not registered');
    }

    return script.execute(store as unknown as Redis, [key], [timeFrame, limit, now]);
  }

  /**
   * Execute GCRA check with full type safety
   */
  static async executeGCRA(
    store: RLRRedis,
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
  ): Promise<GCRAScriptResult> {
    await this.ensureDefined(store);

    const manager = this.getOrCreateScriptManager(store);
    const script = manager.get<[string], [number, number, number, number], GCRAScriptResult>(
      'gcra',
    );

    if (!script) {
      throw new Error('GCRA script not registered');
    }

    return script.execute(store as unknown as Redis, [key], [timeFrame, limit, burst, now]);
  }

  /**
   * Check if scripts are loaded in Redis
   */
  static async checkScriptsLoaded(store: RLRRedis): Promise<Map<string, boolean>> {
    const manager = this.getOrCreateScriptManager(store);
    return manager.checkAll(store as unknown as Redis);
  }

  /**
   * Force reload all scripts
   */
  static async reloadScripts(store: RLRRedis): Promise<void> {
    const s = store as RLRRedisWithMarker;
    s.__RLR_LUA_DEFINED__ = false;
    await this.ensureDefined(store);
  }

  /**
   * Get script SHA for monitoring
   */
  static getScriptSHA(store: RLRRedis, scriptName: 'slidingWindow' | 'gcra'): string | undefined {
    const manager = this.getOrCreateScriptManager(store);
    const script = manager.get(scriptName);
    return script?.getSha();
  }
}
