/**
 * Tests for Memory Deny Ledger Provider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryDenyLedger } from '../providers/memory';
import type { DenyEntryCreate } from '../types';

describe('MemoryDenyLedger', () => {
  let ledger: MemoryDenyLedger;

  beforeEach(async () => {
    ledger = new MemoryDenyLedger({ maxCacheSize: 100 });
    await ledger.initialize();
  });

  afterEach(async () => {
    await ledger.close();
  });

  describe('deny()', () => {
    it('should create a deny entry', async () => {
      const entry = await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'brute-force',
      });

      expect(entry.id).toBeDefined();
      expect(entry.tenantId).toBe('tenant-1');
      expect(entry.subjectType).toBe('user');
      expect(entry.subjectId).toBe('user-123');
      expect(entry.reason).toBe('brute-force');
      expect(entry.createdAt).toBeInstanceOf(Date);
    });

    it('should overwrite existing entry with same key', async () => {
      const entry1 = await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'brute-force',
      });

      const entry2 = await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'manual-block',
      });

      expect(entry1.id).not.toBe(entry2.id);

      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
      });

      expect(result.denied).toBe(true);
      expect(result.entry?.reason).toBe('manual-block');
    });
  });

  describe('isDenied()', () => {
    it('should return denied=false for non-existent entry', async () => {
      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
      });

      expect(result.denied).toBe(false);
      expect(result.entry).toBeUndefined();
    });

    it('should return denied=true for existing entry', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'revoked',
      });

      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
      });

      expect(result.denied).toBe(true);
      expect(result.entry?.subjectId).toBe('user-123');
      expect(result.message).toBe('Access denied: revoked');
    });

    it('should match global deny (no resource specified)', async () => {
      // Deny user globally (no resourceType/resourceId)
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'suspended',
      });

      // Should match when checking for specific resource
      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        resourceType: 'document',
        resourceId: 'doc-456',
      });

      expect(result.denied).toBe(true);
    });

    it('should not cross tenant boundaries', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'revoked',
      });

      const result = await ledger.isDenied({
        tenantId: 'tenant-2', // Different tenant
        subjectType: 'user',
        subjectId: 'user-123',
      });

      expect(result.denied).toBe(false);
    });

    it('should check tenant-wide suspension', async () => {
      // Suspend entire tenant
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'tenant',
        subjectId: 'tenant-1',
        reason: 'suspended',
      });

      // Should deny any user in that tenant
      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-456', // Any user
      });

      expect(result.denied).toBe(true);
      expect(result.entry?.subjectType).toBe('tenant');
    });

    it('should ignore expired entries', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'brute-force',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
      });

      expect(result.denied).toBe(false);
    });
  });

  describe('allow()', () => {
    it('should remove a deny entry', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'revoked',
      });

      await ledger.allow('tenant-1', 'user', 'user-123');

      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
      });

      expect(result.denied).toBe(false);
    });

    it('should not fail when entry does not exist', async () => {
      await expect(ledger.allow('tenant-1', 'user', 'non-existent')).resolves.toBeUndefined();
    });
  });

  describe('allowById()', () => {
    it('should remove entry by ID', async () => {
      const entry = await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'revoked',
      });

      await ledger.allowById(entry.id);

      const result = await ledger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
      });

      expect(result.denied).toBe(false);
    });
  });

  describe('get()', () => {
    it('should return entry by ID', async () => {
      const created = await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-123',
        reason: 'revoked',
      });

      const entry = await ledger.get(created.id);

      expect(entry).not.toBeNull();
      expect(entry?.id).toBe(created.id);
    });

    it('should return null for non-existent ID', async () => {
      const entry = await ledger.get('non-existent-id');
      expect(entry).toBeNull();
    });
  });

  describe('list()', () => {
    beforeEach(async () => {
      // Create multiple entries
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
        reason: 'brute-force',
      });
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-2',
        reason: 'revoked',
      });
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'session',
        subjectId: 'session-1',
        reason: 'revoked',
      });
      await ledger.deny({
        tenantId: 'tenant-2',
        subjectType: 'user',
        subjectId: 'user-3',
        reason: 'suspended',
      });
    });

    it('should list entries for tenant', async () => {
      const entries = await ledger.list('tenant-1');
      expect(entries).toHaveLength(3);
    });

    it('should filter by subjectType', async () => {
      const entries = await ledger.list('tenant-1', { subjectType: 'user' });
      expect(entries).toHaveLength(2);
    });

    it('should filter by reason', async () => {
      const entries = await ledger.list('tenant-1', { reason: 'revoked' });
      expect(entries).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const page1 = await ledger.list('tenant-1', { limit: 2, offset: 0 });
      const page2 = await ledger.list('tenant-1', { limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });
  });

  describe('count()', () => {
    it('should return count of entries', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
        reason: 'brute-force',
      });
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-2',
        reason: 'revoked',
      });

      const count = await ledger.count('tenant-1');
      expect(count).toBe(2);
    });
  });

  describe('denyBatch()', () => {
    it('should create multiple entries', async () => {
      const entries: DenyEntryCreate[] = [
        { tenantId: 'tenant-1', subjectType: 'user', subjectId: 'user-1', reason: 'brute-force' },
        { tenantId: 'tenant-1', subjectType: 'user', subjectId: 'user-2', reason: 'brute-force' },
        { tenantId: 'tenant-1', subjectType: 'user', subjectId: 'user-3', reason: 'brute-force' },
      ];

      const created = await ledger.denyBatch(entries);

      expect(created).toHaveLength(3);
      expect(created[0].id).toBeDefined();
      expect(created[1].id).toBeDefined();
      expect(created[2].id).toBeDefined();
    });
  });

  describe('allowBatch()', () => {
    it('should remove multiple entries', async () => {
      const entry1 = await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
        reason: 'revoked',
      });
      const entry2 = await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-2',
        reason: 'revoked',
      });

      await ledger.allowBatch([entry1.id, entry2.id]);

      const count = await ledger.count('tenant-1');
      expect(count).toBe(0);
    });
  });

  describe('cleanupExpired()', () => {
    it('should remove expired entries', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
        reason: 'brute-force',
        expiresAt: new Date(Date.now() - 1000), // Expired
      });
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-2',
        reason: 'revoked',
        // No expiration
      });

      const removed = await ledger.cleanupExpired();

      expect(removed).toBe(1);
      expect(await ledger.count('tenant-1')).toBe(1);
    });
  });

  describe('getStats()', () => {
    it('should return statistics', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
        reason: 'brute-force',
      });
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'session',
        subjectId: 'session-1',
        reason: 'revoked',
      });

      // Generate some cache hits/misses
      await ledger.isDenied({ tenantId: 'tenant-1', subjectType: 'user', subjectId: 'user-1' });
      await ledger.isDenied({ tenantId: 'tenant-1', subjectType: 'user', subjectId: 'user-999' });

      const stats = await ledger.getStats('tenant-1');

      expect(stats.totalEntries).toBe(2);
      expect(stats.bySubjectType.user).toBe(1);
      expect(stats.bySubjectType.session).toBe(1);
      expect(stats.byReason['brute-force']).toBe(1);
      expect(stats.byReason.revoked).toBe(1);
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when maxSize reached', async () => {
      const smallLedger = new MemoryDenyLedger({ maxCacheSize: 3 });
      await smallLedger.initialize();

      // Add 4 entries (exceeds max of 3)
      await smallLedger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
        reason: 'revoked',
      });
      await smallLedger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-2',
        reason: 'revoked',
      });
      await smallLedger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-3',
        reason: 'revoked',
      });
      await smallLedger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-4',
        reason: 'revoked',
      });

      const stats = await smallLedger.getStats();

      // Should have evicted one entry
      expect(stats.cacheSize).toBe(3);

      // First entry (user-1) should be evicted
      const result = await smallLedger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
      });
      expect(result.denied).toBe(false);

      await smallLedger.close();
    });
  });

  describe('importEntries() and exportEntries()', () => {
    it('should import and export entries', async () => {
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
        reason: 'revoked',
      });
      await ledger.deny({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-2',
        reason: 'revoked',
      });

      const exported = ledger.exportEntries();
      expect(exported).toHaveLength(2);

      // Create new ledger and import
      const newLedger = new MemoryDenyLedger();
      await newLedger.initialize();
      newLedger.importEntries(exported);

      const result = await newLedger.isDenied({
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectId: 'user-1',
      });
      expect(result.denied).toBe(true);

      await newLedger.close();
    });
  });
});
