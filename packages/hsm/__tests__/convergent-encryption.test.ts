/**
 * @fileoverview Unit tests for ConvergentEncryption service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConvergentEncryption, MockHSMProvider } from '../src/index.js';
import { createHash } from 'crypto';

describe('ConvergentEncryption', () => {
  let provider: MockHSMProvider;
  let ce: ConvergentEncryption;

  beforeEach(async () => {
    provider = new MockHSMProvider({
      provider: 'mock',
      enabled: true,
      timeoutMs: 5000,
      retryAttempts: 3,
      retryDelayMs: 100,
      fallbackMode: 'error',
    });
    await provider.connect();

    ce = new ConvergentEncryption({ provider });
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  describe('encrypt', () => {
    it('should encrypt content and return storage ID', async () => {
      const content = Buffer.from('Hello, CAS!');
      const result = await ce.encrypt(content);

      expect(result.ciphertext).toBeInstanceOf(Buffer);
      expect(result.contentHash).toHaveLength(64);
      expect(result.storageId).toHaveLength(64);
      expect(result.keyVersion).toBeGreaterThan(0);

      // Verify contentHash is correct
      const expectedHash = createHash('sha256').update(content).digest('hex');
      expect(result.contentHash).toBe(expectedHash);
    });

    it('should produce consistent storage ID for same content', async () => {
      const content = Buffer.from('Deduplication test');

      const result1 = await ce.encrypt(content);
      const result2 = await ce.encrypt(content);

      expect(result1.storageId).toBe(result2.storageId);
      expect(result1.contentHash).toBe(result2.contentHash);
    });

    it('should produce different storage ID for different content', async () => {
      const content1 = Buffer.from('File A');
      const content2 = Buffer.from('File B');

      const result1 = await ce.encrypt(content1);
      const result2 = await ce.encrypt(content2);

      expect(result1.storageId).not.toBe(result2.storageId);
      expect(result1.contentHash).not.toBe(result2.contentHash);
    });
  });

  describe('decrypt', () => {
    it('should decrypt content correctly', async () => {
      const content = Buffer.from('Secret document');

      const encrypted = await ce.encrypt(content);
      const decrypted = await ce.decrypt(encrypted.ciphertext, encrypted.contentHash);

      expect(decrypted.plaintext.toString()).toBe(content.toString());
      expect(decrypted.verified).toBe(true);
    });

    it('should verify content hash on decrypt', async () => {
      const content = Buffer.from('Verified content');

      const encrypted = await ce.encrypt(content);
      const decrypted = await ce.decrypt(encrypted.ciphertext, encrypted.contentHash);

      expect(decrypted.verified).toBe(true);

      // Verify the hash matches
      const computedHash = createHash('sha256').update(decrypted.plaintext).digest('hex');
      expect(computedHash).toBe(encrypted.contentHash);
    });
  });

  describe('computeStorageId', () => {
    it('should compute storage ID without returning plaintext', async () => {
      const content = Buffer.from('Dedup check content');

      const result = await ce.computeStorageId(content);

      expect(result.storageId).toHaveLength(64);
      expect(result.contentHash).toHaveLength(64);
    });

    it('should return same storage ID as full encrypt', async () => {
      const content = Buffer.from('Consistent storage ID');

      const dedupResult = await ce.computeStorageId(content);
      const encryptResult = await ce.encrypt(content);

      expect(dedupResult.storageId).toBe(encryptResult.storageId);
      expect(dedupResult.contentHash).toBe(encryptResult.contentHash);
    });
  });

  describe('computeContentHash', () => {
    it('should compute content hash without HSM call', () => {
      const content = Buffer.from('Hash me');

      const hash = ce.computeContentHash(content);

      expect(hash).toHaveLength(64);
      expect(hash).toBe(createHash('sha256').update(content).digest('hex'));
    });
  });

  describe('rewrap', () => {
    it('should rewrap content with new key version', async () => {
      const content = Buffer.from('Rewrap me');

      const encrypted = await ce.encrypt(content);
      const originalVersion = encrypted.keyVersion;

      // Rotate key
      await provider.rotateKey();

      // Rewrap
      const rewrapped = await ce.rewrap(encrypted.ciphertext, encrypted.contentHash);

      expect(rewrapped.keyVersion).toBeGreaterThan(originalVersion);

      // Verify can still decrypt
      const decrypted = await ce.decrypt(rewrapped.ciphertext, encrypted.contentHash);
      expect(decrypted.plaintext.toString()).toBe(content.toString());
    });
  });

  describe('health check', () => {
    it('should return healthy status', async () => {
      const health = await ce.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.keyAvailable).toBe(true);
    });
  });

  describe('key info', () => {
    it('should return key info', async () => {
      const keyInfo = await ce.getKeyInfo();

      expect(keyInfo.convergentEncryption).toBe(true);
      expect(keyInfo.derived).toBe(true);
    });
  });
});
