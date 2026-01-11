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
}
