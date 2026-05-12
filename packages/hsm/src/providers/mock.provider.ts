/**
 * @fileoverview Mock HSM Provider for Testing
 *
 * Implements HSMProvider with in-memory key storage.
 * Provides deterministic convergent encryption for testing.
 *
 * @module @gertsai/hsm/providers/mock
 */

import { createHash, createHmac, createCipheriv, createDecipheriv } from 'crypto';
import type {
  HSMProvider,
  MockHSMConfig,
  HealthCheckResult,
  EncryptResult,
  DecryptResult,
  KeyInfo,
  RotateKeyResult,
  RewrapResult,
  HSMLogger,
  HSMMetrics,
} from '../types.js';
import { HSMProviderTypes, HSMError, HSMErrorCodes, noopLogger, noopMetrics } from '../types.js';
import { sleep } from '../utils/retry.js';

// =============================================================================
// MOCK PROVIDER
// =============================================================================

/**
 * Mock HSM Provider for testing
 *
 * Uses AES-256-GCM with deterministic IV for convergent encryption.
 * Key material is stored in memory and derived using HMAC.
 *
 * @example
 * ```typescript
 * const provider = new MockHSMProvider({
 *   provider: 'mock',
 *   enabled: true,
 *   timeoutMs: 5000,
 *   retryAttempts: 3,
 *   retryDelayMs: 1000,
 *   fallbackMode: 'error',
 *   simulatedLatencyMs: 10, // Optional: add latency
 * });
 *
 * await provider.connect();
 * const result = await provider.encrypt(content, contentHash);
 * ```
 */
export class MockHSMProvider implements HSMProvider {
  readonly type = HSMProviderTypes.MOCK;
  readonly name = 'Mock HSM';

  private _isConnected = false;
  private _keyVersion = 1;
  private _masterKey: Buffer;
  private _createdAt: Date;
  private _lastRotatedAt?: Date;
  private readonly logger: HSMLogger;
  private readonly metrics: HSMMetrics;
  /** History of master keys by version (for rewrap support) */
  private readonly _masterKeyHistory: Map<number, Buffer> = new Map();

