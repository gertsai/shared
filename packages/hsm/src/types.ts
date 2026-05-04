/**
 * @fileoverview HSM Provider Types and Interfaces
 *
 * Defines the contract for Hardware Security Module (HSM) providers
 * that implement convergent encryption for CAS deduplication.
 *
 * Supported providers:
 * - HashiCorp Vault (Transit secrets engine)
 * - AWS KMS (future)
 * - Azure Key Vault (future)
 * - Mock (for testing)
 *
 * @module @gertsai/hsm/types
 */

// =============================================================================
// PROVIDER TYPES
// =============================================================================

/**
 * Supported HSM provider types
 */
export const HSMProviderTypes = {
  VAULT: 'vault',
  AWS_KMS: 'aws-kms',
  AZURE_KV: 'azure-kv',
  MOCK: 'mock',
} as const;

export type HSMProviderType = (typeof HSMProviderTypes)[keyof typeof HSMProviderTypes];

/**
 * Vault authentication methods
 */
export const VaultAuthMethods = {
  TOKEN: 'token',
  APPROLE: 'approle',
  KUBERNETES: 'kubernetes',
} as const;

export type VaultAuthMethod = (typeof VaultAuthMethods)[keyof typeof VaultAuthMethods];

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Base HSM configuration
 */
export interface HSMBaseConfig {
  /** Provider type */
  provider: HSMProviderType;

  /** Enable HSM (default: false for backward compatibility) */
  enabled: boolean;

  /** Operation timeout in milliseconds */
  timeoutMs: number;

  /** Retry attempts */
  retryAttempts: number;

  /** Retry delay in milliseconds */
  retryDelayMs: number;

  /** Fallback mode when HSM unavailable: 'error' | 'unencrypted' */
  fallbackMode: 'error' | 'unencrypted';
}

/**
 * Vault-specific configuration
 */
export interface VaultConfig extends HSMBaseConfig {
  provider: 'vault';

  /** Vault server address */
  address: string;

  /** Authentication method */
  authMethod: VaultAuthMethod;

  /** Token (for token auth) */
  token?: string;

  /** AppRole role_id */
  roleId?: string;

  /** AppRole secret_id */
  secretId?: string;

  /** Kubernetes role name (for kubernetes auth, default: 'files-service') */
  kubernetesRole?: string;

  /** Vault namespace (enterprise feature) */
  namespace?: string;

  /** Transit mount path (default: 'transit') */
  transitMount: string;

  /** Convergent encryption key name */
  keyName: string;

  /** TLS CA certificate path */
  caCert?: string;

  /** Skip TLS verification (dev only!) */
  skipVerify?: boolean;
}

/**
 * Mock provider configuration (for testing)
 */
export interface MockHSMConfig extends HSMBaseConfig {
  provider: 'mock';

  /** Simulate latency in milliseconds */
  simulatedLatencyMs?: number;

  /** Simulate failures (probability 0-1) */
  failureProbability?: number;
}

/**
 * Union type for all HSM configurations
 */
export type HSMConfig = VaultConfig | MockHSMConfig;

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;

  /** Check latency in milliseconds */
  latencyMs: number;

  /** Whether encryption key is available */
  keyAvailable: boolean;

  /** Vault seal status (Vault only) */
  sealStatus?: 'unsealed' | 'sealed';

  /** Provider version */
  version?: string;

  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Encryption result
 */
export interface EncryptResult {
  /** Encrypted data (ciphertext) */
  ciphertext: Buffer;

  /** Key version used for encryption */
  keyVersion: number;

  /** Encryption algorithm identifier */
  algorithm: string;

  /** Storage ID (hash of ciphertext for dedup) */
  storageId: string;
}

/**
 * Decryption result
 */
export interface DecryptResult {
  /** Decrypted data (plaintext) */
  plaintext: Buffer;

  /** Key version used for decryption */
  keyVersion: number;

  /** Whether hash verification passed */
  verified: boolean;
}

/**
 * Key information
 */
export interface KeyInfo {
  /** Key name */
  name: string;

  /** Current key version */
  currentVersion: number;

  /** Minimum decryption version */
  minDecryptionVersion: number;

  /** Key type (e.g., 'aes256-gcm96') */
  type: string;

  /** Whether convergent encryption is enabled */
  convergentEncryption: boolean;

  /** Whether key is derived */
  derived: boolean;

  /** Whether key is exportable */
  exportable: boolean;

  /** Key creation time */
  createdAt: Date;

  /** Last rotation time */
  lastRotatedAt?: Date;
}

/**
 * Key rotation result
 */
export interface RotateKeyResult {
  /** New key version */
  newVersion: number;

  /** Previous key version */
  previousVersion: number;

  /** Rotation timestamp */
  rotatedAt: Date;
}

/**
 * Rewrap result (re-encrypt with new key version)
 */
export interface RewrapResult {
  /** Re-encrypted ciphertext */
  ciphertext: Buffer;

  /** New key version */
  keyVersion: number;
}

// =============================================================================
// HSM PROVIDER INTERFACE
// =============================================================================

/**
 * HSM Provider Interface
 *
 * Defines the contract for all HSM implementations.
 * Providers must implement convergent encryption where:
 * - Same plaintext + same context = same ciphertext (deterministic)
 * - Encryption keys never leave the HSM boundary
 * - Context is used for key derivation (content hash)
 *
 * @example
 * ```typescript
 * const provider = new VaultProvider(config);
 * await provider.connect();
 *
 * // Encrypt content
 * const result = await provider.encrypt(content, contentHash);
 *
 * // Same content + hash = same ciphertext (convergent)
 * const result2 = await provider.encrypt(content, contentHash);
 * assert(result.ciphertext.equals(result2.ciphertext));
 *
 * // Decrypt
 * const decrypted = await provider.decrypt(result.ciphertext, contentHash);
 * ```
 */
