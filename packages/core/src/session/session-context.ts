import { randomUUID } from 'crypto';
import type {
  Operator,
  RequestMeta,
  GraphRAGSettings,
  MutationMarks,
  ClientPlatform,
  IDestroyable,
} from './types';
import { UserType } from './types';

/**
 * Configuration for creating a new session context
 */
export interface SessionContextConfig {
  tenantId: string;
  operator: Operator;
  clientPlatform: ClientPlatform;
  clientVersion?: string;

  // Optional overrides
  requestId?: string;
  traceId?: string;
  timeout?: number;

  // GraphRAG settings
  graphRagSettings?: Partial<GraphRAGSettings>;

  // Tenant config (loaded externally)
  tenantConfig?: unknown;
}

/**
 * Serialized form of SessionContext for passing through Moleculer meta
 */
export interface SerializedSessionContext {
  version: 1;
  tenantId: string;
  operator: Operator;
  requestMeta: RequestMeta;
  graphRagSettings: GraphRAGSettings;
  tenantConfigHash?: string;

  // State
  entities: string[]; // Entity IDs touched in this session
  queries: string[]; // Questions asked
  actions: string[]; // Actions performed
}

/**
 * Default GraphRAG settings
 */
const DEFAULT_GRAPHRAG_SETTINGS: GraphRAGSettings = {
  mode: 'auto',
  maxHops: 2,
  topK: 20,
  useSchemaHints: true,
  ontologyMode: false,
  communityLevel: 0,
  includeCommunities: true,
  includeEntities: true,
  includeRelationships: true,
  includeSources: true,
  maxTokens: 4096,
  streaming: false,
  streamChunkSize: 100,
};

/**
 * GraphRAG Session Context
 *
 * Single context for the entire GraphRAG call chain.
 * Contains:
 * - Tenant and Operator information
 * - Request metadata (traceId, requestId)
 * - GraphRAG settings
 * - Audit trail (touched entities, performed queries)
 *
 * @example
 * ```typescript
 * const session = new GraphRAGSessionContext({
 *   tenantId: 'demo',
 *   operator: { id: 'user-123', type: UserType.USER },
 *   clientPlatform: 'web',
 * });
 *
 * // Use in service
 * const result = await graphRAG.query(question, session);
 *
 * // Get audit data
 * const audit = session.getAuditData();
 *
 * // Cleanup
 * session.$destroy();
 * ```
 */
export class GraphRAGSessionContext implements IDestroyable {
  private readonly _tenantId: string;
  private readonly _operator: Operator;
  private readonly _requestMeta: RequestMeta;
  private readonly _graphRagSettings: GraphRAGSettings;
  private _tenantConfig: unknown;

  // Mutable state
  private _touchedEntities: Set<string> = new Set();
  private _performedQueries: string[] = [];
  private _performedActions: string[] = [];
  private _destroyed = false;

  // AbortController for cancellation
  private readonly _abortController: AbortController;
  private _timeoutId?: ReturnType<typeof setTimeout>;

  constructor(config: SessionContextConfig) {
    this._tenantId = config.tenantId;
    this._operator = config.operator;
    this._tenantConfig = config.tenantConfig;

    this._requestMeta = {
      requestId: config.requestId || randomUUID(),
      traceId: config.traceId,
      clientPlatform: config.clientPlatform,
      clientVersion: config.clientVersion,
      startedAt: new Date(),
      timeout: config.timeout || 60000,
    };

    this._graphRagSettings = {
      ...DEFAULT_GRAPHRAG_SETTINGS,
      ...config.graphRagSettings,
    };

    this._abortController = new AbortController();

    // Set timeout
    if (this._requestMeta.timeout > 0) {
      this._timeoutId = setTimeout(() => {
        if (!this._destroyed) {
          this._abortController.abort(new Error('Session timeout'));
        }
      }, this._requestMeta.timeout);
    }
  }

  // ========== Getters ==========

  get tenantId(): string {
    return this._tenantId;
  }

  get operator(): Readonly<Operator> {
    return this._operator;
  }

