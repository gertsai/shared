/**
 * OpenFGA Client Wrapper for gerts.ai
 *
 * Provides a typed wrapper around @openfga/sdk with:
 * - Singleton pattern for connection reuse
 * - Automatic store/model discovery
 * - Retry logic with exponential backoff
 * - Typed methods matching our model.fga
 */

import { OpenFgaClient, CredentialsMethod } from '@openfga/sdk';
import type {
  FgaClientConfig,
  FgaResolvedConfig,
  FgaCheckRequest,
  FgaCheckResponse,
  FgaListObjectsRequest,
  FgaListUsersRequest,
  FgaTupleKey,
  FgaResourceType,
  FgaExpandRequest,
  FgaExpandNode,
} from './types.js';
import { FGA_DEFAULT_CONFIG, userString, objectString } from './constants.js';
import { fingerprint } from './util/fingerprint.js';
import { LruTtlMap, type LruTtlMapOptions } from './internal/lru-ttl-map.js';

/**
 * SDK constructor options shape, exposed as a local alias so the
 * `buildSdkConfig` helper has a single named return type. This is
 * narrower than the SDK-exported type (we only ever set a known subset
 * of fields) and intentional — extending requires a deliberate edit
 * here rather than a transitive surface bump.
 */
type SdkClientOptions = {
  apiUrl: string;
  storeId?: string;
  authorizationModelId?: string;
  credentials?: {
    method: CredentialsMethod.ApiToken;
    config: { token: string };
  };
};

// =============================================================================
// Multi-Instance Cache (Wave 6.3 / ADR-012)
// =============================================================================

/**
 * Bounded LRU+TTL cache of `GertsFgaClient` instances keyed by
 * fingerprint of their `FgaClientConfig`. Replaces the pre-Wave-6.3
 * `let clientInstance: GertsFgaClient | null` global so distinct
 * configs (e.g. multiple OpenFGA stores in a multi-tenant SaaS) can
 * coexist without aliasing.
 *
 * Wave 7.4 (PRD-011 / RFC-007 / ADR-013): cache is an {@link LruTtlMap}
 * rather than an unbounded `Map` to defend against CWE-770 unbounded
 * resource consumption in long-lived processes that mint many
 * fingerprints over time (e.g. per-tenant config drift).
 *
 * Backwards compat: callers passing the same config (or no config) in
 * a single-config workload observe identical behaviour to the pre-
 * Wave-6.3 singleton — same fingerprint → same cached instance, so
 * long as the entry has not been evicted by LRU/TTL.
 *
 * NEVER store apiToken as plaintext in keys: `fingerprint()` SHA-256
 * hashes the canonical JSON before keying. See ADR-012 invariant I-2.
 */
const DEFAULT_CLIENT_LRU_OPTIONS: Required<Pick<LruTtlMapOptions, 'maxSize' | 'ttlMs'>> = {
  maxSize: 1000,
  ttlMs: 5 * 60 * 1000, // 5 minutes sliding TTL
};

let clientInstances: LruTtlMap<string, GertsFgaClient> = new LruTtlMap<string, GertsFgaClient>(
  DEFAULT_CLIENT_LRU_OPTIONS,
);

/**
 * Reconfigure the LRU+TTL cache used by `getFgaClient`.
 *
 * Wave 7.4 (RFC-007): exposes the `maxSize` / `ttlMs` / `now` knobs of
 * the underlying {@link LruTtlMap} for ops/tests. Calling this
 * **discards** the existing cache — equivalent to `resetFgaClient()`
 * followed by a fresh allocation.
 *
 * Defaults: `{ maxSize: 1000, ttlMs: 300_000 }` (5 min sliding TTL).
 */
export function configureFgaClientCache(opts?: LruTtlMapOptions): void {
  clientInstances = new LruTtlMap<string, GertsFgaClient>({
    ...DEFAULT_CLIENT_LRU_OPTIONS,
    ...opts,
  });
}

