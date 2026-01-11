import { describe, expect, it } from 'vitest';

import { KeyGenerator } from './KeyGenerator';

describe('KeyGenerator', () => {
  const generator = new KeyGenerator('test:');

  describe('generateSWKey', () => {
    it('generates valid sliding window keys for IPs', () => {
      expect(generator.generateSWKey('192.168.1.1')).toBe('test:sw:192.168.1.1');
      expect(generator.generateSWKey('::1')).toBe('test:sw:::1');
    });

    it('throws for invalid IP addresses', () => {
      expect(() => generator.generateSWKey('not-an-ip')).toThrow();
      expect(() => generator.generateSWKey('256.256.256.256')).toThrow();
      expect(() => generator.generateSWKey(undefined as any)).toThrow();
    });
  });

  describe('generateBucketKey', () => {
    it('generates valid bucket keys', () => {
      expect(generator.generateBucketKey('192.168.1.1', 'get:/api/users')).toBe(
        'test:bucket:192.168.1.1:get./api/users',
      );
      expect(generator.generateBucketKey('user-123', 'post:/messages')).toBe(
        'test:bucket:user-123:post./messages',
      );
    });

    it('sanitizes special characters', () => {
      expect(generator.generateBucketKey('user@example.com', 'get:/api')).toBe(
        'test:bucket:user@example.com:get./api',
      );
      expect(generator.generateBucketKey('key with spaces', 'method:path')).toBe(
        'test:bucket:key_with_spaces:method.path',
      );
    });

    it('throws for missing parameters', () => {
      expect(() => generator.generateBucketKey('', 'bucket')).toThrow('Subject is required');
      expect(() => generator.generateBucketKey('subject', '')).toThrow('Bucket ID is required');
    });

    it('limits key length', () => {
      const longSubject = 'a'.repeat(300);
      const key = generator.generateBucketKey(longSubject, 'bucket');
      expect(key.length).toBeLessThan(500); // Reasonable Redis key length
    });
  });

  describe('generateGCRAKey', () => {
    it('generates valid GCRA keys', () => {
      expect(generator.generateGCRAKey('192.168.1.1', 'get:/api/users')).toBe(
        'test:gcra:192.168.1.1:get./api/users',
      );
    });

    it('sanitizes inputs like bucket keys', () => {
      expect(generator.generateGCRAKey('user:123', 'post:/data')).toBe(
        'test:gcra:user.123:post./data',
      );
    });
  });

  describe('generateTempKey', () => {
    it('generates unique temp keys', () => {
      const key1 = generator.generateTempKey();
      const key2 = generator.generateTempKey();

      expect(key1).toMatch(/^test:temp:\d+:[a-z0-9]+$/);
      expect(key2).toMatch(/^test:temp:\d+:[a-z0-9]+$/);
      expect(key1).not.toBe(key2);
    });

    it('includes suffix when provided', () => {
      const key = generator.generateTempKey('health-check');
      expect(key).toMatch(/^test:temp:\d+:[a-z0-9]+:health-check$/);
    });
  });

  describe('parseKey', () => {
    it('parses sliding window keys', () => {
      const result = generator.parseKey('test:sw:192.168.1.1');
      expect(result).toEqual({
        type: 'sw',
        subject: '192.168.1.1',
      });
    });

    it('parses bucket keys', () => {
      const result = generator.parseKey('test:bucket:user-123:get./api/users');
      expect(result).toEqual({
        type: 'bucket',
        subject: 'user-123',
        bucketId: 'get./api/users',
      });
    });

    it('parses GCRA keys', () => {
      const result = generator.parseKey('test:gcra:192.168.1.1:post./messages');
      expect(result).toEqual({
        type: 'gcra',
        subject: '192.168.1.1',
        bucketId: 'post./messages',
      });
    });

    it('parses temp keys', () => {
      const result = generator.parseKey('test:temp:123456:abc123');
      expect(result).toEqual({ type: 'temp' });
    });

    it('returns null for invalid keys', () => {
      expect(generator.parseKey('invalid:key')).toBeNull();
      expect(generator.parseKey('other:prefix:key')).toBeNull();
    });

    it('handles unknown key types', () => {
      const result = generator.parseKey('test:unknown:something');
      expect(result).toEqual({ type: 'unknown' });
    });

    it('handles bucket IDs with colons', () => {
      const result = generator.parseKey('test:bucket:user:method:path:with:colons');
      expect(result).toEqual({
        type: 'bucket',
        subject: 'user',
        bucketId: 'method:path:with:colons',
      });
    });
  });

  describe('isOwnKey', () => {
    it('identifies own keys', () => {
      expect(generator.isOwnKey('test:sw:192.168.1.1')).toBe(true);
      expect(generator.isOwnKey('test:bucket:user:bucket')).toBe(true);
      expect(generator.isOwnKey('test:gcra:user:bucket')).toBe(true);
      expect(generator.isOwnKey('test:temp:123:abc')).toBe(true);
    });

    it('rejects foreign keys', () => {
      expect(generator.isOwnKey('other:sw:192.168.1.1')).toBe(false);
      expect(generator.isOwnKey('prod:bucket:user:bucket')).toBe(false);
      expect(generator.isOwnKey('no-prefix-key')).toBe(false);
    });
  });

  describe('getKeyPatterns', () => {
    it('returns all key patterns', () => {
      const patterns = generator.getKeyPatterns();

      expect(patterns).toContain('test:sw:*');
      expect(patterns).toContain('test:bucket:*');
      expect(patterns).toContain('test:gcra:*');
      expect(patterns).toContain('test:temp:*');
      expect(patterns).toHaveLength(4);
    });
  });

  describe('with default prefix', () => {
    const defaultGenerator = new KeyGenerator();

    it('uses default prefix', () => {
      expect(defaultGenerator.generateSWKey('192.168.1.1')).toBe('rlr:sw:192.168.1.1');
      expect(defaultGenerator.generateBucketKey('user', 'bucket')).toContain('rlr:bucket:');
    });
  });
});
