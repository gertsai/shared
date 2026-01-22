/**
 * @fileoverview Convergent Encryption Service
 *
 * High-level API for convergent encryption operations on CAS content.
 * Wraps HSMProvider with content-specific logic.
 *
 * @module @gerts/hsm/convergent-encryption
 */

import { createHash } from 'crypto';
import type { HSMProvider, HSMLogger } from './types.js';
import { HSMError, HSMErrorCodes, noopLogger } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Convergent Encryption options
 */
export interface CEOptions {
  /** HSM provider instance */
  provider: HSMProvider;

  /** Logger instance */
  logger?: HSMLogger;

  /** Whether to verify hash on decrypt (default: true) */
  verifyOnDecrypt?: boolean;
}

/**
 * Result of encrypting content for CAS storage
 */
export interface CEUploadResult {
  /** Storage ID (hash of ciphertext) - used for dedup in storage */
  storageId: string;

  /** Encrypted content */
  ciphertext: Buffer;

  /** Original content hash (used as context for CE) */
  contentHash: string;

  /** Key version used for encryption */
  keyVersion: number;

  /** Encryption algorithm */
  algorithm: string;
}

/**
 * Result of decrypting content from CAS
 */
export interface CEDownloadResult {
  /** Decrypted content */
  plaintext: Buffer;

  /** Original content hash */
  contentHash: string;

  /** Whether hash verification passed */
  verified: boolean;

  /** Key version used for decryption */
  keyVersion: number;
}

/**
 * Result of checking content for dedup
 */
export interface CEDedupCheckResult {
  /** Storage ID (would be used if encrypted) */
  storageId: string;

  /** Content hash */
  contentHash: string;
}

// =============================================================================
// CONVERGENT ENCRYPTION SERVICE
// =============================================================================

/**
 * Convergent Encryption Service
 *
 * Provides high-level encryption/decryption for CAS with automatic hash computation.
 * Ensures same content always produces same ciphertext (dedup-compatible).
 *
 * @example
 * ```typescript
 * const ce = new ConvergentEncryption({
 *   provider: vaultProvider,
 * });
 *
 * // Encrypt content for storage
 * const result = await ce.encrypt(content);
 * // result.storageId is the dedup key
 * // result.ciphertext is stored in backend
 *
 * // Same content = same ciphertext
 * const result2 = await ce.encrypt(content);
 * assert(result.storageId === result2.storageId);
 *
 * // Decrypt content
 * const decrypted = await ce.decrypt(result.ciphertext, result.contentHash);
 * assert(decrypted.plaintext.equals(content));
 * ```
 */
export class ConvergentEncryption {
  private readonly provider: HSMProvider;
  private readonly logger: HSMLogger;
  private readonly verifyOnDecrypt: boolean;

  constructor(options: CEOptions) {
    this.provider = options.provider;
    this.logger = options.logger ?? noopLogger;
    this.verifyOnDecrypt = options.verifyOnDecrypt ?? true;
  }

  /**
   * Encrypt content for CAS storage
   *
   * 1. Computes content hash (SHA-256)
   * 2. Uses hash as context for convergent encryption
   * 3. Returns storage ID (hash of ciphertext) for dedup
   *
   * @param content - Content to encrypt
   * @returns Encryption result with storage ID and ciphertext
   * @throws HSMError if content is empty or provider not connected
   */
  async encrypt(content: Buffer): Promise<CEUploadResult> {
    if (!this.provider.isConnected) {
      throw new HSMError('HSM provider not connected', HSMErrorCodes.CONNECTION_FAILED);
    }

    if (content.length === 0) {
      throw new HSMError('Content cannot be empty', HSMErrorCodes.INVALID_CONTEXT);
    }

    // Compute content hash (used as CE context)
    const contentHash = createHash('sha256').update(content).digest('hex');

    this.logger.debug('Encrypting content', {
      contentHash: contentHash.slice(0, 8),
      contentLength: content.length,
    });

    // Encrypt using provider
    const result = await this.provider.encrypt(content, contentHash);

    this.logger.debug('Encryption complete', {
      contentHash: contentHash.slice(0, 8),
      storageId: result.storageId.slice(0, 8),
      keyVersion: result.keyVersion,
    });

    return {
      storageId: result.storageId,
      ciphertext: result.ciphertext,
      contentHash,
      keyVersion: result.keyVersion,
      algorithm: result.algorithm,
    };
  }

