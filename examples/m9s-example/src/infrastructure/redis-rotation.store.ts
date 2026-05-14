// SPDX-License-Identifier: Apache-2.0
/**
 * RedisRotationStore — `IRotationStore` impl backed by Redis (Wave 11.A /
 * PRD-023 / RFC-016).
 *
 * Closes audit U-6 follow-through (refresh-token state must survive
 * process restarts in production) + multi-instance deploys (every node
 * sees the same jti map, so reuse-detection works across the cluster).
 *
 * Key shape:
 *
 *   `<prefix>:jti:<id>` → JSON `{userId, exp, used}` with TTL set so Redis
 *   auto-evicts entries the instant they expire (no manual prune needed).
 *
 * Atomicity is enforced by Lua scripts invoked via `redis.eval` (a Redis
 * server-side primitive, NOT JavaScript `eval`):
 *
 *   - `consumeJti` reads the record, checks expiry, checks `used`, and
 *     flips `used -> true` in a single atomic script execution. Redis
 *     guarantees scripts run uninterrupted, so the read-then-write window
 *     visible to multiple clients is closed.
 *
 *   - `revokeUser` SCANs the keyspace under `<prefix>:jti:*` (NOT `KEYS *`
 *     — production-unsafe; SCAN is incremental, cooperative, and bounded
 *     by `COUNT` per pass) and flips `used` for every key whose userId
 *     matches the target. The per-key flip uses a small Lua script so
 *     the read + write happen atomically and we never clobber a record
 *     that another consume just flipped.
 *
 * `pruneJtiStore` is a no-op — Redis TTL handles eviction automatically.
 * `startPruner` is a no-op for the same reason.
 */
import type IORedis from 'ioredis';

import type {
  ConsumeResult,
  IRotationStore,
} from '../domain/ports/IRotationStore';

interface JtiRecordPayload {
  userId: string;
  exp: number;
  used: boolean;
}

const DEFAULT_KEY_PREFIX = 'm9s:auth';

// Server-side Lua executed inside Redis via EVAL. This is Redis Lua, NOT
// JavaScript eval — the script body runs inside the Redis VM, atomically,
// with no access to the host process.
//
//   KEYS[1] = `<prefix>:jti:<id>`
//   ARGV[1] = current Unix-seconds timestamp
//
// Encoding the result as JSON keeps the type story simple — Redis Lua's
// return-type marshalling is awkward across (string|number|table|nil), but
// `cjson.encode` <-> `JSON.parse` is unambiguous.
const CONSUME_SCRIPT = [
  "local raw = redis.call('GET', KEYS[1])",
  "if not raw then return cjson.encode({ok=false, reason='unknown'}) end",
  'local rec = cjson.decode(raw)',
  'local nowSec = tonumber(ARGV[1])',
  'if rec.exp <= nowSec then',
  "  redis.call('DEL', KEYS[1])",
  "  return cjson.encode({ok=false, reason='expired'})",
  'end',
  'if rec.used then',
  "  return cjson.encode({ok=false, reason='reuse'})",
  'end',
  'rec.used = true',
  "redis.call('SET', KEYS[1], cjson.encode(rec), 'KEEPTTL')",
  'return cjson.encode({ok=true, record={userId=rec.userId, exp=rec.exp}})',
].join('\n');

// Per-key revoke. Returns 1 if the record was flipped from
// `used=false -> true`, 0 otherwise (already used, expired, or different
// user).
//
//   KEYS[1] = `<prefix>:jti:<id>`
//   ARGV[1] = expected userId
const REVOKE_KEY_SCRIPT = [
  "local raw = redis.call('GET', KEYS[1])",
  'if not raw then return 0 end',
  'local rec = cjson.decode(raw)',
  'if rec.userId ~= ARGV[1] then return 0 end',
  'if rec.used then return 0 end',
  'rec.used = true',
  "redis.call('SET', KEYS[1], cjson.encode(rec), 'KEEPTTL')",
  'return 1',
].join('\n');