/**
 * Get-or-create a `GertsFgaClient` for the given config. Same config
 * (any property order) returns the same cached instance — as long as
 * the entry has not been evicted by LRU/TTL.
 *
 * Wave 6.3 (ADR-012): cache is keyed by fingerprint instead of being a
 * single global. Backward-compat: `getFgaClient()` no-arg uses a stable
 * `__default__` key; one-config workloads behave identically.
 *
 * Wave 7.4 (PRD-011): cache is now bounded (default 1000 entries, 5 min
 * sliding TTL). If your workload requires different bounds, call
 * {@link configureFgaClientCache} once at startup.
 */
export function getFgaClient(config?: FgaClientConfig): GertsFgaClient {
  const key = fingerprint(config);
  let inst = clientInstances.get(key);
  if (!inst) {
    inst = new GertsFgaClient(config);
    clientInstances.set(key, inst);
  }
  return inst;
}

/**
 * Always-fresh factory — never consults the cache, never inserts
 * into it. Use for per-request clients with deliberately ephemeral
 * scope, or when you want to opt out of fingerprint caching entirely.
 *
 * Wave 6.3 (ADR-012 §Decision): explicit escape hatch for the
 * non-cached path. Caller is responsible for retaining the
 * reference; `resetFgaClient` does not affect instances created
 * via this factory.
 */
export function createFgaClient(config?: FgaClientConfig): GertsFgaClient {
  return new GertsFgaClient(config);
}

/**
 * Reset the cache.
 *
 * Wave 6.3 (ADR-012 invariant I-5): selective by config when arg
 * given; clears all when no arg. The no-arg path matches the legacy
 * "clear singleton" contract — existing tests that call
 * `resetFgaClient()` between scenarios continue to work unchanged.
 *
 * @param config — when supplied, evict only the entry whose
 *                 fingerprint matches `config`. When omitted, clear
 *                 all cached clients (back-compat).
 */
