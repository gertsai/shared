// SPDX-License-Identifier: Apache-2.0
/**
 * Refresh-token rotation + reuse-detection store — Wave 10.E (PRD-022).
 *
 * In-memory, single-process. A real deployment would back this with Redis
 * (per-tenant key prefix) or Postgres (small `refresh_tokens` table). The
 * interface here is the contract we'd port to either backing store.
 *
 * Three responsibilities:
 *
 *   1. `register(jti, userId, exp)` — record a freshly-issued refresh token
 *      as `usable`. Called by login + each successful rotate.
 *
 *   2. `consume(jti)` — atomically transition a jti from `usable` → `used`.
 *      Returns the (userId, exp) so the caller can mint the next refresh.
 *      Returns `null` if the jti was already used (REUSE — caller must
 *      treat this as a credential-theft signal: revoke the whole chain).
 *
 *   3. `revokeUser(userId)` — mark every jti issued to a user as `used`,
 *      forcing re-login. Triggered when reuse is detected.
 *
 * Expired jtis age out lazily on lookup; the optional `prune()` helper
 * sweeps the entire map for memory-conscious deployments / tests.
 *
 * Closes EVID-036 audit finding U-6 (no rotation / no reuse detection).
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

/**
 * Register a freshly-issued refresh-token jti as usable. Called by
 * `login.action.ts` after `signRefreshToken` and by `refresh.action.ts`
 * after each successful rotate.
 */
export function registerJti(jti: string, userId: string, exp: number): void {
  store.set(jti, { userId, exp, used: false });
}

/**
 * Atomic consume. Returns the record on success (jti was usable and not
 * expired); returns `null` on:
 *
 *   - unknown jti (never issued — forged signature is the most likely
 *     cause; signature verify already rejected the token but a race in the
 *     store could surface this);
 *   - expired jti (force re-login);
 *   - **already-used jti (REUSE — caller MUST revoke the user's chain).**
 *
 * The caller distinguishes reuse from unknown via the second return value
 * (`'reuse' | 'expired' | 'unknown'`).
 */
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
  // Atomic transition. Map operations in single-threaded Node are
  // sequenced — no concurrent mutation possible between the read above
  // and this assignment within the same async tick.
  record.used = true;
  return { ok: true, record };
}

/**
 * Revoke every jti issued to a user. Triggered by `consumeJti` returning
 * `reuse` — the assumption is that two clients now hold the same refresh
 * token (either the original or a clone after compromise); we don't know
 * which is legitimate, so we end the session for both.
 *
 * Returns the count of revoked jtis (useful for logging).
 */
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

/**
 * Sweep expired + used jtis. Optional — the map grows roughly linearly
 * with logins until pruning. The demo doesn't run this on a schedule
 * (single-process, low cardinality); a production port would call it
 * every few minutes.
 */
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

/**
 * Test-only — reset all state. Not exported via barrel; callers import
 * from this file path directly.
 */
export function __resetRotationStoreForTests(): void {
  store.clear();
}