  /** Alias for operator.id (Orchestra compatibility) */
  get operatorUuid(): string {
    return this._operator.id;
  }

  /** Alias for operator.type (Orchestra compatibility) */
  get operatorType(): UserType {
    return this._operator.type;
  }

  get requestId(): string {
    return this._requestMeta.requestId;
  }

  get traceId(): string | undefined {
    return this._requestMeta.traceId;
  }

  get clientPlatform(): string {
    return this._requestMeta.clientPlatform;
  }

  get clientVersion(): string | undefined {
    return this._requestMeta.clientVersion;
  }

  get graphRagSettings(): Readonly<GraphRAGSettings> {
    return this._graphRagSettings;
  }

  get tenantConfig(): unknown {
    return this._tenantConfig;
  }

  get signal(): AbortSignal {
    return this._abortController.signal;
  }

  get isAborted(): boolean {
    return this._abortController.signal.aborted;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  // ========== Mutation Marks ==========

  /**
   * Create mutation marks for new entities
   */
  createMutationMarks(): MutationMarks {
    const now = new Date();
    return {
      createdAt: now,
      creatorId: this._operator.id,
      creatorPlatform: this._requestMeta.clientPlatform,
      updatedAt: now,
      updatedById: this._operator.id,
      updatedByPlatform: this._requestMeta.clientPlatform,
    };
  }

  /**
   * Create update marks for existing entities
   */
  createUpdateMarks(): Pick<MutationMarks, 'updatedAt' | 'updatedById' | 'updatedByPlatform'> {
    return {
      updatedAt: new Date(),
      updatedById: this._operator.id,
      updatedByPlatform: this._requestMeta.clientPlatform,
    };
  }

  // ========== State Tracking ==========

  /**
   * Track entity access
   */
  touchEntity(entityId: string): void {
    this._touchedEntities.add(entityId);
  }

  /**
   * Track entities batch
   */
  touchEntities(entityIds: string[]): void {
    for (const id of entityIds) {
      this._touchedEntities.add(id);
    }
  }

  /**
   * Track performed query
   */
  trackQuery(question: string): void {
    this._performedQueries.push(question);
  }

  /**
   * Track performed action
   */
  trackAction(action: string): void {
    this._performedActions.push(action);
  }

  // ========== Settings Update ==========

  /**
   * Update GraphRAG settings for this session
   */
  updateSettings(settings: Partial<GraphRAGSettings>): void {
    Object.assign(this._graphRagSettings, settings);
  }

  /**
   * Set tenant config (loaded from TenantConfigService)
   */
  setTenantConfig(config: unknown): void {
    this._tenantConfig = config;
  }

  // ========== Operator Switch (Orchestra compatibility) ==========

  /**
   * Switch the operator to a new one
   */
  $switchOperator(operator: { _uid: string; type: UserType }): void {
    (this._operator as Operator).id = operator._uid;
    (this._operator as Operator).type = operator.type;
  }

  // ========== Abort ==========

  /**
   * Abort the session
   */
  abort(reason?: string): void {
    this._abortController.abort(new Error(reason || 'Session aborted'));
  }

  /**
   * Throw if session is aborted
   */
  throwIfAborted(): void {
    if (this.isAborted) {
      throw this._abortController.signal.reason || new Error('Session aborted');
    }
  }

  // ========== Serialization ==========

  /**
   * Serialize session for passing through Moleculer meta
   */
  serialize(): SerializedSessionContext {
    return {
      version: 1,
      tenantId: this._tenantId,
      operator: this._operator,
      requestMeta: this._requestMeta,
      graphRagSettings: this._graphRagSettings,
      entities: Array.from(this._touchedEntities),
      queries: this._performedQueries,
      actions: this._performedActions,
    };
  }

  /**
   * Serialize to JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.serialize());
  }

  /**
   * Deserialize from serialized form
   */
  static deserialize(data: SerializedSessionContext): GraphRAGSessionContext {
    const session = new GraphRAGSessionContext({
      tenantId: data.tenantId,
      operator: data.operator,
      clientPlatform: data.requestMeta.clientPlatform as ClientPlatform,
      clientVersion: data.requestMeta.clientVersion,
      requestId: data.requestMeta.requestId,
      traceId: data.requestMeta.traceId,
      timeout: data.requestMeta.timeout,
      graphRagSettings: data.graphRagSettings,
    });

    // Restore state
    for (const entityId of data.entities) {
      session.touchEntity(entityId);
    }
    for (const query of data.queries) {
      session.trackQuery(query);
    }
    for (const action of data.actions) {
      session.trackAction(action);
    }

    return session;
  }

  /**
   * Deserialize from JSON string
   */
  static fromJSON(json: string): GraphRAGSessionContext {
    return GraphRAGSessionContext.deserialize(JSON.parse(json));
  }

  // ========== Audit ==========

  /**
   * Get audit data for logging/analytics
   */
  getAuditData(): {
    tenantId: string;
    operatorId: string;
    operatorType: string;
    requestId: string;
    traceId?: string;
    clientPlatform: string;
    startedAt: Date;
    duration: number;
    touchedEntities: number;
    performedQueries: number;
    performedActions: string[];
  } {
    return {
      tenantId: this._tenantId,
      operatorId: this._operator.id,
      operatorType: this._operator.type,
      requestId: this._requestMeta.requestId,
      traceId: this._requestMeta.traceId,
      clientPlatform: this._requestMeta.clientPlatform,
      startedAt: this._requestMeta.startedAt,
      duration: Date.now() - this._requestMeta.startedAt.getTime(),
      touchedEntities: this._touchedEntities.size,
      performedQueries: this._performedQueries.length,
      performedActions: this._performedActions,
    };
  }

  // ========== Cleanup ==========

  /**
   * Cleanup resources (from orchestra IDestroyable)
   */
  $destroy(): void {
    if (this._destroyed) return;

    this._destroyed = true;
    this._touchedEntities.clear();
    this._performedQueries = [];
    this._performedActions = [];
    this._tenantConfig = undefined;

    // Clear timeout
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
    }

    // Abort any pending operations
    if (!this._abortController.signal.aborted) {
      this._abortController.abort(new Error('Session destroyed'));
    }
  }
}

