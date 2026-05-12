/**
 * @fileoverview HashiCorp Vault HSM Provider
 *
 * Implements HSMProvider using Vault Transit secrets engine for convergent encryption.
 * Supports token, AppRole, and Kubernetes authentication methods.
 *
 * @module @gertsai/hsm/providers/vault
 */

import { createHash } from 'crypto';
import type {
  HSMProvider,
  VaultConfig,
  HealthCheckResult,
  EncryptResult,
  DecryptResult,
  KeyInfo,
  RotateKeyResult,
  RewrapResult,
  HSMLogger,
  HSMMetrics,
  HSMErrorCode,
} from '../types.js';
import { HSMProviderTypes, HSMError, HSMErrorCodes, noopLogger, noopMetrics } from '../types.js';
import { withRetry, type RetryOptions } from '../utils/retry.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Vault API response types
 */
interface VaultHealthResponse {
  initialized: boolean;
  sealed: boolean;
  standby: boolean;
  performance_standby: boolean;
  replication_performance_mode: string;
  replication_dr_mode: string;
  server_time_utc: number;
  version: string;
  cluster_name: string;
  cluster_id: string;
}

interface VaultEncryptResponse {
  data: {
    ciphertext: string;
    key_version: number;
  };
}

interface VaultDecryptResponse {
  data: {
    plaintext: string;
    key_version?: number;
  };
}

interface VaultKeyResponse {
  data: {
    name: string;
    type: string;
    keys: Record<
      string,
      {
        creation_time: string;
      }
    >;
    derived: boolean;
    exportable: boolean;
    allow_plaintext_backup: boolean;
    latest_version: number;
    min_decryption_version: number;
    min_encryption_version: number;
    convergent_encryption: boolean;
  };
}

interface VaultRewrapResponse {
  data: {
    ciphertext: string;
    key_version: number;
  };
}

interface VaultAuthResponse {
  auth: {
    client_token: string;
    accessor: string;
    policies: string[];
    token_policies: string[];
    metadata: Record<string, string>;
    lease_duration: number;
    renewable: boolean;
  };
}

// =============================================================================
// VAULT PROVIDER
// =============================================================================

/**
 * HashiCorp Vault HSM Provider
 *
 * Implements convergent encryption using Vault Transit secrets engine.
 *
 * @example
 * ```typescript
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
 * await provider.connect();
 * const result = await provider.encrypt(content, contentHash);
 * ```
 */
export class VaultProvider implements HSMProvider {
  readonly type = HSMProviderTypes.VAULT;
  readonly name = 'HashiCorp Vault';

  private _isConnected = false;
  private _token: string | null = null;
  private readonly logger: HSMLogger;
  private readonly metrics: HSMMetrics;
  private readonly retryOptions: RetryOptions;