  constructor(
    private readonly config: MockHSMConfig,
    options?: {
      logger?: HSMLogger;
      metrics?: HSMMetrics;
    },
  ) {
    this.logger = options?.logger ?? noopLogger;
    this.metrics = options?.metrics ?? noopMetrics;

    // Generate deterministic master key for testing
    // In tests, you can override this by setting _masterKey after construction
    this._masterKey = createHash('sha256').update('mock-master-key-for-testing').digest();
    this._createdAt = new Date();
    // Save initial key in history
    this._masterKeyHistory.set(this._keyVersion, this._masterKey);
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Set master key (for testing specific scenarios)
   */
  setMasterKey(key: Buffer): void {
    if (key.length !== 32) {
      throw new Error('Master key must be 32 bytes');
    }
    this._masterKey = key;
  }

  // ===========================================================================
  // CONNECTION
  // ===========================================================================

  async connect(): Promise<void> {
    await this.simulateLatency();
    await this.maybeSimulateFailure();

    this._isConnected = true;
    this.metrics.recordConnection(true);
    this.logger.info('Mock HSM connected');
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.logger.info('Mock HSM disconnected');
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    await this.simulateLatency();

    const healthy = this._isConnected;
    const latencyMs = Date.now() - start;

    this.metrics.recordHealthCheck(latencyMs, healthy);

    return {
      healthy,
      latencyMs,
      keyAvailable: true,
      version: '1.0.0-mock',
    };
  }

  // ===========================================================================
  // ENCRYPTION
  // ===========================================================================

  async encrypt(plaintext: Buffer, context: string): Promise<EncryptResult> {
    this.ensureConnected();
    this.validateContext(context);

    const start = Date.now();
    await this.simulateLatency();
    await this.maybeSimulateFailure();

    // Derive key from context (deterministic for convergent encryption)
    const derivedKey = this.deriveKey(context);

    // Derive IV from context (deterministic for convergent encryption)
    // Using first 12 bytes of HMAC(key, context) for GCM nonce
    const iv = createHash('sha256')
      .update(Buffer.concat([derivedKey, Buffer.from(context, 'hex')]))
      .digest()
      .subarray(0, 12);

    // Encrypt using AES-256-GCM
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: version:keyVersion:iv:authTag:encrypted (base64 encoded parts)
    const ciphertext = Buffer.from(
      `mock:v${this._keyVersion}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`,
      'utf-8',
    );

    // Compute storage ID (hash of ciphertext for dedup)
    const storageId = createHash('sha256').update(ciphertext).digest('hex');

    this.metrics.recordEncrypt(Date.now() - start, true, this._keyVersion);
    this.logger.debug('Mock encryption successful', {
      contextHash: context.slice(0, 8),
      keyVersion: this._keyVersion,
    });

    return {
      ciphertext,
      keyVersion: this._keyVersion,
      algorithm: 'aes256-gcm-mock',
      storageId,
    };
  }

  async decrypt(ciphertext: Buffer, context: string): Promise<DecryptResult> {
    this.ensureConnected();
    this.validateContext(context);

    const start = Date.now();
    await this.simulateLatency();
    await this.maybeSimulateFailure();

    try {
      // Parse ciphertext format: mock:vN:iv:authTag:encrypted
      const ciphertextStr = ciphertext.toString('utf-8');
      const parts = ciphertextStr.split(':');

      const [prefix, versionPart, ivPart, authTagPart, encryptedPart] = parts;
      if (
        parts.length !== 5 ||
        prefix !== 'mock' ||
        versionPart === undefined ||
        ivPart === undefined ||
        authTagPart === undefined ||
        encryptedPart === undefined
      ) {
        throw new HSMError('Invalid mock ciphertext format', HSMErrorCodes.DECRYPT_FAILED, 'mock');
      }

      const keyVersion = parseInt(versionPart.substring(1), 10);
      const iv = Buffer.from(ivPart, 'base64');
      const authTag = Buffer.from(authTagPart, 'base64');
      const encrypted = Buffer.from(encryptedPart, 'base64');

      // Derive key from context using the master key from the correct version
      const masterKey = this._masterKeyHistory.get(keyVersion) ?? this._masterKey;
      const derivedKey = this.deriveKeyWithMaster(context, masterKey);

      // Decrypt using AES-256-GCM
      const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      // Verify content hash matches context
      const computedHash = createHash('sha256').update(plaintext).digest('hex');
      const verified = computedHash === context;

      this.metrics.recordDecrypt(Date.now() - start, true, keyVersion);
      this.logger.debug('Mock decryption successful', {
        contextHash: context.slice(0, 8),
        keyVersion,
        verified,
      });

      return {
        plaintext,
        keyVersion,
        verified,
      };
    } catch (err) {
      this.metrics.recordDecrypt(Date.now() - start, false, 0);
      throw HSMError.fromError(err, HSMErrorCodes.DECRYPT_FAILED, 'mock');
    }
  }

  // ===========================================================================
  // KEY MANAGEMENT
  // ===========================================================================

  async getKeyInfo(): Promise<KeyInfo> {
    this.ensureConnected();
    await this.simulateLatency();

    return {
      name: 'mock-ce-key',
      currentVersion: this._keyVersion,
      minDecryptionVersion: 1,
      type: 'aes256-gcm-mock',
      convergentEncryption: true,
      derived: true,
      exportable: false,
      createdAt: this._createdAt,
      lastRotatedAt: this._lastRotatedAt,
    };
  }

  async rotateKey(): Promise<RotateKeyResult> {
    this.ensureConnected();
    await this.simulateLatency();

    const previousVersion = this._keyVersion;
    this._keyVersion++;
    this._lastRotatedAt = new Date();

    // Generate new master key (in real HSM, this is done internally)
    // For mock, we derive new key from version
    this._masterKey = createHash('sha256')
      .update(Buffer.concat([this._masterKey, Buffer.from(String(this._keyVersion))]))
      .digest();

    // Save new key in history for rewrap support
    this._masterKeyHistory.set(this._keyVersion, this._masterKey);

    this.logger.info('Mock key rotated', {
      previousVersion,
      newVersion: this._keyVersion,
    });

    return {
      newVersion: this._keyVersion,
      previousVersion,
      rotatedAt: this._lastRotatedAt,
    };
  }

  async rewrap(ciphertext: Buffer, context: string): Promise<RewrapResult> {
    this.ensureConnected();
    this.validateContext(context);
    await this.simulateLatency();

    // Decrypt with old key version (from ciphertext)
    const decrypted = await this.decrypt(ciphertext, context);

    // Re-encrypt with current key version
    const encrypted = await this.encrypt(decrypted.plaintext, context);

    this.logger.debug('Mock rewrap successful', {
      contextHash: context.slice(0, 8),
      newKeyVersion: encrypted.keyVersion,
    });

    return {
      ciphertext: encrypted.ciphertext,
      keyVersion: encrypted.keyVersion,
    };
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  private ensureConnected(): void {
    if (!this._isConnected) {
      throw new HSMError('Not connected to Mock HSM', HSMErrorCodes.CONNECTION_FAILED, 'mock');
    }
  }

  private validateContext(context: string): void {
    if (!/^[a-f0-9]{64}$/i.test(context)) {
      throw new HSMError(
        'Invalid context: must be SHA-256 hash (64 hex chars)',
        HSMErrorCodes.INVALID_CONTEXT,
        'mock',
        undefined,
        { context: context.slice(0, 20) },
      );
    }
  }

  /**
   * Derive encryption key from context using HMAC-SHA256
   */
  private deriveKey(context: string): Buffer {
    return this.deriveKeyWithMaster(context, this._masterKey);
  }

  /**
   * Derive encryption key from context using specific master key
   * Used for rewrap operations where we need to decrypt with old key
   */
  private deriveKeyWithMaster(context: string, masterKey: Buffer): Buffer {
    // HMAC(masterKey, context) for deterministic key derivation
    const hmac = createHmac('sha256', masterKey);
    hmac.update(Buffer.from(context, 'hex'));
    return hmac.digest();
  }

  /**
   * Simulate network latency (for testing)
   */
  private async simulateLatency(): Promise<void> {
    const latency = this.config.simulatedLatencyMs ?? 0;
    if (latency > 0) {
      await sleep(latency);
    }
  }

  /**
   * Simulate random failures (for testing error handling)
   */
  private async maybeSimulateFailure(): Promise<void> {
    const probability = this.config.failureProbability ?? 0;
    if (probability > 0 && Math.random() < probability) {
      throw new HSMError('Simulated failure', HSMErrorCodes.UNKNOWN, 'mock');
    }
  }
}
