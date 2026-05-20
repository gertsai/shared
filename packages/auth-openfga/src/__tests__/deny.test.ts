/**
 * Tests for Deny Layer (B3.1: Instant Revoke)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryDenyLedger,
  denyAccess,
  restoreAccess,
  isDenied,
  listDeniedAccess,
  resetDenyLedger,
  getDenyLedger,
} from '../deny/index.js';

describe('InMemoryDenyLedger', () => {
  let ledger: InMemoryDenyLedger;

  beforeEach(() => {
    ledger = new InMemoryDenyLedger();
  });

  describe('deny', () => {
    it('should add a deny entry', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Access revoked',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      expect(ledger.size()).toBe(1);
    });

    it('should overwrite existing deny entry', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'First reason',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Updated reason',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      expect(ledger.size()).toBe(1);
    });
  });

  describe('allow', () => {
    it('should remove a deny entry', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Test',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      const removed = await ledger.allow('user-1', 'project', 'proj-1', 'can_view');

      expect(removed).toBe(true);
      expect(ledger.size()).toBe(0);
    });

    it('should return false if entry does not exist', async () => {
      const removed = await ledger.allow('user-1', 'project', 'proj-1', 'can_view');
      expect(removed).toBe(false);
    });
  });

  describe('check', () => {
    it('should return denied for exact match', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Banned',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      const result = await ledger.check({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
      });

      expect(result.denied).toBe(true);
      expect(result.reason).toBe('Banned');
    });

    it('should return not denied for different user', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Test',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      const result = await ledger.check({
        userId: 'user-2',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
      });

      expect(result.denied).toBe(false);
    });

    it('should match wildcard resource', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: '*',
        relation: 'can_edit',
        reason: 'No edit access',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      const result = await ledger.check({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'any-project',
        relation: 'can_edit',
      });

      expect(result.denied).toBe(true);
    });

    it('should match wildcard relation', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: '*',
        reason: 'Full block',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      const result = await ledger.check({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_delete',
      });

      expect(result.denied).toBe(true);
    });

    it('should respect TTL expiration', async () => {
      const pastDate = new Date(Date.now() - 1000);

      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Expired',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: pastDate,
      });

      const result = await ledger.check({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
      });

      expect(result.denied).toBe(false);
    });

    it('should respect future TTL', async () => {
      const futureDate = new Date(Date.now() + 60000);

      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Temporary block',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: futureDate,
      });

      const result = await ledger.check({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
      });

      expect(result.denied).toBe(true);
      expect(result.expiresAt).toEqual(futureDate);
    });
  });

  describe('listForUser', () => {
    it('should list all denies for a user', async () => {
      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Test 1',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      await ledger.deny({
        userId: 'user-1',
        resourceType: 'project',
        resourceId: 'proj-2',
        relation: 'can_edit',
        reason: 'Test 2',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      await ledger.deny({
        userId: 'user-2',
        resourceType: 'project',
        resourceId: 'proj-1',
        relation: 'can_view',
        reason: 'Other user',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });

      const denies = await ledger.listForUser('user-1');

      expect(denies).toHaveLength(2);
      expect(denies.every((d) => d.userId === 'user-1')).toBe(true);
    });
  });
});

describe('Deny Layer Convenience Functions', () => {
  beforeEach(() => {
    resetDenyLedger();
  });

  it('should deny and check access', async () => {
    await denyAccess({
      userId: 'user-1',
      resourceType: 'project',
      resourceId: 'proj-1',
      relation: 'can_view',
      reason: 'Testing',
      deniedBy: 'test',
      expiresAt: null,
    });

    const result = await isDenied({
      userId: 'user-1',
      resourceType: 'project',
      resourceId: 'proj-1',
      relation: 'can_view',
    });

    expect(result.denied).toBe(true);
  });

  it('should restore access', async () => {
    await denyAccess({
      userId: 'user-1',
      resourceType: 'project',
      resourceId: 'proj-1',
      relation: 'can_view',
      reason: 'Testing',
      deniedBy: 'test',
      expiresAt: null,
    });

    await restoreAccess('user-1', 'project', 'proj-1', 'can_view');

    const result = await isDenied({
      userId: 'user-1',
      resourceType: 'project',
      resourceId: 'proj-1',
      relation: 'can_view',
    });

    expect(result.denied).toBe(false);
  });

  it('should list denied access', async () => {
    await denyAccess({
      userId: 'user-1',
      resourceType: 'project',
      resourceId: 'proj-1',
      relation: 'can_view',
      reason: 'Test',
      deniedBy: 'test',
      expiresAt: null,
    });

    const denies = await listDeniedAccess('user-1');

    expect(denies).toHaveLength(1);
  });

  it('should use singleton ledger', () => {
    const ledger1 = getDenyLedger();
    const ledger2 = getDenyLedger();

    expect(ledger1).toBe(ledger2);
  });
});

// Wave 24 / PRD-061 FR-Y2 (closes EVID-078 H-2 — CWE-770)
describe('InMemoryDenyLedger — LRU eviction (FR-Y2)', () => {
  it('evicts the oldest entry when maxSize is exceeded', async () => {
    const ledger = new InMemoryDenyLedger({ maxSize: 2 });
    await ledger.deny({
      userId: 'u1',
      resourceType: 'project',
      resourceId: 'p1',
      relation: 'r',
      reason: 'first',
      deniedBy: 'admin',
      deniedAt: new Date(),
      expiresAt: null,
    });
    await ledger.deny({
      userId: 'u2',
      resourceType: 'project',
      resourceId: 'p2',
      relation: 'r',
      reason: 'second',
      deniedBy: 'admin',
      deniedAt: new Date(),
      expiresAt: null,
    });
    expect(ledger.size()).toBe(2);

    // 3rd insert exceeds maxSize → oldest (u1/p1) evicted.
    await ledger.deny({
      userId: 'u3',
      resourceType: 'project',
      resourceId: 'p3',
      relation: 'r',
      reason: 'third',
      deniedBy: 'admin',
      deniedAt: new Date(),
      expiresAt: null,
    });
    expect(ledger.size()).toBe(2);

    // First entry is gone, second + third remain.
    const first = await ledger.check({
      userId: 'u1',
      resourceType: 'project',
      resourceId: 'p1',
      relation: 'r',
    });
    expect(first.denied).toBe(false);

    const second = await ledger.check({
      userId: 'u2',
      resourceType: 'project',
      resourceId: 'p2',
      relation: 'r',
    });
    expect(second.denied).toBe(true);

    const third = await ledger.check({
      userId: 'u3',
      resourceType: 'project',
      resourceId: 'p3',
      relation: 'r',
    });
    expect(third.denied).toBe(true);
  });

  it('defaults to maxSize=10_000 (large enough for dev/test workloads)', async () => {
    const ledger = new InMemoryDenyLedger();
    // Insert 100 entries; should fit comfortably.
    for (let i = 0; i < 100; i++) {
      await ledger.deny({
        userId: `u${i}`,
        resourceType: 'project',
        resourceId: `p${i}`,
        relation: 'r',
        reason: 'test',
        deniedBy: 'admin',
        deniedAt: new Date(),
        expiresAt: null,
      });
    }
    expect(ledger.size()).toBe(100);
  });
});
