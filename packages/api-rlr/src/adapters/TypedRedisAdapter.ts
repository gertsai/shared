/**
 * Type-safe Redis adapter using TypedLuaScript
 * This adapter provides full type safety for Lua script execution
 */

import type { RLRRedis } from '../utils/types';

import type { GCRAResult, SlidingWindowResult, StorageAdapter } from './StorageAdapter';
import { TypedLuaScriptManager } from './TypedLuaScriptManager';

/**
 * Redis adapter with full type safety for Lua scripts
 */
export class TypedRedisAdapter implements StorageAdapter {
  constructor(private readonly store: RLRRedis) {}

  async incrementSW(
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
  ): Promise<SlidingWindowResult> {
    // Use typed script execution
    const result = await TypedLuaScriptManager.executeSlidingWindow(
      this.store,
      key,
      timeFrame,
      limit,
      now,
    );

    // Convert typed result to expected format
    return [
      result[0], // allow flag (0 or 1)
      result[1], // hits
      result[2], // ttl
    ];
  }

  async gcraCheck(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
  ): Promise<GCRAResult> {
    // Use typed script execution
    const result = await TypedLuaScriptManager.executeGCRA(
      this.store,
      key,
      timeFrame,
      limit,
      burst,
      now,
    );

    // Convert typed result to expected format
    return [
      result[0], // allow flag (0 or 1)
      result[1], // remaining
      result[2], // retry after
    ];
  }

  /**
   * Check if scripts are loaded (for health checks)
   */
  async checkScriptsLoaded(): Promise<boolean> {
    const status = await TypedLuaScriptManager.checkScriptsLoaded(this.store);
    return Array.from(status.values()).every((loaded) => loaded);
  }

  /**
   * Force reload scripts (for recovery scenarios)
   */
  async reloadScripts(): Promise<void> {
    await TypedLuaScriptManager.reloadScripts(this.store);
  }

  /**
   * Get script SHA for monitoring
   */
  getScriptSHA(scriptName: 'slidingWindow' | 'gcra'): string | undefined {
    return TypedLuaScriptManager.getScriptSHA(this.store, scriptName);
  }
}
