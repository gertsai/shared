import { randomUUID } from 'crypto';
import type {
  Operator,
  RequestMeta,
  GraphRAGSettings,
  MutationMarks,
  ClientPlatform,
  IDestroyable,
} from './types';
import { UserType, isOperator } from './types';

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
  // EVID-059 H-4: NOT `readonly` — `updateSettings` reassigns this field to
  // a fresh frozen object so previously captured snapshots stay immutable.
  private _graphRagSettings: GraphRAGSettings;
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
      clientPlatform: config.clientPlatform,
      startedAt: new Date(),
      timeout: config.timeout || 60000,
      ...(config.traceId !== undefined && { traceId: config.traceId }),
      ...(config.clientVersion !== undefined && { clientVersion: config.clientVersion }),
    };

    // EVID-059 H-4: freeze the initial settings object so the getter contract
    // `Readonly<GraphRAGSettings>` is enforced at runtime, not just at the
    // type level. `updateSettings` reassigns this field to a fresh frozen
    // object rather than mutating in place.
    this._graphRagSettings = Object.freeze({
      ...DEFAULT_GRAPHRAG_SETTINGS,
      ...config.graphRagSettings,
    });

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
   * Update GraphRAG settings for this session.
   *
   * Closes EVID-059 H-4: the previous implementation used `Object.assign`,
   * which mutated `_graphRagSettings` in place. Callers that had captured a
   * "read-only" reference (`session.graphRagSettings`) would see the
   * snapshot silently change. We now produce a brand-new frozen object so
   * previous references remain immutable.
   */
  updateSettings(settings: Partial<GraphRAGSettings>): void {
    this._graphRagSettings = Object.freeze({
      ...this._graphRagSettings,
      ...settings,
    });
  }

  /**
   * Set tenant config (loaded from TenantConfigService)
   */
  setTenantConfig(config: unknown): void {
    this._tenantConfig = config;
  }

  // ========== Operator Switch (REMOVED — see EVID-059 H-5) ==========
  //
  // The previous `$switchOperator` method allowed callers to mutate
  // `operator.id` + `operator.type` with no tenant check, no audit event,
  // and no authorisation gate — an unauthenticated privilege swap on a
  // publicly exported class. The `$` prefix suggested "internal" but the
  // method was on the public class surface.
  //
  // Per EVID-059 H-5 the method has been removed (Option A: 0 external
  // consumers found via `git grep '\$switchOperator' packages/ examples/`
  // outside session-context.ts itself). Consumers that need genuine
  // operator-switching semantics should use `@gertsai/session` —
  // `Session.$switchOperator` there enforces destroyed-state checks and
  // emits an `operator-switched` event.

  // ========== Abort ==========

  /**
   * Abort the session
   */
  abort(reason?: string): void {
    this._abortController.abort(new Error(reason || 'Session aborted'));
  }

  /**
   * Throw if session is aborted
   *
   * FR-D-6: `AbortSignal.reason` is `unknown` per the WHATWG spec — callers
   * can pass any value to `abort(reason)`. The previous `throw signal.reason
   * || new Error(...)` would propagate non-Error values (strings, plain
   * objects, even `false`/`0` after fallback). We normalise to an Error
   * instance so downstream `catch (e: unknown)` / `e instanceof Error`
   * narrowing works uniformly. The fallback handles `signal.reason === undefined`
   * (which can happen on legacy abort paths that did not set a reason).
   */
  throwIfAborted(): void {
    if (this.isAborted) {
      const reason: unknown = this._abortController.signal.reason;
      if (reason instanceof Error) {
        throw reason;
      }
      if (reason === undefined || reason === null) {
        throw new Error('Session aborted');
      }
      throw new Error(typeof reason === 'string' ? reason : String(reason));
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
      requestId: data.requestMeta.requestId,
      timeout: data.requestMeta.timeout,
      graphRagSettings: data.graphRagSettings,
      ...(data.requestMeta.clientVersion !== undefined && {
        clientVersion: data.requestMeta.clientVersion,
      }),
      ...(data.requestMeta.traceId !== undefined && { traceId: data.requestMeta.traceId }),
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
   * Deserialize from JSON string.
   *
   * FR-D-7: validate the parsed payload with `isSerializedSessionContext`
   * (a schema-shaped guard) before handing off to `deserialize`. Previously
   * `JSON.parse` could produce any shape (`null`, missing fields, wrong
   * types) and the call would crash inside the constructor with an opaque
   * `TypeError` — making this a denial-of-service surface for any caller
   * that round-trips session payloads from an untrusted boundary
   * (Moleculer meta, WebSocket frames, queue messages).
   *
   * Now: `SyntaxError` from `JSON.parse` propagates as-is; structural
   * mismatches throw a typed `TypeError` with a clear message before any
   * downstream side effect.
   */
  static fromJSON(json: string): GraphRAGSessionContext {
    const parsed: unknown = JSON.parse(json);
    if (!isSerializedSessionContext(parsed)) {
      throw new TypeError(
        'GraphRAGSessionContext.fromJSON: payload does not match SerializedSessionContext shape',
      );
    }
    return GraphRAGSessionContext.deserialize(parsed);
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
      clientPlatform: this._requestMeta.clientPlatform,
      startedAt: this._requestMeta.startedAt,
      duration: Date.now() - this._requestMeta.startedAt.getTime(),
      touchedEntities: this._touchedEntities.size,
      performedQueries: this._performedQueries.length,
      performedActions: this._performedActions,
      ...(this._requestMeta.traceId !== undefined && { traceId: this._requestMeta.traceId }),
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

/**
 * Validate a `SerializedSessionContext` payload (FR-D-7).
 *
 * Used by {@link GraphRAGSessionContext.fromJSON} to gate untrusted JSON
 * round-trips before the constructor runs. Defends against malformed payloads
 * coming from `ctx.meta`, WebSocket frames, or queue messages.
 *
 * Shape match (loose, JSON-friendly):
 *   - `version === 1`
 *   - `tenantId: string`
 *   - `operator` passes `isOperator`
 *   - `requestMeta.requestId: string`, `requestMeta.clientPlatform: string`,
 *     `requestMeta.timeout: number` (post-JSON-parse `startedAt` is a string,
 *     not a `Date` — `deserialize` never reads it, so we don't validate it).
 *   - `graphRagSettings: object`
 *   - `entities/queries/actions: string[]`
 *
 * Intentionally NOT calling `isRequestMeta` here: that guard requires
 * `startedAt instanceof Date`, which is impossible on a JSON-parsed payload
 * (JSON has no Date type — it becomes an ISO string). `deserialize` discards
 * `startedAt` anyway, so the relaxed shape check is the right contract.
 */
export function isSerializedSessionContext(value: unknown): value is SerializedSessionContext {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (v.version !== 1) return false;
  if (typeof v.tenantId !== 'string') return false;
  if (!isOperator(v.operator)) return false;

  // requestMeta — JSON-parsed shape (startedAt is a string after round-trip).
  if (typeof v.requestMeta !== 'object' || v.requestMeta === null) return false;
  const rm = v.requestMeta as Record<string, unknown>;
  if (typeof rm.requestId !== 'string') return false;
  if (typeof rm.clientPlatform !== 'string') return false;
  if (typeof rm.timeout !== 'number' || !Number.isFinite(rm.timeout)) return false;
  if (rm.traceId !== undefined && typeof rm.traceId !== 'string') return false;
  if (rm.clientVersion !== undefined && typeof rm.clientVersion !== 'string') return false;

  // graphRagSettings — structural check only (constructor reshapes via spread).
  if (typeof v.graphRagSettings !== 'object' || v.graphRagSettings === null) return false;

  // tenantConfigHash is optional
  if (v.tenantConfigHash !== undefined && typeof v.tenantConfigHash !== 'string') return false;

  // entities / queries / actions: string arrays
  if (!Array.isArray(v.entities) || !v.entities.every((e) => typeof e === 'string')) return false;
  if (!Array.isArray(v.queries) || !v.queries.every((q) => typeof q === 'string')) return false;
  if (!Array.isArray(v.actions) || !v.actions.every((a) => typeof a === 'string')) return false;

  return true;
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