  /**
   * Decrypt content from CAS
   *
   * @param ciphertext - Encrypted content
   * @param contentHash - Original content hash (from CAS metadata)
   * @returns Decryption result with plaintext
   */
  async decrypt(ciphertext: Buffer, contentHash: string): Promise<CEDownloadResult> {
    if (!this.provider.isConnected) {
      throw new HSMError('HSM provider not connected', HSMErrorCodes.CONNECTION_FAILED);
    }

    this.logger.debug('Decrypting content', {
      contentHash: contentHash.slice(0, 8),
      ciphertextLength: ciphertext.length,
    });

    // Decrypt using provider
    const result = await this.provider.decrypt(ciphertext, contentHash);

    // Verify hash if enabled
    let verified = result.verified;
    if (this.verifyOnDecrypt && !verified) {
      const computedHash = createHash('sha256').update(result.plaintext).digest('hex');
      verified = computedHash === contentHash;

      if (!verified) {
        this.logger.warn('Content hash verification failed', {
          expected: contentHash.slice(0, 8),
          computed: computedHash.slice(0, 8),
        });
      }
    }

    this.logger.debug('Decryption complete', {
      contentHash: contentHash.slice(0, 8),
      verified,
      keyVersion: result.keyVersion,
    });

    return {
      plaintext: result.plaintext,
      contentHash,
      verified,
      keyVersion: result.keyVersion,
    };
  }

  /**
   * Compute what storage ID content would have without full encryption
   *
   * Useful for pre-checking dedup before upload.
   * Note: This still requires HSM call to compute the ciphertext hash.
   *
   * @param content - Content to check
   * @returns Dedup check result with storage ID
   */
  async computeStorageId(content: Buffer): Promise<CEDedupCheckResult> {
    // Full encryption is needed because storage ID is hash of ciphertext
    const result = await this.encrypt(content);

    return {
      storageId: result.storageId,
      contentHash: result.contentHash,
    };
  }

  /**
   * Compute content hash without HSM call
   *
   * Useful for pre-checking if content exists in CAS before upload.
   *
   * @param content - Content to hash
   * @returns Content hash (SHA-256 hex)
   */
  computeContentHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Re-wrap content with current key version
   *
   * Used during key rotation to update old ciphertexts.
   *
   * @param ciphertext - Content encrypted with old key
   * @param contentHash - Original content hash
   * @returns New ciphertext encrypted with current key
   */
  async rewrap(
    ciphertext: Buffer,
    contentHash: string,
  ): Promise<{
    ciphertext: Buffer;
    storageId: string;
    keyVersion: number;
  }> {
    if (!this.provider.isConnected) {
      throw new HSMError('HSM provider not connected', HSMErrorCodes.CONNECTION_FAILED);
    }

    this.logger.debug('Rewrapping content', {
      contentHash: contentHash.slice(0, 8),
    });

    const result = await this.provider.rewrap(ciphertext, contentHash);

    // Compute new storage ID
    const storageId = createHash('sha256').update(result.ciphertext).digest('hex');

    this.logger.debug('Rewrap complete', {
      contentHash: contentHash.slice(0, 8),
      newKeyVersion: result.keyVersion,
      newStorageId: storageId.slice(0, 8),
    });

    return {
      ciphertext: result.ciphertext,
      storageId,
      keyVersion: result.keyVersion,
    };
  }

  /**
   * Get current key information
   */
  async getKeyInfo(): Promise<import('./types.js').KeyInfo> {
    return this.provider.getKeyInfo();
  }

  /**
   * Check if provider is healthy
   */
  async healthCheck(): Promise<import('./types.js').HealthCheckResult> {
    return this.provider.healthCheck();
  }
}