// ========== Factory Functions (Orchestra compatibility) ==========

/**
 * Create a new session context
 */
export function createSession(
  operatorUuid: string,
  operatorType: UserType,
  clientPlatform: ClientPlatform,
  clientVersion: string,
  tenantId = 'default',
): GraphRAGSessionContext {
  return new GraphRAGSessionContext({
    tenantId,
    operator: { id: operatorUuid, type: operatorType, roles: [] },
    clientPlatform,
    clientVersion,
  });
}

/**
 * Default session factory (compatible with Orchestra's defaultSession)
 */
export function defaultSession(
  operatorUuid: string,
  operatorType: UserType,
  clientPlatform: ClientPlatform,
  clientVersion: string,
  tenantId = 'default',
): GraphRAGSessionContext {
  return createSession(operatorUuid, operatorType, clientPlatform, clientVersion, tenantId);
}

/**
 * Session factory type
 */
export type SessionFactory = (
  operatorUuid: string,
  operatorType: UserType,
) => GraphRAGSessionContext;

/**
 * Create a default session factory
 */
export function createSessionFactory(
  clientPlatform: ClientPlatform,
  clientVersion: string,
  defaultTenantId = 'default',
): SessionFactory {
  return (operatorUuid: string, operatorType: UserType) =>
    createSession(operatorUuid, operatorType, clientPlatform, clientVersion, defaultTenantId);
}

/**
 * Create a system session for internal operations
 */
export function createSystemSession(
  tenantId = 'default',
  clientPlatform: ClientPlatform = 'api',
  clientVersion = 'v1',
): GraphRAGSessionContext {
  return createSession('system', UserType.SYSTEM, clientPlatform, clientVersion, tenantId);
}

/**
 * Type alias for Orchestra compatibility
 */
export type OrchestraSession = GraphRAGSessionContext;
export type GertsSession = GraphRAGSessionContext;
