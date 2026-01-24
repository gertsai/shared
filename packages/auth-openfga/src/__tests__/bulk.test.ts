/**
 * Tests for Bulk Operations (B3.2)
 *
 * Note: These tests mock the OpenFGA client since they would require
 * a running OpenFGA instance for integration testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bulkGrantAccess,
  bulkRevokeAccess,
  bulkGrantToResources,
  bulkRevokeFromResources,
  bulkWriteTuples,
  bulkDeleteTuples,
} from '../mutations/index.js';
import { userString, objectString } from '../constants.js';

// Mock the getFgaClient
const mockWriteTuples = vi.fn();
const mockDeleteTuples = vi.fn();

vi.mock('../client.js', async () => {
  const actual = await vi.importActual('../client.js');
  return {
    ...actual,
    getFgaClient: vi.fn(() => ({
      writeTuples: mockWriteTuples,
      deleteTuples: mockDeleteTuples,
    })),
  };
});

describe('Bulk Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteTuples.mockResolvedValue(undefined);
    mockDeleteTuples.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('bulkWriteTuples', () => {
    it('should write tuples in batches of 100', async () => {
      const tuples = Array.from({ length: 250 }, (_, i) => ({
        user: `user:user-${i}`,
        relation: 'viewer',
        object: 'project:proj-1',
      }));

      const result = await bulkWriteTuples(tuples);

      // Should be called 3 times (100 + 100 + 50)
      expect(mockWriteTuples).toHaveBeenCalledTimes(3);
      expect(result.processed).toBe(250);
      expect(result.failed).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should track progress', async () => {
      const tuples = Array.from({ length: 150 }, (_, i) => ({
        user: `user:user-${i}`,
        relation: 'viewer',
        object: 'project:proj-1',
      }));

      const progressCalls: Array<[number, number]> = [];

      await bulkWriteTuples(tuples, {
        onProgress: (processed, total) => {
          progressCalls.push([processed, total]);
        },
      });

      expect(progressCalls).toContainEqual([100, 150]);
      expect(progressCalls).toContainEqual([150, 150]);
    });

    it('should handle errors with continueOnError', async () => {
      mockWriteTuples
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('OpenFGA error'))
        .mockResolvedValueOnce(undefined);

      const tuples = Array.from({ length: 250 }, (_, i) => ({
        user: `user:user-${i}`,
        relation: 'viewer',
        object: 'project:proj-1',
      }));

      const result = await bulkWriteTuples(tuples, { continueOnError: true });

      // 250 tuples = 3 batches (100 + 100 + 50)
      // Batch 1: success (100), Batch 2: failure (0), Batch 3: success (50)
      expect(result.processed).toBe(150); // 100 + 0 + 50
      expect(result.failed).toHaveLength(100); // Middle batch failed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('OpenFGA error');
    });

    it('should throw on error without continueOnError', async () => {
      mockWriteTuples.mockRejectedValueOnce(new Error('OpenFGA error'));

      const tuples = Array.from({ length: 50 }, (_, i) => ({
        user: `user:user-${i}`,
        relation: 'viewer',
        object: 'project:proj-1',
      }));

      await expect(bulkWriteTuples(tuples)).rejects.toThrow('OpenFGA error');
    });
  });

  describe('bulkDeleteTuples', () => {
    it('should delete tuples in batches', async () => {
      const tuples = Array.from({ length: 150 }, (_, i) => ({
        user: `user:user-${i}`,
        relation: 'viewer',
        object: 'project:proj-1',
      }));

      const result = await bulkDeleteTuples(tuples);

      expect(mockDeleteTuples).toHaveBeenCalledTimes(2);
      expect(result.processed).toBe(150);
    });

    it('should ignore "not found" errors for idempotent deletes', async () => {
      mockDeleteTuples.mockRejectedValueOnce(new Error('tuple not found'));

      const tuples = Array.from({ length: 50 }, (_, i) => ({
        user: `user:user-${i}`,
        relation: 'viewer',
        object: 'project:proj-1',
      }));

      const result = await bulkDeleteTuples(tuples);

      // Should succeed despite error (idempotent)
      expect(result.processed).toBe(50);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('bulkGrantAccess', () => {
    it('should grant access to multiple users', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];

      const result = await bulkGrantAccess(userIds, 'viewer', 'project', 'proj-1');

      expect(mockWriteTuples).toHaveBeenCalledWith(
        userIds.map((userId) => ({
          user: userString(userId),
          relation: 'viewer',
          object: objectString('project', 'proj-1'),
        })),
      );
      expect(result.processed).toBe(3);
    });
  });

  describe('bulkRevokeAccess', () => {
    it('should revoke access from multiple users', async () => {
      const userIds = ['user-1', 'user-2'];

      const result = await bulkRevokeAccess(userIds, 'editor', 'project', 'proj-1');

      expect(mockDeleteTuples).toHaveBeenCalledWith(
        userIds.map((userId) => ({
          user: userString(userId),
          relation: 'editor',
          object: objectString('project', 'proj-1'),
        })),
      );
      expect(result.processed).toBe(2);
    });
  });

  describe('bulkGrantToResources', () => {
    it('should grant user access to multiple resources', async () => {
      const resourceIds = ['proj-1', 'proj-2', 'proj-3'];

      const result = await bulkGrantToResources('user-1', 'viewer', 'project', resourceIds);

      expect(mockWriteTuples).toHaveBeenCalledWith(
        resourceIds.map((resourceId) => ({
          user: userString('user-1'),
          relation: 'viewer',
          object: objectString('project', resourceId),
        })),
      );
      expect(result.processed).toBe(3);
    });
  });

  describe('bulkRevokeFromResources', () => {
    it('should revoke user access from multiple resources', async () => {
      const resourceIds = ['proj-1', 'proj-2'];

      const result = await bulkRevokeFromResources('user-1', 'editor', 'project', resourceIds);

      expect(mockDeleteTuples).toHaveBeenCalledWith(
        resourceIds.map((resourceId) => ({
          user: userString('user-1'),
          relation: 'editor',
          object: objectString('project', resourceId),
        })),
      );
      expect(result.processed).toBe(2);
    });
  });

  describe('parallel execution', () => {
    it('should process batches in parallel when enabled', async () => {
      const tuples = Array.from({ length: 250 }, (_, i) => ({
        user: `user:user-${i}`,
        relation: 'viewer',
        object: 'project:proj-1',
      }));

      // Track call order
      const callOrder: number[] = [];
      mockWriteTuples.mockImplementation(async () => {
        const callIndex = callOrder.length;
        callOrder.push(callIndex);
        // Simulate varying response times
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      });

      await bulkWriteTuples(tuples, { parallel: true });

      // With parallel execution, all batches should be started immediately
      expect(mockWriteTuples).toHaveBeenCalledTimes(3);
    });
  });
});