export function resetFgaClient(config?: FgaClientConfig): void {
  if (config === undefined) {
    clientInstances.clear();
    return;
  }
  clientInstances.delete(fingerprint(config));
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
      timeout: config?.timeout ?? FGA_DEFAULT_CONFIG.timeout,
      retry: config?.retry ?? FGA_DEFAULT_CONFIG.retry,
      ...(config?.storeId !== undefined && { storeId: config.storeId }),
      ...(config?.authorizationModelId !== undefined && {
        authorizationModelId: config.authorizationModelId,
      }),
      ...(config?.apiToken !== undefined && { apiToken: config.apiToken }),
    };
  }

  /**
   * Build the per-call SDK options payload. Centralises the
   * conditional `credentials` branch so the three `new OpenFgaClient(...)`
   * sites in `doInitialize()` stay consistent.
   *
   * Wave 6.2 (RFC-003 Edge 1): when `apiToken` is set, the SDK is given
   * `{ method: ApiToken, config: { token } }`; when unset, `credentials`
   * is omitted entirely so the existing anonymous flow is preserved
   * (backwards-compat invariant I-1).
   */
  private buildSdkConfig(extra?: Pick<SdkClientOptions, 'storeId' | 'authorizationModelId'>): SdkClientOptions {
    const opts: SdkClientOptions = {
      apiUrl: this.config.apiUrl!,
      ...extra,
    };
    if (this.config.apiToken) {
      opts.credentials = {
        method: CredentialsMethod.ApiToken,
        config: { token: this.config.apiToken },
      };
    }
    return opts;
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
    // Create initial client for discovery (no storeId yet).
    let tempClient = new OpenFgaClient(this.buildSdkConfig());

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

    // Recreate client with storeId (token re-applied via buildSdkConfig)
    tempClient = new OpenFgaClient(this.buildSdkConfig({ storeId }));

    // Discover or use provided authorizationModelId
    let authorizationModelId = this.config.authorizationModelId;
    if (!authorizationModelId) {
      const models = await tempClient.readAuthorizationModels();
      if (models.authorization_models && models.authorization_models.length > 0) {
        // Use the latest model
        authorizationModelId = models.authorization_models[0]?.id;
      }
    }

    // Create final client (token re-applied via buildSdkConfig)
    this.client = new OpenFgaClient(
      this.buildSdkConfig(
        authorizationModelId !== undefined
          ? { storeId, authorizationModelId }
          : { storeId },
      ),
    );

    this.resolvedConfig = {
      apiUrl: this.config.apiUrl!,
      storeId,
      authorizationModelId: authorizationModelId ?? '',
      timeout: this.config.timeout!,
      ...(this.config.apiToken !== undefined && { apiToken: this.config.apiToken }),
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
   * @example Standard check (RBAC/ReBAC)
   * ```typescript
   * const allowed = await client.check({
   *   userId: '123',
   *   relation: 'viewer',
   *   resourceType: 'project',
   *   resourceId: 'demo',
   * });
   * // → { allowed: true }
   * ```
   *
   * @example Check with ABAC context
   * ```typescript
   * const allowed = await client.check({
   *   userId: '123',
   *   relation: 'can_view',
   *   resourceType: 'sensitive_project',
   *   resourceId: 'secret',
   *   context: {
   *     current_time: new Date().toISOString(),
   *     user_ip: '10.0.1.50',
   *     allowed_cidrs: ['10.0.0.0/8'],
   *     user_clearance: 2,
   *     resource_sensitivity: 1,
   *   },
   * });
   * ```
   */
  async check(request: FgaCheckRequest): Promise<FgaCheckResponse> {
    const client = await this.getClient();

    const checkRequest: {
      user: string;
      relation: string;
      object: string;
      context?: Record<string, unknown>;
    } = {
      user: userString(request.userId),
      relation: request.relation,
      object: objectString(request.resourceType, request.resourceId),
    };

    // Add ABAC context if provided
    if (request.context && Object.keys(request.context).length > 0) {
      checkRequest.context = request.context as Record<string, unknown>;
    }

    const result = await this.withRetry(() => client.check(checkRequest));

    return { allowed: result.allowed ?? false };
  }

  /**
   * Batch check multiple permissions in one request.
   * Requires OpenFGA v1.8.0+
   *
   * Note: Each request can have its own ABAC context.
   */
  async batchCheck(
    requests: FgaCheckRequest[],
  ): Promise<Array<{ request: FgaCheckRequest; allowed: boolean }>> {
    const client = await this.getClient();

    const checks = requests.map((req, index) => {
      const check: {
        user: string;
        relation: string;
        object: string;
        correlationId: string;
        context?: Record<string, unknown>;
      } = {
        user: userString(req.userId),
        relation: req.relation,
        object: objectString(req.resourceType, req.resourceId),
        correlationId: String(index),
      };

      // Add ABAC context if provided
      if (req.context && Object.keys(req.context).length > 0) {
        check.context = req.context as Record<string, unknown>;
      }

      return check;
    });

    const { result } = await this.withRetry(() => client.batchCheck({ checks }));

    return (result ?? []).flatMap((r) => {
      const req = requests[parseInt(r.correlationId!, 10)];
      if (req === undefined) return [];
      return [{ request: req, allowed: r.allowed ?? false }];
    });
  }

  // ---------------------------------------------------------------------------
  // List Operations
  // ---------------------------------------------------------------------------

  /**
   * Lists objects of a type that a user has access to.
   *
   * @example Standard list
   * ```typescript
   * const projects = await client.listObjects({
   *   userId: '123',
   *   relation: 'viewer',
   *   resourceType: 'project',
   * });
   * // → ['project:demo', 'project:test']
   * ```
   *
   * @example List with ABAC context (only returns objects user can access now)
   * ```typescript
   * const projects = await client.listObjects({
   *   userId: '123',
   *   relation: 'can_view',
   *   resourceType: 'sensitive_project',
   *   context: {
   *     current_time: new Date().toISOString(),
   *     user_ip: '10.0.1.50',
   *     allowed_cidrs: ['10.0.0.0/8'],
   *   },
   * });
   * ```
   */
  async listObjects(request: FgaListObjectsRequest): Promise<string[]> {
    const client = await this.getClient();

    const listRequest: {
      user: string;
      relation: string;
      type: string;
      context?: Record<string, unknown>;
    } = {
      user: userString(request.userId),
      relation: request.relation,
      type: request.resourceType,
    };

    // Add ABAC context if provided
    if (request.context && Object.keys(request.context).length > 0) {
      listRequest.context = request.context as Record<string, unknown>;
    }

    const result = await this.withRetry(() => client.listObjects(listRequest));

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

    return (result.users ?? [])
      .map((u) => {
        if ('object' in u && u.object) {
          return `${u.object.type}:${u.object.id}`;
        }
        return '';
      })
      .filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Expand Operations (for explain/audit)
  // ---------------------------------------------------------------------------

  /**
   * Expands a relation to show the authorization tree.
   * Used for explaining why a user has (or doesn't have) access.
   *
   * @example
   * ```typescript
   * const tree = await client.expand({
   *   relation: 'can_view',
   *   resourceType: 'project',
   *   resourceId: 'demo',
   * });
   * // Returns tree showing all paths that grant can_view
   * ```
   */
  async expand(request: FgaExpandRequest): Promise<FgaExpandNode> {
    const client = await this.getClient();

    const result = await this.withRetry(() =>
      client.expand({
        relation: request.relation,
        object: objectString(request.resourceType, request.resourceId),
      }),
    );

    return this.convertExpandTree(result.tree);
  }

  /**
   * Converts OpenFGA expand response to our typed structure.
   */
  private convertExpandTree(tree: unknown): FgaExpandNode {
    if (!tree || typeof tree !== 'object') {
      return { type: 'leaf', users: [] };
    }

    const t = tree as Record<string, unknown>;

    // Leaf node with direct users
    if (t.leaf && typeof t.leaf === 'object') {
      const leaf = t.leaf as Record<string, unknown>;
      const users: string[] = [];

      if (leaf.users && typeof leaf.users === 'object') {
        const usersObj = leaf.users as {
          users?: Array<{ object?: { type?: string; id?: string } }>;
        };
        if (usersObj.users) {
          for (const u of usersObj.users) {
            if (u.object?.type && u.object?.id) {
              users.push(`${u.object.type}:${u.object.id}`);
            }
          }
        }
      }

      return { type: 'leaf', users };
    }

    // Union node (OR)
    if (t.union && typeof t.union === 'object') {
      const union = t.union as { nodes?: unknown[] };
      return {
        type: 'union',
        children: (union.nodes ?? []).map((n) => this.convertExpandTree(n)),
      };
    }

    // Intersection node (AND)
    if (t.intersection && typeof t.intersection === 'object') {
      const intersection = t.intersection as { nodes?: unknown[] };
      return {
        type: 'intersection',
        children: (intersection.nodes ?? []).map((n) => this.convertExpandTree(n)),
      };
    }

    // Exclusion node (NOT)
    if (t.difference && typeof t.difference === 'object') {
      const diff = t.difference as { base?: unknown; subtract?: unknown };
      return {
        type: 'exclusion',
        children: [this.convertExpandTree(diff.base), this.convertExpandTree(diff.subtract)],
      };
    }

    // Computed relation
    if (t.computed && typeof t.computed === 'object') {
      const computed = t.computed as { userset?: string };
      return {
        type: 'leaf',
        ...(computed.userset !== undefined && { computed: computed.userset }),
      };
    }

    return { type: 'leaf', users: [] };
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
        ...(options.writes !== undefined && { writes: options.writes }),
        ...(options.deletes !== undefined && { deletes: options.deletes }),
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
  async addUserToTenant(
    userId: string,
    tenantId: string,
    role: 'member' | 'admin' = 'member',
  ): Promise<void> {
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
