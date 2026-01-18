/**
 * OpenFGA Client Wrapper for gerts.ai
 *
 * Provides a typed wrapper around @openfga/sdk with:
 * - Singleton pattern for connection reuse
 * - Automatic store/model discovery
 * - Retry logic with exponential backoff
 * - Typed methods matching our model.fga
 */

import { OpenFgaClient } from '@openfga/sdk';
import type {
  FgaClientConfig,
  FgaResolvedConfig,
  FgaCheckRequest,
  FgaCheckResponse,
  FgaListObjectsRequest,
  FgaListUsersRequest,
  FgaTupleKey,
  FgaResourceType,
} from './types.js';
import { FGA_DEFAULT_CONFIG, userString, objectString } from './constants.js';

// =============================================================================
// Singleton Instance
// =============================================================================

let clientInstance: GertsFgaClient | null = null;

/**
 * Gets or creates the singleton OpenFGA client.
 */
export function getFgaClient(config?: FgaClientConfig): GertsFgaClient {
  if (!clientInstance) {
    clientInstance = new GertsFgaClient(config);
  }
  return clientInstance;
}

/**
 * Resets the singleton client (for testing).
 */
export function resetFgaClient(): void {
  clientInstance = null;
}

// =============================================================================
// Client Class
// =============================================================================

/**
 * Typed OpenFGA client for gerts.ai authorization.
 */