export interface RedisRotationStoreOptions {
  readonly keyPrefix?: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

/**
 * Redis-backed `IRotationStore`. Safe for multi-instance production
 * deploys — every node binds to the same Redis and sees the same jti
 * map.
 */
export class RedisRotationStore implements IRotationStore {
  private readonly redis: IORedis;
  private readonly keyPrefix: string;

  constructor(redis: IORedis, opts?: RedisRotationStoreOptions) {
    this.redis = redis;
    this.keyPrefix = opts?.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  private key(jti: string): string {
    return `${this.keyPrefix}:jti:${jti}`;
  }

  private scanMatchPattern(): string {
    return `${this.keyPrefix}:jti:*`;
  }

  async registerJti(jti: string, userId: string, exp: number): Promise<void> {
    const ttl = exp - nowSeconds();
    const payload: JtiRecordPayload = { userId, exp, used: false };
    const value = JSON.stringify(payload);
    if (ttl > 0) {
      // EX (seconds) is precise enough for refresh-token exp granularity.
      await this.redis.set(this.key(jti), value, 'EX', ttl);
    } else {
      // Already-expired jti — write it so a follow-up consume returns
      // 'expired' instead of 'unknown' (matches in-memory semantics for
      // post-restart edge cases). 1-second floor TTL so Redis auto-evicts.
      await this.redis.set(this.key(jti), value, 'EX', 1);
    }
  }

  async consumeJti(jti: string): Promise<ConsumeResult> {
    // `eval` here is the IORedis client method that ships a Lua script
    // to the Redis server for atomic execution. It is NOT JavaScript
    // `eval` and does not execute any host-process code.
    const raw = (await (this.redis as unknown as {
      eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
    }).eval(CONSUME_SCRIPT, 1, this.key(jti), String(nowSeconds()))) as unknown;
    if (typeof raw !== 'string') {
      // Defensive: Lua should always return a string. Treat anomalies
      // as 'unknown' so the caller fails closed.
      return { ok: false, reason: 'unknown' };
    }
    const decoded = JSON.parse(raw) as
      | { ok: true; record: { userId: string; exp: number } }
      | { ok: false; reason: 'reuse' | 'expired' | 'unknown' };
    if (decoded.ok) {
      return { ok: true, record: decoded.record };
    }
    return { ok: false, reason: decoded.reason };
  }

  async revokeUser(userId: string): Promise<number> {
    let cursor = '0';
    let revoked = 0;
    const pattern = this.scanMatchPattern();
    // Cap iterations defensively to avoid an unbounded loop on a hostile
    // keyspace. 10_000 passes x COUNT=500 = 5M keys scanned worst-case;
    // well beyond any realistic jti cardinality.
    for (let i = 0; i < 10_000; i += 1) {
      // SCAN is the production-safe alternative to KEYS — incremental
      // and non-blocking. COUNT is a HINT (Redis may return more or
      // fewer keys per pass).
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        '500',
      );
      cursor = next;
      for (const key of batch) {
        // Per-key atomic flip — Redis-side Lua script keeps read+write
        // under one atomic op so a concurrent consume can't race us into
        // clobbering its own `used = true` flip.
        const flipped = (await (this.redis as unknown as {
          eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
        }).eval(REVOKE_KEY_SCRIPT, 1, key, userId)) as unknown;
        if (flipped === 1) revoked += 1;
      }
      if (cursor === '0') break;
    }
    return revoked;
  }

  async pruneJtiStore(): Promise<number> {
    // No-op — Redis evicts via TTL automatically. Returning 0 matches
    // the port contract (the count of entries swept by this call).
    return 0;
  }

  /**
   * No-op — Redis handles eviction via TTL. Kept on the surface so the
   * composition root can call `.startPruner()` uniformly regardless of
   * impl.
   */
  startPruner(): void {
    // intentional no-op
  }
}
