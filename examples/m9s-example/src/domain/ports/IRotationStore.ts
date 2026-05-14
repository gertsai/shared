// SPDX-License-Identifier: Apache-2.0
/**
 * IRotationStore — outbound port for refresh-token jti tracking.
 *
 * Wave 11.A (PRD-023) — extracted from the module-singleton in
 * `services/auth/src/rotation-store.ts` so the composition root can wire
 * either an in-memory impl (default, single-process demos) or a Redis impl
 * (production — survives restarts; required for multi-instance deploys).
 *
 * Closes audit U-6 follow-through (refresh tokens must survive process
 * restarts in production) and W-Arch-1 (DIP — actions depend on this
 * abstract port, not a concrete impl).
 *
 * Contract:
 *
 *   - `registerJti(jti, userId, exp)` — record a freshly-issued jti as
 *     `usable`. Called by login + each successful rotate.
 *
 *   - `consumeJti(jti)` — ATOMICALLY transition a jti `usable → used`.
 *     Returns the (userId, exp) on success. Failures distinguish three
 *     reasons:
 *       * `reuse` — jti was already used (treat as credential-theft
 *                   signal; caller must invoke `revokeUser`).
 *       * `expired` — past the TTL window.
 *       * `unknown` — never registered (forged or post-restart on a
 *                     non-persistent impl).
 *
 *   - `revokeUser(userId)` — mark every active jti for the user as used.
 *     Triggered on reuse detection. Returns the count of revoked jtis.
 *
 *   - `pruneJtiStore()` — sweep used + expired entries. Optional —
 *     in-memory impl needs it; Redis impl is auto-pruned by TTL.
 *
 *   - `startPruner()` — start any background work (timers, etc.).
 *     Idempotent.
 */

/** Snapshot of a successfully consumed jti. */
export interface ConsumedJti {
  readonly userId: string;
  readonly exp: number;
}

/** Failure modes surfaced from `consumeJti`. */
export type ConsumeFailureReason = 'reuse' | 'expired' | 'unknown';

/** Discriminated result of `consumeJti`. */
export type ConsumeResult =
  | { readonly ok: true; readonly record: ConsumedJti }
  | { readonly ok: false; readonly reason: ConsumeFailureReason };

/**
 * The port. Async surface — Redis impl needs awaits, in-memory impl
 * resolves synchronously but conforms to the same shape.
 */
export interface IRotationStore {
  registerJti(jti: string, userId: string, exp: number): Promise<void>;
  consumeJti(jti: string): Promise<ConsumeResult>;
  revokeUser(userId: string): Promise<number>;
  pruneJtiStore(): Promise<number>;
  startPruner(): void;
}
