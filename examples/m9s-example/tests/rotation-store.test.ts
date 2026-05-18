// SPDX-License-Identifier: Apache-2.0
// Wave 12.E-fix-2 (PRD-039 FR-001 / EVID-053 CRIT-1 / CWE-613): rotation
// store now DI'd; in-memory and Redis modes both wired through composition.
/**
 * Rotation store tests — Wave 10.E (PRD-022) / EVID-039 P2 fix
 * (W-Security-5), re-pointed at the class-based `InMemoryRotationStore`
 * by Wave 12.E-fix-2 Phase 1 (PRD-039 FR-001 / EVID-053 CRIT-1).
 *
 * Pre-fix this file exercised the module-level Map facade in
 * `services/auth/src/rotation-store.ts` that the auth actions
 * static-imported. That facade has been removed (the actions now reach
 * the composition-root–selected `IRotationStore` via
 * `service.rotationStore`), so the tests now exercise the canonical
 * `InMemoryRotationStore` class directly. All security properties under
 * test are unchanged:
 *
 *   1. happy path — register → consume → mints fresh
 *   2. reuse path — register → consume → consume-again → 'reuse' (the
 *      stolen-token replay scenario)
 *   3. revokeUser — marks every active jti for a userId as used, leaves
 *      OTHER users' jtis untouched
 *   4. expiry — past-expiry jtis return 'expired' on consume + are pruned
 *   5. pruneJtiStore — sweep removes used + expired entries; preserves
 *      live entries
 *
 * The class returns Promises (matching the `IRotationStore` port surface)
 * so each call site now `await`s. The discriminated `record` on a
 * successful consume no longer carries the internal `used` flag — the
 * port contract returns `ConsumedJti` (userId + exp), which is the same
 * shape every consumer in production code observes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InMemoryRotationStore } from '../src/infrastructure/in-memory-rotation.store';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

const HOUR = 60 * 60;

describe('rotation-store (InMemoryRotationStore)', () => {
  let store: InMemoryRotationStore;

  beforeEach(() => {
    store = new InMemoryRotationStore();
  });

  afterEach(() => {
    store.__resetForTests();
  });

  describe('happy path', () => {
    it('register then consume returns ok with the original userId', async () => {
      await store.registerJti('jti-1', 'user-a', nowSeconds() + HOUR);

      const result = await store.consumeJti('jti-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.record.userId).toBe('user-a');
        // Port contract: `record` carries `userId` + `exp` only — the
        // internal `used` flag is intentionally not surfaced (the
        // sync-facade leakage that previously exposed it has been
        // removed by Wave 12.E-fix-2 Phase 1).
        expect(typeof result.record.exp).toBe('number');
      }
    });
  });

  describe('reuse detection (the core security property)', () => {
    it('consume-then-consume on the SAME jti returns reason: reuse', async () => {
      await store.registerJti('jti-1', 'user-a', nowSeconds() + HOUR);

      const first = await store.consumeJti('jti-1');
      const second = await store.consumeJti('jti-1');

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toBe('reuse');
      }
    });

    it('reuse remains reuse on any subsequent attempt', async () => {
      await store.registerJti('jti-1', 'user-a', nowSeconds() + HOUR);
      await store.consumeJti('jti-1');

      // attacker keeps trying — every replay still returns reuse, never
      // accidentally flips back to ok
      for (let i = 0; i < 5; i += 1) {
        const result = await store.consumeJti('jti-1');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('reuse');
        }
      }
    });
  });

  describe('revokeUser', () => {
    it('marks every active jti for the target user as used', async () => {
      await store.registerJti('jti-a-1', 'user-a', nowSeconds() + HOUR);
      await store.registerJti('jti-a-2', 'user-a', nowSeconds() + HOUR);
      await store.registerJti('jti-a-3', 'user-a', nowSeconds() + HOUR);

      const count = await store.revokeUser('user-a');

      expect(count).toBe(3);
      expect((await store.consumeJti('jti-a-1')).ok).toBe(false);
      expect((await store.consumeJti('jti-a-2')).ok).toBe(false);
      expect((await store.consumeJti('jti-a-3')).ok).toBe(false);
    });

    it("does NOT touch other users' jtis", async () => {
      await store.registerJti('jti-a-1', 'user-a', nowSeconds() + HOUR);
      await store.registerJti('jti-b-1', 'user-b', nowSeconds() + HOUR);

      await store.revokeUser('user-a');

      // user-b's jti is still usable — blast radius bounded to user-a
      const result = await store.consumeJti('jti-b-1');
      expect(result.ok).toBe(true);
    });

    it('does NOT double-count already-used jtis', async () => {
      await store.registerJti('jti-a-1', 'user-a', nowSeconds() + HOUR);
      await store.registerJti('jti-a-2', 'user-a', nowSeconds() + HOUR);

      // consume one first
      await store.consumeJti('jti-a-1');
      // revoke now only flips the remaining one
      const count = await store.revokeUser('user-a');

      expect(count).toBe(1);
    });

    it('returns 0 for an unknown user', async () => {
      expect(await store.revokeUser('ghost')).toBe(0);
    });
  });

  describe('expiry', () => {
    it('returns reason: expired for past-expiry jti and evicts it', async () => {
      const pastExp = nowSeconds() - 10; // 10 s ago
      await store.registerJti('jti-old', 'user-a', pastExp);

      const result = await store.consumeJti('jti-old');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('expired');
      }
      // Eviction happened — a follow-up consume reports 'unknown' (not
      // 'expired') because the entry is gone.
      const followup = await store.consumeJti('jti-old');
      expect(followup.ok).toBe(false);
      if (!followup.ok) {
        expect(followup.reason).toBe('unknown');
      }
    });
  });

  describe('unknown jti', () => {
    it('returns reason: unknown for a never-registered id', async () => {
      const result = await store.consumeJti('never-issued');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('unknown');
      }
    });
  });

  describe('pruneJtiStore', () => {
    it('removes used + expired entries; leaves live ones', async () => {
      await store.registerJti('live-1', 'user-a', nowSeconds() + HOUR);
      await store.registerJti('expired-1', 'user-b', nowSeconds() - 10);
      await store.registerJti('used-1', 'user-c', nowSeconds() + HOUR);
      await store.consumeJti('used-1'); // flip used=true

      const removed = await store.pruneJtiStore();

      expect(removed).toBe(2); // expired-1 + used-1

      // live-1 still consumable
      expect((await store.consumeJti('live-1')).ok).toBe(true);
      // expired-1 + used-1 are now 'unknown' (removed from store)
      const exp = await store.consumeJti('expired-1');
      const used = await store.consumeJti('used-1');
      expect(exp.ok).toBe(false);
      expect(used.ok).toBe(false);
      if (!exp.ok) expect(exp.reason).toBe('unknown');
      if (!used.ok) expect(used.reason).toBe('unknown');
    });

    it('is a safe no-op on empty store', async () => {
      expect(await store.pruneJtiStore()).toBe(0);
    });
  });
});
