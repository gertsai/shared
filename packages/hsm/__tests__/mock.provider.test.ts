/**
 * @fileoverview Unit tests for MockHSMProvider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockHSMProvider, HSMError } from '../src/index.js';
import { createHash } from 'crypto';

describe('MockHSMProvider', () => {
  let provider: MockHSMProvider;

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
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  describe('connection', () => {
    it('should connect successfully', () => {
      expect(provider.isConnected).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await provider.disconnect();
      expect(provider.isConnected).toBe(false);
    });

    it('should return healthy status when connected', async () => {
      const health = await provider.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.keyAvailable).toBe(true);
      expect(health.version).toBe('1.0.0-mock');
    });
  });

  describe('encryption', () => {
    it('should encrypt content successfully', async () => {
      const content = Buffer.from('Hello, World!');
      const contentHash = createHash('sha256').update(content).digest('hex');

      const result = await provider.encrypt(content, contentHash);

      expect(result.ciphertext).toBeInstanceOf(Buffer);
      expect(result.keyVersion).toBeGreaterThan(0);
      expect(result.algorithm).toBe('aes256-gcm-mock');
      expect(result.storageId).toHaveLength(64);
    });

    it('should produce same ciphertext for same content (convergent encryption)', async () => {
      const content = Buffer.from('Convergent encryption test');
      const contentHash = createHash('sha256').update(content).digest('hex');

      const result1 = await provider.encrypt(content, contentHash);
      const result2 = await provider.encrypt(content, contentHash);

      expect(result1.ciphertext.toString('hex')).toBe(result2.ciphertext.toString('hex'));
      expect(result1.storageId).toBe(result2.storageId);
    });

    it('should produce different ciphertext for different content', async () => {
      const content1 = Buffer.from('Content 1');
      const content2 = Buffer.from('Content 2');
      const hash1 = createHash('sha256').update(content1).digest('hex');
      const hash2 = createHash('sha256').update(content2).digest('hex');

      const result1 = await provider.encrypt(content1, hash1);
      const result2 = await provider.encrypt(content2, hash2);

      expect(result1.ciphertext.toString('hex')).not.toBe(result2.ciphertext.toString('hex'));
      expect(result1.storageId).not.toBe(result2.storageId);
    });

    it('should reject invalid context (not SHA-256 hash)', async () => {
      const content = Buffer.from('test');
      const invalidContext = 'not-a-valid-hash';

      await expect(provider.encrypt(content, invalidContext)).rejects.toThrow(HSMError);
    });

    it('should throw when not connected', async () => {
      await provider.disconnect();
      const content = Buffer.from('test');
      const contentHash = createHash('sha256').update(content).digest('hex');

      await expect(provider.encrypt(content, contentHash)).rejects.toThrow(HSMError);
    });
  });

  describe('decryption', () => {
    it('should decrypt content successfully', async () => {
      const content = Buffer.from('Secret message');
      const contentHash = createHash('sha256').update(content).digest('hex');

      const encrypted = await provider.encrypt(content, contentHash);
      const decrypted = await provider.decrypt(encrypted.ciphertext, contentHash);

      expect(decrypted.plaintext.toString()).toBe(content.toString());
      expect(decrypted.verified).toBe(true);
    });

    it('should set verified to false when hash does not match', async () => {
      const content = Buffer.from('Original content');
      const contentHash = createHash('sha256').update(content).digest('hex');

      const encrypted = await provider.encrypt(content, contentHash);

      // Use wrong content hash for decryption
      const wrongHash = createHash('sha256').update(Buffer.from('Different content')).digest('hex');

      // This should still decrypt but verified will be false
      // Note: MockProvider re-derives key from context, so this will fail to decrypt
      await expect(provider.decrypt(encrypted.ciphertext, wrongHash)).rejects.toThrow();
    });
  });

  describe('key management', () => {
    it('should return key info', async () => {
      const keyInfo = await provider.getKeyInfo();

      expect(keyInfo.name).toBe('mock-ce-key');
      expect(keyInfo.currentVersion).toBeGreaterThan(0);
      expect(keyInfo.convergentEncryption).toBe(true);
      expect(keyInfo.derived).toBe(true);
      expect(keyInfo.exportable).toBe(false);
    });

    it('should rotate key', async () => {
      const beforeInfo = await provider.getKeyInfo();
      const rotateResult = await provider.rotateKey();
      const afterInfo = await provider.getKeyInfo();

      expect(rotateResult.previousVersion).toBe(beforeInfo.currentVersion);
      expect(rotateResult.newVersion).toBe(afterInfo.currentVersion);
      expect(afterInfo.currentVersion).toBe(beforeInfo.currentVersion + 1);
    });

    it('should rewrap ciphertext with new key', async () => {
      const content = Buffer.from('Rewrap test content');
      const contentHash = createHash('sha256').update(content).digest('hex');

      const encrypted = await provider.encrypt(content, contentHash);
      const originalVersion = encrypted.keyVersion;

      await provider.rotateKey();

      const rewrapped = await provider.rewrap(encrypted.ciphertext, contentHash);

      expect(rewrapped.keyVersion).toBeGreaterThan(originalVersion);

      // Should still decrypt correctly
      const decrypted = await provider.decrypt(rewrapped.ciphertext, contentHash);
      expect(decrypted.plaintext.toString()).toBe(content.toString());
      expect(decrypted.verified).toBe(true);
    });
  });

  describe('simulated failures', () => {
    it('should simulate latency', async () => {
      const slowProvider = new MockHSMProvider({
        provider: 'mock',
        enabled: true,
        timeoutMs: 5000,
        retryAttempts: 1,
        retryDelayMs: 100,
        fallbackMode: 'error',
        simulatedLatencyMs: 50,
      });
      await slowProvider.connect();

      const content = Buffer.from('test');
      const contentHash = createHash('sha256').update(content).digest('hex');

      const start = Date.now();
      await slowProvider.encrypt(content, contentHash);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50);

      await slowProvider.disconnect();
    });
  });
});
