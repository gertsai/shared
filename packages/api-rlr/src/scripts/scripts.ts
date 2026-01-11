/* eslint-disable @typescript-eslint/no-deprecated */
/**
 * Legacy Lua scripts for backward compatibility
 * @deprecated Use limitSlightWindowMain.lua and limitGcra.lua instead
 *
 * NOTE: This file is kept ONLY for backward compatibility with RateLimitRequest.loadIncrementFWScript()
 * All production code should use the actual Lua files:
 * - limitSlightWindowMain.lua for sliding window algorithm
 * - limitGcra.lua for GCRA algorithm
 */

const scripts = {
  /**
   * Simple increment script used in legacy RateLimitRequest
   * Only used in loadIncrementFWScript() method
   */
  increment: `
      local totalHits = redis.call("INCR", KEYS[1])
      local timeToExpire = redis.call("PTTL", KEYS[1])
      if timeToExpire <= 0 or ARGV[1] == "1"
      then
        redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[2]))
        timeToExpire = tonumber(ARGV[2])
      end

      return { totalHits, timeToExpire }
		`
    .replaceAll(/^\s+/gm, '')
    .trim(),

  /**
   * Get current count and TTL - utility for debugging
   */
  get: `
      local totalHits = redis.call("GET", KEYS[1])
      local timeToExpire = redis.call("PTTL", KEYS[1])

      return { totalHits, timeToExpire }
		`
    .replaceAll(/^\s+/gm, '')
    .trim(),
};

export default scripts;

/**
 * IMPORTANT: All experimental incrementSw versions (1-17) have been removed.
 *
 * The production implementations are:
 * - src/scripts/limitSlightWindowMain.lua (Sliding Window with weighted previous window)
 * - src/scripts/limitGcra.lua (Generic Cell Rate Algorithm with burst support)
 *
 * These Lua files are loaded directly by:
 * - LuaScriptManager (current)
 * - TypedLuaScriptManager (new, type-safe)
 * - RateLimitRequest (legacy, uses LUA constant)
 * - MiddlewareFactory (new modular architecture)
 *
 * For new code, use TypedLuaScript for type-safe script execution.
 */
