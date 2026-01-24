import type { RLRRedis } from '../utils/types';

import { LuaScriptManager } from './LuaScriptManager';
import type { GCRAResult, SlidingWindowResult, StorageAdapter } from './StorageAdapter';

export class RedisAdapter implements StorageAdapter {
  constructor(private readonly store: RLRRedis) {}

  async incrementSW(
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
  ): Promise<SlidingWindowResult> {
    LuaScriptManager.ensureDefined(this.store);
    if (!this.store.incrementSW) {
      throw new Error('incrementSW method not available');
    }
    return this.store.incrementSW(key, timeFrame, limit, now);
  }

  async gcraCheck(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
  ): Promise<GCRAResult> {
    LuaScriptManager.ensureDefined(this.store);
    if (!this.store.gcraCheck) {
      throw new Error('GCRA check method not available');
    }
    return this.store.gcraCheck(key, timeFrame, limit, burst, now);
  }

  /**
   * Get current time from Redis server
   * Uses Redis TIME command which returns [seconds, microseconds]
   * Converts to milliseconds for consistency with Date.now()
   */
  async getTime(): Promise<number> {
    const time = await this.store.time();
    // Redis TIME returns [seconds, microseconds] - may be strings or numbers
    const seconds = typeof time[0] === 'string' ? parseInt(time[0], 10) : Number(time[0]);
    const microseconds = typeof time[1] === 'string' ? parseInt(time[1], 10) : Number(time[1]);
    // Convert to milliseconds
    return seconds * 1000 + Math.floor(microseconds / 1000);
  }
}
