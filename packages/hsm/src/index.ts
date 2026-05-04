/**
 * @fileoverview HSM Package Entry Point
 *
 * Hardware Security Module (HSM) integration for convergent encryption.
 * Provides secure key management and encryption for CAS deduplication.
 *
 * @module @gerts/hsm
 *
 * @example
 * ```typescript
 * import { ConvergentEncryption, VaultProvider } from '@gerts/hsm';
 *
 * // Create Vault provider
 * const provider = new VaultProvider({
 *   provider: 'vault',
 *   enabled: true,
 *   address: 'http://localhost:8200',
 *   authMethod: 'token',
 *   token: 'dev-root-token',
 *   transitMount: 'transit',
 *   keyName: 'gerts-ce-key',
 *   timeoutMs: 5000,
 *   retryAttempts: 3,
 *   retryDelayMs: 1000,
 *   fallbackMode: 'error',
 * });
 *
 * // Connect to HSM
 * await provider.connect();
 *
 * // Create CE service
 * const ce = new ConvergentEncryption({ provider });
 *
 * // Encrypt content
 * const result = await ce.encrypt(content);
 * // result.storageId - use for dedup
 * // result.ciphertext - store in backend
 *
 * // Decrypt content
 * const decrypted = await ce.decrypt(result.ciphertext, result.contentHash);
 * ```
 */

// Types
export type {
  HSMProviderType,
  VaultAuthMethod,
  HSMBaseConfig,
  VaultConfig,
  MockHSMConfig,
  HSMConfig,
  HealthCheckResult,
  EncryptResult,
  DecryptResult,
  KeyInfo,
  RotateKeyResult,
  RewrapResult,
  HSMProvider,
  HSMErrorCode,
  HSMLogger,
  HSMMetrics,
} from './types.js';

export {
  HSMProviderTypes,
  VaultAuthMethods,
  HSMErrorCodes,
  HSMError,
  noopLogger,
  noopMetrics,
} from './types.js';

// Providers
export { VaultProvider } from './providers/vault.provider.js';
export { MockHSMProvider } from './providers/mock.provider.js';

// Convergent Encryption
export { ConvergentEncryption } from './convergent-encryption.js';
export type { CEOptions, CEUploadResult, CEDownloadResult, CEDedupCheckResult } from './convergent-encryption.js';

// Utilities
export { withRetry, sleep, createCircuitBreaker, DEFAULT_RETRY_OPTIONS } from './utils/retry.js';
export type { RetryOptions } from './utils/retry.js';

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

import type { HSMConfig, HSMProvider } from './types.js';
import { VaultProvider } from './providers/vault.provider.js';
import { MockHSMProvider } from './providers/mock.provider.js';
import { HSMError, HSMErrorCodes } from './types.js';

/**
 * Create HSM provider from configuration
 *
 * @param config - HSM configuration
 * @returns HSM provider instance
 */
export function createHSMProvider(config: HSMConfig): HSMProvider {
  switch (config.provider) {
    case 'vault':
      return new VaultProvider(config);

    case 'mock':
      return new MockHSMProvider(config);

    default:
      throw new HSMError(
        `Unsupported HSM provider: ${(config as { provider: string }).provider}`,
        HSMErrorCodes.CONFIG_ERROR,
      );
  }
}

/**
 * Create default mock provider for testing
 */
export function createMockProvider(): MockHSMProvider {
  return new MockHSMProvider({
    provider: 'mock',
    enabled: true,
    timeoutMs: 5000,
    retryAttempts: 3,
    retryDelayMs: 1000,
    fallbackMode: 'error',
  });
}
