// SPDX-License-Identifier: Apache-2.0
/**
 * Refresh-token rotation + reuse-detection store — module-level sync facade
 * for the legacy intra-service callers (`login.action.ts` + `refresh.action.ts`).
 *
 * Wave 11.A (PRD-023) extracted the abstract port to
 * `src/domain/ports/IRotationStore.ts` and added a class-based
 * `InMemoryRotationStore` + `RedisRotationStore` in `src/infrastructure/`
 * for the composition-root DI path. This file keeps the original
 * synchronous Map-based implementation in-place so the existing action
 * call sites (which call `consumeJti(...).ok` without `await`) keep working
 * unchanged, AND so the hex-layer boundary (ADR-002) is respected — the
 * services layer must NOT import from `infrastructure/`. New code (e.g.
 * the composition-root path through `SharedInfrastructure.rotationStore`)
 * uses the class-based impls in `infrastructure/` directly.
 *
 * Three responsibilities (unchanged from Wave 10.E):
 *
 *   1. `registerJti(jti, userId, exp)` — record a freshly-issued refresh
 *      token as `usable`. Called by login + each successful rotate.
 *
 *   2. `consumeJti(jti)` — atomically transition a jti `usable → used`.
 *      Returns the (userId, exp) on success. Returns `{ok: false, reason}`
 *      on reuse / expired / unknown.
 *
 *   3. `revokeUser(userId)` — mark every active jti issued to a user as
 *      `used`, forcing re-login. Triggered when reuse is detected.
 *
 * Closes EVID-036 audit finding U-6 (rotation + reuse detection).
 * Closes EVID-039 P2 / W-Security-1 (DoS via unbounded jti map) — the
 * periodic prune timer is below.
 */

interface JtiRecord {
  readonly userId: string;
  /** Unix seconds. */
  readonly exp: number;
  used: boolean;
}

const store = new Map<string, JtiRecord>();

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

export function registerJti(jti: string, userId: string, exp: number): void {
  store.set(jti, { userId, exp, used: false });
}

export function consumeJti(
  jti: string,
): { ok: true; record: JtiRecord } | { ok: false; reason: 'reuse' | 'expired' | 'unknown' } {
  const record = store.get(jti);
  if (record === undefined) {
    return { ok: false, reason: 'unknown' };
  }
  if (record.exp <= nowSeconds()) {
    store.delete(jti);
    return { ok: false, reason: 'expired' };
  }
  if (record.used) {
    return { ok: false, reason: 'reuse' };
  }
  // Atomic transition. Map operations in single-threaded Node are sequenced
  // — no concurrent mutation between the read above and the assignment here
  // (no `await` between them).
  record.used = true;
  return { ok: true, record };
}

export function revokeUser(userId: string): number {
  let count = 0;
  for (const record of store.values()) {
    if (record.userId === userId && !record.used) {
      record.used = true;
      count += 1;
    }
  }
  return count;
}

export function pruneJtiStore(): number {
  const cutoff = nowSeconds();
  let removed = 0;
  for (const [jti, record] of store.entries()) {
    if (record.used || record.exp <= cutoff) {
      store.delete(jti);
      removed += 1;
    }
  }
  return removed;
}

export function __resetRotationStoreForTests(): void {
  store.clear();
  if (pruneTimer !== null) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

// EVID-039 P2 / W-Security-1 fix: periodic prune timer to bound memory.
const PRUNE_INTERVAL_MS = 5 * 60 * 1_000;
let pruneTimer: ReturnType<typeof setInterval> | null = null;

export function startRotationPruner(): void {
  if (pruneTimer !== null) return;
  pruneTimer = setInterval(pruneJtiStore, PRUNE_INTERVAL_MS);
  if (typeof pruneTimer === 'object' && pruneTimer !== null && 'unref' in pruneTimer) {
    (pruneTimer as { unref(): void }).unref();
  }
}
