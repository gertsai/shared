// SPDX-License-Identifier: Apache-2.0
/**
 * Rotation store tests — Wave 10.E (PRD-022) / EVID-039 P2 fix (W-Security-5).
 *
 * The rotation store is the security-critical primitive defending against
 * refresh-token replay (audit U-6). It MUST be tested for:
 *
 *   1. happy path — register → consume → mints fresh
 *   2. reuse path — register → consume → consume-again → 'reuse' (the
 *      stolen-token replay scenario)
 *   3. revokeUser — marks every active jti for a userId as used, leaves
 *      OTHER users' jtis untouched
 *   4. expiry — past-expiry jtis return 'expired' on consume + are pruned
 *   5. pruneJtiStore — sweep removes used + expired entries; preserves
 *      live entries
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetRotationStoreForTests,
  consumeJti,
  pruneJtiStore,
  registerJti,
  revokeUser,
} from '../src/services/auth/src/rotation-store';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

const HOUR = 60 * 60;

describe('rotation-store', () => {
  afterEach(() => {
    __resetRotationStoreForTests();
  });

  describe('happy path', () => {
    it('register then consume returns ok with the original userId', () => {
      registerJti('jti-1', 'user-a', nowSeconds() + HOUR);

      const result = consumeJti('jti-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.record.userId).toBe('user-a');
        expect(result.record.used).toBe(true); // flipped atomically
      }
    });
  });

  describe('reuse detection (the core security property)', () => {
    it('consume-then-consume on the SAME jti returns reason: reuse', () => {
      registerJti('jti-1', 'user-a', nowSeconds() + HOUR);

      const first = consumeJti('jti-1');
      const second = consumeJti('jti-1');

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toBe('reuse');
      }
    });

    it('reuse remains reuse on any subsequent attempt', () => {
      registerJti('jti-1', 'user-a', nowSeconds() + HOUR);
      consumeJti('jti-1');

      // attacker keeps trying — every replay still returns reuse, never
      // accidentally flips back to ok
      for (let i = 0; i < 5; i += 1) {
        const result = consumeJti('jti-1');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('reuse');
        }
      }
    });
  });

  describe('revokeUser', () => {
    it('marks every active jti for the target user as used', () => {
      registerJti('jti-a-1', 'user-a', nowSeconds() + HOUR);
      registerJti('jti-a-2', 'user-a', nowSeconds() + HOUR);
      registerJti('jti-a-3', 'user-a', nowSeconds() + HOUR);

      const count = revokeUser('user-a');

      expect(count).toBe(3);
      expect(consumeJti('jti-a-1').ok).toBe(false);
      expect(consumeJti('jti-a-2').ok).toBe(false);
      expect(consumeJti('jti-a-3').ok).toBe(false);
    });

    it('does NOT touch other users\' jtis', () => {
      registerJti('jti-a-1', 'user-a', nowSeconds() + HOUR);
      registerJti('jti-b-1', 'user-b', nowSeconds() + HOUR);

      revokeUser('user-a');

      // user-b's jti is still usable — blast radius bounded to user-a
      const result = consumeJti('jti-b-1');
      expect(result.ok).toBe(true);
    });

    it('does NOT double-count already-used jtis', () => {
      registerJti('jti-a-1', 'user-a', nowSeconds() + HOUR);
      registerJti('jti-a-2', 'user-a', nowSeconds() + HOUR);

      // consume one first
      consumeJti('jti-a-1');
      // revoke now only flips the remaining one
      const count = revokeUser('user-a');

      expect(count).toBe(1);
    });

    it('returns 0 for an unknown user', () => {
      expect(revokeUser('ghost')).toBe(0);
    });
  });

  describe('expiry', () => {
    it('returns reason: expired for past-expiry jti and evicts it', () => {
      const pastExp = nowSeconds() - 10; // 10 s ago
      registerJti('jti-old', 'user-a', pastExp);

      const result = consumeJti('jti-old');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('expired');
      }
      // Eviction happened — a follow-up consume reports 'unknown' (not
      // 'expired') because the entry is gone.
      const followup = consumeJti('jti-old');
      expect(followup.ok).toBe(false);
      if (!followup.ok) {
        expect(followup.reason).toBe('unknown');
      }
    });
  });

  describe('unknown jti', () => {
    it('returns reason: unknown for a never-registered id', () => {
      const result = consumeJti('never-issued');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('unknown');
      }
    });
  });

  describe('pruneJtiStore', () => {
    it('removes used + expired entries; leaves live ones', () => {
      registerJti('live-1', 'user-a', nowSeconds() + HOUR);
      registerJti('expired-1', 'user-b', nowSeconds() - 10);
      registerJti('used-1', 'user-c', nowSeconds() + HOUR);
      consumeJti('used-1'); // flip used=true

      const removed = pruneJtiStore();

      expect(removed).toBe(2); // expired-1 + used-1

      // live-1 still consumable
      expect(consumeJti('live-1').ok).toBe(true);
      // expired-1 + used-1 are now 'unknown' (removed from store)
      const exp = consumeJti('expired-1');
      const used = consumeJti('used-1');
      expect(exp.ok).toBe(false);
      expect(used.ok).toBe(false);
      if (!exp.ok) expect(exp.reason).toBe('unknown');
      if (!used.ok) expect(used.reason).toBe('unknown');
    });

    it('is a safe no-op on empty store', () => {
      expect(pruneJtiStore()).toBe(0);
    });
  });
});