  constructor(
    private readonly config: VaultConfig,
    options?: {
      logger?: HSMLogger;
      metrics?: HSMMetrics;
    },
  ) {
    this.logger = options?.logger ?? noopLogger;
    this.metrics = options?.metrics ?? noopMetrics;
    this.retryOptions = {
      attempts: config.retryAttempts,
      delayMs: config.retryDelayMs,
      backoffMultiplier: 2,
      maxDelayMs: 30000,
    };
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ===========================================================================
  // CONNECTION
  // ===========================================================================

  async connect(): Promise<void> {
    this.logger.info('Connecting to Vault', { address: this.config.address });

    try {
      // Authenticate based on method
      switch (this.config.authMethod) {
        case 'token':
          this._token = this.config.token ?? null;
          if (!this._token) {
            throw new HSMError(
              'Token required for token auth',
              HSMErrorCodes.CONFIG_ERROR,
              'vault',
            );
          }
          break;

        case 'approle':
          await this.authenticateAppRole();
          break;

        case 'kubernetes':
          await this.authenticateKubernetes();
          break;

        default:
          throw new HSMError(
            `Unsupported auth method: ${this.config.authMethod}`,
            HSMErrorCodes.CONFIG_ERROR,
            'vault',
          );
      }

      // Verify connectivity and key availability
      const health = await this.healthCheck();
      if (!health.healthy) {
        throw new HSMError(
          `Vault health check failed: ${JSON.stringify(health)}`,
          HSMErrorCodes.CONNECTION_FAILED,
          'vault',
        );
      }

      this._isConnected = true;
      this.metrics.recordConnection(true);
      this.logger.info('Connected to Vault', {
        version: health.version,
        keyAvailable: health.keyAvailable,
      });
    } catch (err) {
      this.metrics.recordConnection(false);
      throw HSMError.fromError(err, HSMErrorCodes.CONNECTION_FAILED, 'vault');
    }
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Vault');
    this._isConnected = false;
    this._token = null;
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  private async authenticateAppRole(): Promise<void> {
    if (!this.config.roleId || !this.config.secretId) {
      throw new HSMError(
        'role_id and secret_id required for AppRole auth',
        HSMErrorCodes.CONFIG_ERROR,
        'vault',
      );
    }

    const response = await this.request<VaultAuthResponse>('POST', '/v1/auth/approle/login', {
      role_id: this.config.roleId,
      secret_id: this.config.secretId,
    });

    this._token = response.auth.client_token;
    this.logger.debug('AppRole authentication successful', {
      policies: response.auth.policies,
      ttl: response.auth.lease_duration,
    });
  }

  private async authenticateKubernetes(): Promise<void> {
    // Read service account token from default path
    const fs = await import('fs/promises');
    const jwtPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';

    let jwt: string;
    try {
      jwt = await fs.readFile(jwtPath, 'utf-8');
    } catch {
      throw new HSMError(
        `Failed to read Kubernetes service account token from ${jwtPath}`,
        HSMErrorCodes.AUTH_FAILED,
        'vault',
      );
    }

    const response = await this.request<VaultAuthResponse>('POST', '/v1/auth/kubernetes/login', {
      jwt,
      role: this.config.kubernetesRole ?? 'files-service',
    });

    this._token = response.auth.client_token;
    this.logger.debug('Kubernetes authentication successful', {
      policies: response.auth.policies,
      ttl: response.auth.lease_duration,
    });
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    let healthy = false;
    let keyAvailable = false;
    let sealStatus: 'unsealed' | 'sealed' = 'sealed';
    let version: string | undefined;

    try {
      // Check Vault health
      const healthResponse = await this.request<VaultHealthResponse>(
        'GET',
        '/v1/sys/health',
        undefined,
        false, // Don't require auth for health check
      );

      sealStatus = healthResponse.sealed ? 'sealed' : 'unsealed';
      version = healthResponse.version;

      if (healthResponse.sealed) {
        return {
          healthy: false,
          latencyMs: Date.now() - start,
          keyAvailable: false,
          sealStatus,
          version,
          details: { error: 'Vault is sealed' },
        };
      }

      // Check key availability (direct request, no ensureConnected check)
      try {
        await this.request<VaultKeyResponse>(
          'GET',
          `/v1/${this.config.transitMount}/keys/${this.config.keyName}`,
        );
        keyAvailable = true;
      } catch (err) {
        this.logger.warn('Key not available', {
          keyName: this.config.keyName,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      healthy = keyAvailable;
    } catch (err) {
      this.logger.error('Health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const latencyMs = Date.now() - start;
    this.metrics.recordHealthCheck(latencyMs, healthy);

    return {
      healthy,
      latencyMs,
      keyAvailable,
      sealStatus,
      ...(version !== undefined && { version }),
    };
  }

  // ===========================================================================
  // ENCRYPTION
  // ===========================================================================

  async encrypt(plaintext: Buffer, context: string): Promise<EncryptResult> {
    this.ensureConnected();
    this.validateContext(context);

    const start = Date.now();
    let success = false;
    let keyVersion = 0;

    try {
      const result = await withRetry(
        async () => {
          const response = await this.request<VaultEncryptResponse>(
            'POST',
            `/v1/${this.config.transitMount}/encrypt/${this.config.keyName}`,
            {
              plaintext: plaintext.toString('base64'),
              context: this.hashContext(context),
            },
          );

          return response;
        },
        this.retryOptions,
        (err) => err instanceof HSMError && err.isRetryable,
      );

      keyVersion = result.data.key_version;

      // Decode ciphertext (Vault returns vault:v1:base64...)
      const ciphertextParts = result.data.ciphertext.split(':');
      if (ciphertextParts.length < 3) {
        throw new HSMError(
          'Invalid ciphertext format from Vault',
          HSMErrorCodes.ENCRYPT_FAILED,
          'vault',
        );
      }

      // Store full Vault ciphertext for proper decryption
      const ciphertext = Buffer.from(result.data.ciphertext, 'utf-8');

      // Compute storage ID (hash of ciphertext for dedup)
      const storageId = createHash('sha256').update(ciphertext).digest('hex');

      success = true;
      this.logger.debug('Encryption successful', {
        contextHash: context.slice(0, 8),
        keyVersion,
        ciphertextLength: ciphertext.length,
      });

      return {
        ciphertext,
        keyVersion,
        algorithm: 'aes256-gcm96',
        storageId,
      };
    } catch (err) {
      throw HSMError.fromError(err, HSMErrorCodes.ENCRYPT_FAILED, 'vault');
    } finally {
      this.metrics.recordEncrypt(Date.now() - start, success, keyVersion);
    }
  }

  async decrypt(ciphertext: Buffer, context: string): Promise<DecryptResult> {
    this.ensureConnected();
    this.validateContext(context);

    const start = Date.now();
    let success = false;
    let keyVersion = 0;

    try {
      const result = await withRetry(
        async () => {
          const response = await this.request<VaultDecryptResponse>(
            'POST',
            `/v1/${this.config.transitMount}/decrypt/${this.config.keyName}`,
            {
              ciphertext: ciphertext.toString('utf-8'),
              context: this.hashContext(context),
            },
          );

          return response;
        },
        this.retryOptions,
        (err) => err instanceof HSMError && err.isRetryable,
      );

      keyVersion = result.data.key_version ?? 1;
      const plaintext = Buffer.from(result.data.plaintext, 'base64');

      // Verify content hash matches context
      const computedHash = createHash('sha256').update(plaintext).digest('hex');
      const verified = computedHash === context;

      if (!verified) {
        this.logger.warn('Content hash verification failed', {
          expected: context.slice(0, 8),
          computed: computedHash.slice(0, 8),
        });
      }

      success = true;
      this.logger.debug('Decryption successful', {
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
      throw HSMError.fromError(err, HSMErrorCodes.DECRYPT_FAILED, 'vault');
    } finally {
      this.metrics.recordDecrypt(Date.now() - start, success, keyVersion);
    }
  }

  // ===========================================================================
  // KEY MANAGEMENT
  // ===========================================================================

  async getKeyInfo(): Promise<KeyInfo> {
    this.ensureConnected();

    const response = await this.request<VaultKeyResponse>(
      'GET',
      `/v1/${this.config.transitMount}/keys/${this.config.keyName}`,
    );

    const keys = response.data.keys;
    const versions = Object.keys(keys).map(Number);
    const latestVersion = Math.max(...versions);
    const firstVersion = Math.min(...versions);

    return {
      name: response.data.name,
      currentVersion: response.data.latest_version,
      minDecryptionVersion: response.data.min_decryption_version,
      type: response.data.type,
      convergentEncryption: response.data.convergent_encryption,
      derived: response.data.derived,
      exportable: response.data.exportable,
      createdAt: new Date(keys[firstVersion.toString()]?.creation_time ?? Date.now()),
      ...(latestVersion > 1 && {
        lastRotatedAt: new Date(keys[latestVersion.toString()]?.creation_time ?? Date.now()),
      }),
    };
  }

  async rotateKey(): Promise<RotateKeyResult> {
    this.ensureConnected();

    const beforeInfo = await this.getKeyInfo();

    await this.request(
      'POST',
      `/v1/${this.config.transitMount}/keys/${this.config.keyName}/rotate`,
    );

    const afterInfo = await this.getKeyInfo();

    this.logger.info('Key rotated', {
      keyName: this.config.keyName,
      previousVersion: beforeInfo.currentVersion,
      newVersion: afterInfo.currentVersion,
    });

    return {
      newVersion: afterInfo.currentVersion,
      previousVersion: beforeInfo.currentVersion,
      rotatedAt: new Date(),
    };
  }

  async rewrap(ciphertext: Buffer, context: string): Promise<RewrapResult> {
    this.ensureConnected();
    this.validateContext(context);

    const response = await this.request<VaultRewrapResponse>(
      'POST',
      `/v1/${this.config.transitMount}/rewrap/${this.config.keyName}`,
      {
        ciphertext: ciphertext.toString('utf-8'),
        context: this.hashContext(context),
      },
    );

    const newCiphertext = Buffer.from(response.data.ciphertext, 'utf-8');

    this.logger.debug('Rewrap successful', {
      contextHash: context.slice(0, 8),
      newKeyVersion: response.data.key_version,
    });

    return {
      ciphertext: newCiphertext,
      keyVersion: response.data.key_version,
    };
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  private ensureConnected(): void {
    if (!this._isConnected) {
      throw new HSMError('Not connected to Vault', HSMErrorCodes.CONNECTION_FAILED, 'vault');
    }
  }

  private validateContext(context: string): void {
    // Context must be valid SHA-256 hash (64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(context)) {
      throw new HSMError(
        'Invalid context: must be SHA-256 hash (64 hex chars)',
        HSMErrorCodes.INVALID_CONTEXT,
        'vault',
        undefined,
        { context: context.slice(0, 20) },
      );
    }
  }

  /**
   * Hash context for Vault
   *
   * Vault requires context to be base64-encoded.
   * We use the raw bytes of the hex hash to ensure deterministic derivation.
   */
  private hashContext(context: string): string {
    // Convert hex hash to raw bytes, then base64
    return Buffer.from(context, 'hex').toString('base64');
  }

  /**
   * Make HTTP request to Vault API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    requireAuth = true,
  ): Promise<T> {
    const url = `${this.config.address}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add auth header
    if (requireAuth && this._token) {
      headers['X-Vault-Token'] = this._token;
    }

    // Add namespace header
    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const fetchInit: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };
      // Only attach body for non-GET methods (GET cannot have a body per Fetch spec)
      if (body && method !== 'GET') {
        fetchInit.body = JSON.stringify(body);
      }
      const response = await fetch(url, fetchInit);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Vault request failed: ${response.status} ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.errors?.length) {
            errorMessage = `Vault error: ${errorJson.errors.join(', ')}`;
          }
        } catch {
          if (errorText) {
            errorMessage += `: ${errorText}`;
          }
        }

        // Map HTTP status to error code
        let code: HSMErrorCode = HSMErrorCodes.UNKNOWN;
        if (response.status === 401 || response.status === 403) {
          code = HSMErrorCodes.AUTH_FAILED;
        } else if (response.status === 404) {
          code = HSMErrorCodes.KEY_NOT_FOUND;
        } else if (response.status === 503) {
          code = HSMErrorCodes.SEALED;
        }

        throw new HSMError(errorMessage, code, 'vault');
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof HSMError) {
        throw err;
      }

      // Handle abort (timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new HSMError(
          `Vault request timed out after ${this.config.timeoutMs}ms`,
          HSMErrorCodes.TIMEOUT,
          'vault',
        );
      }

      // Handle network errors
      if (err instanceof Error && err.message.includes('fetch')) {
        throw new HSMError(
          `Failed to connect to Vault: ${err.message}`,
          HSMErrorCodes.CONNECTION_FAILED,
          'vault',
          err,
        );
      }

      throw HSMError.fromError(err, HSMErrorCodes.UNKNOWN, 'vault');
    } finally {
      clearTimeout(timeout);
    }
  }
}