export interface HSMProvider {
  /** Provider type identifier */
  readonly type: HSMProviderType;

  /** Provider name (for logging) */
  readonly name: string;

  /** Whether provider is connected and ready */
  readonly isConnected: boolean;

  /**
   * Connect to the HSM provider
   *
   * Authenticates and verifies connectivity.
   * Must be called before any other operations.
   *
   * @throws HSMError if connection fails
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the HSM provider
   *
   * Cleans up resources and closes connections.
   */
  disconnect(): Promise<void>;

  /**
   * Perform health check
   *
   * Verifies provider connectivity and key availability.
   *
   * @returns Health check result
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Encrypt data using convergent encryption
   *
   * Uses the content hash as "context" for deterministic key derivation.
   * Same plaintext + same context = same ciphertext.
   *
   * @param plaintext - Data to encrypt
   * @param context - Content hash (64 hex chars) used for key derivation
   * @returns Encryption result with ciphertext and metadata
   * @throws HSMError if encryption fails
   */
  encrypt(plaintext: Buffer, context: string): Promise<EncryptResult>;

  /**
   * Decrypt data
   *
   * @param ciphertext - Encrypted data
   * @param context - Content hash used during encryption
   * @returns Decryption result with plaintext
   * @throws HSMError if decryption fails
   */
  decrypt(ciphertext: Buffer, context: string): Promise<DecryptResult>;

  /**
   * Get key information
   *
   * Returns metadata about the encryption key (not key material).
   *
   * @returns Key information
   */
  getKeyInfo(): Promise<KeyInfo>;

  /**
   * Rotate encryption key
   *
   * Creates a new key version. Old versions remain valid for decryption.
   *
   * @returns Rotation result
   * @throws HSMError if rotation fails
   */
  rotateKey(): Promise<RotateKeyResult>;

  /**
   * Rewrap ciphertext with current key version
   *
   * Re-encrypts data with the latest key version without exposing plaintext.
   * Used during key rotation to update old ciphertexts.
   *
   * @param ciphertext - Data encrypted with old key version
   * @param context - Content hash used during encryption
   * @returns Rewrap result with new ciphertext
   */
  rewrap(ciphertext: Buffer, context: string): Promise<RewrapResult>;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * HSM error codes
 */
export const HSMErrorCodes = {
  /** Connection failed */
  CONNECTION_FAILED: 'HSM_CONNECTION_FAILED',
  /** Authentication failed */
  AUTH_FAILED: 'HSM_AUTH_FAILED',
  /** Encryption failed */
  ENCRYPT_FAILED: 'HSM_ENCRYPT_FAILED',
  /** Decryption failed */
  DECRYPT_FAILED: 'HSM_DECRYPT_FAILED',
  /** Key not found */
  KEY_NOT_FOUND: 'HSM_KEY_NOT_FOUND',
  /** Key rotation failed */
  ROTATION_FAILED: 'HSM_ROTATION_FAILED',
  /** Operation timeout */
  TIMEOUT: 'HSM_TIMEOUT',
  /** Provider sealed (Vault) */
  SEALED: 'HSM_SEALED',
  /** Invalid context (content hash) */
  INVALID_CONTEXT: 'HSM_INVALID_CONTEXT',
  /** Configuration error */
  CONFIG_ERROR: 'HSM_CONFIG_ERROR',
  /** Unknown error */
  UNKNOWN: 'HSM_UNKNOWN',
} as const;

export type HSMErrorCode = (typeof HSMErrorCodes)[keyof typeof HSMErrorCodes];

/**
 * HSM Error class
 */
export class HSMError extends Error {
  constructor(
    message: string,
    public readonly code: HSMErrorCode,
    public readonly provider?: HSMProviderType,
    public readonly cause?: Error,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HSMError';

    // Capture original stack trace
    if (cause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  /**
   * Create error from unknown catch value
   */
  static fromError(
    err: unknown,
    code: HSMErrorCode = HSMErrorCodes.UNKNOWN,
    provider?: HSMProviderType,
  ): HSMError {
    if (err instanceof HSMError) {
      return err;
    }

    const error = err instanceof Error ? err : new Error(String(err));
    return new HSMError(error.message, code, provider, error);
  }

  /**
   * Check if error is retryable
   */
  get isRetryable(): boolean {
    const retryableCodes: HSMErrorCode[] = [
      HSMErrorCodes.CONNECTION_FAILED,
      HSMErrorCodes.TIMEOUT,
      HSMErrorCodes.SEALED,
    ];
    return retryableCodes.includes(this.code);
  }
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Logger interface for HSM operations
 */
export interface HSMLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Metrics collector interface
 */
export interface HSMMetrics {
  /** Record encryption operation */
  recordEncrypt(durationMs: number, success: boolean, keyVersion: number): void;

  /** Record decryption operation */
  recordDecrypt(durationMs: number, success: boolean, keyVersion: number): void;

  /** Record health check */
  recordHealthCheck(durationMs: number, healthy: boolean): void;

  /** Record connection attempt */
  recordConnection(success: boolean): void;
}

/**
 * Default no-op logger
 */
export const noopLogger: HSMLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Default no-op metrics
 */
export const noopMetrics: HSMMetrics = {
  recordEncrypt: () => {},
  recordDecrypt: () => {},
  recordHealthCheck: () => {},
  recordConnection: () => {},
};