export class GertsFgaClient {
  private client: OpenFgaClient | null = null;
  private config: FgaClientConfig;
  private resolvedConfig: FgaResolvedConfig | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config?: FgaClientConfig) {
    this.config = {
      apiUrl: config?.apiUrl ?? FGA_DEFAULT_CONFIG.apiUrl,
      storeId: config?.storeId,
      authorizationModelId: config?.authorizationModelId,
      timeout: config?.timeout ?? FGA_DEFAULT_CONFIG.timeout,
      retry: config?.retry ?? FGA_DEFAULT_CONFIG.retry,
    };
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Initializes the client, discovering store and model if needed.
   */
  async initialize(): Promise<FgaResolvedConfig> {
    if (this.resolvedConfig) {
      return this.resolvedConfig;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.resolvedConfig!;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
    return this.resolvedConfig!;
  }

  private async doInitialize(): Promise<void> {
    const clientConfig = {
      apiUrl: this.config.apiUrl!,
    };

    // Create initial client for discovery
    let tempClient = new OpenFgaClient(clientConfig);

    // Discover or use provided storeId
    let storeId = this.config.storeId;
    if (!storeId) {
      const stores = await tempClient.listStores();
      const gertsStore = stores.stores?.find((s) => s.name === FGA_DEFAULT_CONFIG.storeName);

      if (gertsStore) {
        storeId = gertsStore.id!;
      } else {
        // Create store if it doesn't exist
        const created = await tempClient.createStore({ name: FGA_DEFAULT_CONFIG.storeName });
        storeId = created.id!;
      }
    }

    // Recreate client with storeId
    tempClient = new OpenFgaClient({
      ...clientConfig,
      storeId,
    });

    // Discover or use provided authorizationModelId
    let authorizationModelId = this.config.authorizationModelId;
    if (!authorizationModelId) {
      const models = await tempClient.readAuthorizationModels();
      if (models.authorization_models && models.authorization_models.length > 0) {
        // Use the latest model
        authorizationModelId = models.authorization_models[0].id;
      }
    }

    // Create final client
    this.client = new OpenFgaClient({
      ...clientConfig,
      storeId,
      authorizationModelId,
    });

    this.resolvedConfig = {
      apiUrl: this.config.apiUrl!,
      storeId,
      authorizationModelId: authorizationModelId ?? '',
      timeout: this.config.timeout!,
    };
  }

  /**
   * Gets the underlying OpenFGA client (initializes if needed).
   */
  async getClient(): Promise<OpenFgaClient> {
    await this.initialize();
    return this.client!;
  }

  /**
   * Gets the resolved configuration.
   */
  getResolvedConfig(): FgaResolvedConfig | null {
    return this.resolvedConfig;
  }

  // ---------------------------------------------------------------------------
  // Check Operations
  // ---------------------------------------------------------------------------

  /**
   * Checks if a user has a specific relation on an object.
   *
   * @example
   * ```typescript
   * const allowed = await client.check({
   *   userId: '123',
   *   relation: 'viewer',
   *   resourceType: 'project',
   *   resourceId: 'demo',
   * });
   * // → { allowed: true }
   * ```
   */
  async check(request: FgaCheckRequest): Promise<FgaCheckResponse> {
    const client = await this.getClient();

    const result = await this.withRetry(() =>
      client.check({
        user: userString(request.userId),
        relation: request.relation,
        object: objectString(request.resourceType, request.resourceId),
      }),
    );

    return { allowed: result.allowed ?? false };
  }

  /**
   * Batch check multiple permissions in one request.
   * Requires OpenFGA v1.8.0+
   */
  async batchCheck(
    requests: FgaCheckRequest[],
  ): Promise<Array<{ request: FgaCheckRequest; allowed: boolean }>> {
    const client = await this.getClient();

    const checks = requests.map((req, index) => ({
      user: userString(req.userId),
      relation: req.relation,
      object: objectString(req.resourceType, req.resourceId),
      correlationId: String(index),
    }));

    const { result } = await this.withRetry(() => client.batchCheck({ checks }));

    return (result ?? []).map((r) => ({
      request: requests[parseInt(r.correlationId!, 10)],
      allowed: r.allowed ?? false,
    }));
  }

  // ---------------------------------------------------------------------------
  // List Operations
  // ---------------------------------------------------------------------------

  /**
   * Lists objects of a type that a user has access to.
   *
   * @example
   * ```typescript
   * const projects = await client.listObjects({
   *   userId: '123',
   *   relation: 'viewer',
   *   resourceType: 'project',
   * });
   * // → ['project:demo', 'project:test']
   * ```
   */
  async listObjects(request: FgaListObjectsRequest): Promise<string[]> {
    const client = await this.getClient();

    const result = await this.withRetry(() =>
      client.listObjects({
        user: userString(request.userId),
        relation: request.relation,
        type: request.resourceType,
      }),
    );

    return result.objects ?? [];
  }

  /**
   * Lists users that have a specific relation on an object.
   *
   * @example
   * ```typescript
   * const viewers = await client.listUsers({
   *   resourceType: 'project',
   *   resourceId: 'demo',
   *   relation: 'viewer',
   * });
   * // → ['user:123', 'user:456']
   * ```
   */
  async listUsers(request: FgaListUsersRequest): Promise<string[]> {
    const client = await this.getClient();

    const result = await this.withRetry(() =>
      client.listUsers({
        object: {
          type: request.resourceType,
          id: request.resourceId,
        },
        relation: request.relation,
        user_filters: [{ type: 'user' }],
      }),
    );

    return (result.users ?? []).map((u) => {
      if ('object' in u && u.object) {
        return `${u.object.type}:${u.object.id}`;
      }
      return '';
    }).filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Write Operations
  // ---------------------------------------------------------------------------

  /**
   * Writes relationship tuples.
   *
   * @example
   * ```typescript
   * await client.writeTuples([
   *   { user: 'user:123', relation: 'viewer', object: 'project:demo' },
   * ]);
   * ```
   */
  async writeTuples(tuples: FgaTupleKey[]): Promise<void> {
    if (tuples.length === 0) return;

    const client = await this.getClient();
    await this.withRetry(() => client.writeTuples(tuples));
  }

  /**
   * Deletes relationship tuples.
   */
  async deleteTuples(tuples: FgaTupleKey[]): Promise<void> {
    if (tuples.length === 0) return;

    const client = await this.getClient();
    await this.withRetry(() => client.deleteTuples(tuples));
  }

  /**
   * Writes and deletes tuples in a single transaction.
   */
  async write(options: { writes?: FgaTupleKey[]; deletes?: FgaTupleKey[] }): Promise<void> {
    if (!options.writes?.length && !options.deletes?.length) return;

    const client = await this.getClient();
    await this.withRetry(() =>
      client.write({
        writes: options.writes,
        deletes: options.deletes,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Convenience Methods
  // ---------------------------------------------------------------------------

  /**
   * Grants a user access to a resource.
   */
  async grantAccess(
    userId: string,
    relation: string,
    resourceType: FgaResourceType,
    resourceId: string,
  ): Promise<void> {
    await this.writeTuples([
      {
        user: userString(userId),
        relation,
        object: objectString(resourceType, resourceId),
      },
    ]);
  }

  /**
   * Revokes a user's access to a resource.
   */
  async revokeAccess(
    userId: string,
    relation: string,
    resourceType: FgaResourceType,
    resourceId: string,
  ): Promise<void> {
    await this.deleteTuples([
      {
        user: userString(userId),
        relation,
        object: objectString(resourceType, resourceId),
      },
    ]);
  }

  /**
   * Adds a user to a tenant.
   */
  async addUserToTenant(userId: string, tenantId: string, role: 'member' | 'admin' = 'member'): Promise<void> {
    await this.writeTuples([
      {
        user: userString(userId),
        relation: role,
        object: objectString('tenant', tenantId),
      },
    ]);
  }

  /**
   * Adds a user to a team.
   */
  async addUserToTeam(
    userId: string,
    teamId: string,
    role: 'member' | 'lead' | 'admin' = 'member',
  ): Promise<void> {
    await this.writeTuples([
      {
        user: userString(userId),
        relation: role,
        object: objectString('team', teamId),
      },
    ]);
  }

  /**
   * Assigns a role to a user.
   */
  async assignRole(userId: string, roleId: string): Promise<void> {
    await this.writeTuples([
      {
        user: userString(userId),
        relation: 'assignee',
        object: objectString('role', roleId),
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Retry Logic
  // ---------------------------------------------------------------------------

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const { maxAttempts, initialDelay, maxDelay } = this.config.retry ?? FGA_DEFAULT_CONFIG.retry;

    let lastError: Error | null = null;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (error instanceof Error && 'statusCode' in error) {
          const statusCode = (error as { statusCode: number }).statusCode;
          if (statusCode >= 400 && statusCode < 500) {
            throw error;
          }
        }

        if (attempt < maxAttempts) {
          await this.sleep(delay);
          delay = Math.min(delay * 2, maxDelay);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
