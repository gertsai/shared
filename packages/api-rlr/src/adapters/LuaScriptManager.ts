import { loadLuaScript } from '../lua-loader';
import type { RLRRedis } from '../utils/types';

// Internal type for tracking script definition
type RLRRedisWithMarker = RLRRedis & { __RLR_LUA_DEFINED__?: boolean };

/**
 * Ensures Redis custom commands for rate limiting are defined on the client.
 * Idempotent: uses a marker flag on the client to avoid redefining.
 */
export class LuaScriptManager {
  static ensureDefined(store: RLRRedis): void {
    const s = store as RLRRedisWithMarker;
    if (s.__RLR_LUA_DEFINED__) {
      return;
    }

    const incrementSW = loadLuaScript('limitSlightWindowMain');
    const gcra = loadLuaScript('limitGcra');

    store.defineCommand('incrementSW', { lua: incrementSW, numberOfKeys: 1 });
    store.defineCommand('gcraCheck', { lua: gcra, numberOfKeys: 1 });

    s.__RLR_LUA_DEFINED__ = true;
  }
}
