// SPDX-License-Identifier: Apache-2.0
/**
 * InMemoryRotationStore — `IRotationStore` impl backed by an in-process
 * `Map<jti, JtiRecord>` (Wave 11.A / PRD-023 / RFC-016).
 *
 * Extracted from the module-singleton previously hosted in
 * `services/auth/src/rotation-store.ts`. The module-level wrappers in
 * that file now delegate to a singleton instance of this class so the
 * existing synchronous call sites (`refresh.action.ts`, `login.action.ts`)
 * keep compiling unchanged while the composition root can also instantiate
 * a fresh instance for tests / multi-tenant isolation, or swap to
 * `RedisRotationStore` for production deploys.
 *
 * Atomicity:
 *
 *   Map operations in single-threaded Node are sequenced. The
 *   read-then-write of `record.used` inside `consumeJti` happens within the
 *   same synchronous block — no `await` between the read and the flip — so
 *   no concurrent fiber can observe `used === false` after we have decided
 *   to flip it. This matches the prior module-singleton's safety guarantee.
 *
 * Closes EVID-039 P2 / W-Security-1 (DoS via unbounded jti map) by
 * scheduling a periodic prune via `startPruner()`. The interval is `.unref()`
 * so tests / short-lived workers don't get an unwanted background timer.
 */
import type {
  ConsumeResult,
  IRotationStore,
} from '../domain/ports/IRotationStore';

interface JtiRecord {
  readonly userId: string;
  /** Unix seconds. */
  readonly exp: number;
  used: boolean;
}

/**
 * Backward-compat sync `consumeJti` result. The legacy module-level
 * callers (and their tests) inspect `result.record.used` directly, so
 * the sync facade returns the underlying `JtiRecord` (which structurally
 * conforms to `ConsumedJti` — `used` is an extra property).
 */
export type ConsumeResultSync =
  | { readonly ok: true; readonly record: JtiRecord }
  | { readonly ok: false; readonly reason: 'reuse' | 'expired' | 'unknown' };

const DEFAULT_PRUNE_INTERVAL_MS = 5 * 60 * 1_000;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

/**
 * In-memory `IRotationStore`. Single-process, single-instance. Safe for
 * dev + tests; not safe for multi-worker production (use
 * `RedisRotationStore` instead).
 */
export class InMemoryRotationStore implements IRotationStore {
  private readonly store = new Map<string, JtiRecord>();
  private readonly pruneIntervalMs: number;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: { pruneIntervalMs?: number }) {
    this.pruneIntervalMs = opts?.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL_MS;
  }

  async registerJti(jti: string, userId: string, exp: number): Promise<void> {
    this._registerJtiSync(jti, userId, exp);
  }

  async consumeJti(jti: string): Promise<ConsumeResult> {
    const result = this._consumeJtiSync(jti);
    if (result.ok) {
      // Port contract returns `ConsumedJti` (userId + exp only) — strip
      // the `used` flag that the sync facade leaks for backward compat.
      return { ok: true, record: { userId: result.record.userId, exp: result.record.exp } };
    }
    return { ok: false, reason: result.reason };
  }

  async revokeUser(userId: string): Promise<number> {
    return this._revokeUserSync(userId);
  }

  async pruneJtiStore(): Promise<number> {
    return this._pruneJtiStoreSync();
  }

  // -------------------------------------------------------------------------
  // Synchronous internals — kept exposed for the module-level wrappers in
  // `services/auth/src/rotation-store.ts` which still expose a sync surface
  // for backward compat with existing call sites in `login.action.ts` and
  // `refresh.action.ts`. New code SHOULD go through the async port methods
  // above.
  // -------------------------------------------------------------------------

  /** @internal — backward-compat sync facade. */
  _registerJtiSync(jti: string, userId: string, exp: number): void {
    this.store.set(jti, { userId, exp, used: false });
  }

  /** @internal — backward-compat sync facade. */
  _consumeJtiSync(jti: string): ConsumeResultSync {
    const record = this.store.get(jti);
    if (record === undefined) {
      return { ok: false, reason: 'unknown' };
    }
    if (record.exp <= nowSeconds()) {
      this.store.delete(jti);
      return { ok: false, reason: 'expired' };
    }
    if (record.used) {
      return { ok: false, reason: 'reuse' };
    }
    // Atomic transition — single-threaded Node guarantees no fiber
    // observes `used === false` between the check above and this assign.
    record.used = true;
    return { ok: true, record };
  }

  /** @internal — backward-compat sync facade. */
  _revokeUserSync(userId: string): number {
    let count = 0;
    for (const record of this.store.values()) {
      if (record.userId === userId && !record.used) {
        record.used = true;
        count += 1;
      }
    }
    return count;
  }

  /** @internal — backward-compat sync facade. */
  _pruneJtiStoreSync(): number {
    const cutoff = nowSeconds();
    let removed = 0;
    for (const [jti, record] of this.store.entries()) {
      if (record.used || record.exp <= cutoff) {
        this.store.delete(jti);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Start the periodic prune timer. Idempotent — repeated calls are
   * no-ops. The timer is `.unref()`-ed so the Node event loop can exit
   * even when the timer is still scheduled (important for tests and
   * short-lived workers).
   */
  startPruner(): void {
    if (this.pruneTimer !== null) return;
    this.pruneTimer = setInterval(() => {
      // Fire-and-forget — `pruneJtiStore` resolves synchronously here,
      // but await-ing inside `setInterval` would swallow the rejection
      // anyway. Errors are unreachable for the Map impl.
      void this.pruneJtiStore();
    }, this.pruneIntervalMs);
    if (typeof this.pruneTimer === 'object' && this.pruneTimer !== null && 'unref' in this.pruneTimer) {
      (this.pruneTimer as { unref(): void }).unref();
    }
  }

  /**
   * Test-only — stop the timer + clear the map. Not part of the
   * `IRotationStore` port; only exposed for the module-level reset hook
   * in `services/auth/src/rotation-store.ts`.
   */
  __resetForTests(): void {
    this.store.clear();
    if (this.pruneTimer !== null) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }
}
