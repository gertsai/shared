import type { Operator, RequestMeta, GraphRAGSettings, MutationMarks, ClientPlatform, IDestroyable } from './types';
import { UserType } from './types';
/**
 * Configuration for creating a new session context
 */
export interface SessionContextConfig {
    tenantId: string;
    operator: Operator;
    clientPlatform: ClientPlatform;
    clientVersion?: string;
    requestId?: string;
    traceId?: string;
    timeout?: number;
    graphRagSettings?: Partial<GraphRAGSettings>;
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
    entities: string[];
    queries: string[];
    actions: string[];
}
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
export declare class GraphRAGSessionContext implements IDestroyable {
    private readonly _tenantId;
    private readonly _operator;
    private readonly _requestMeta;
    private readonly _graphRagSettings;
    private _tenantConfig;
    private _touchedEntities;
    private _performedQueries;
    private _performedActions;
    private _destroyed;
    private readonly _abortController;
    private _timeoutId?;
    constructor(config: SessionContextConfig);
    get tenantId(): string;
    get operator(): Readonly<Operator>;
    /** Alias for operator.id (Orchestra compatibility) */
    get operatorUuid(): string;
    /** Alias for operator.type (Orchestra compatibility) */
    get operatorType(): UserType;
    get requestId(): string;
    get traceId(): string | undefined;
    get clientPlatform(): string;
    get clientVersion(): string | undefined;
    get graphRagSettings(): Readonly<GraphRAGSettings>;
    get tenantConfig(): unknown;
    get signal(): AbortSignal;
    get isAborted(): boolean;
    get isDestroyed(): boolean;
    /**
     * Create mutation marks for new entities
     */
    createMutationMarks(): MutationMarks;
    /**
     * Create update marks for existing entities
     */
    createUpdateMarks(): Pick<MutationMarks, 'updatedAt' | 'updatedById' | 'updatedByPlatform'>;
    /**
     * Track entity access
     */
    touchEntity(entityId: string): void;
    /**
     * Track entities batch
     */
    touchEntities(entityIds: string[]): void;
    /**
     * Track performed query
     */
    trackQuery(question: string): void;
    /**
     * Track performed action
     */
    trackAction(action: string): void;
    /**
     * Update GraphRAG settings for this session
     */
    updateSettings(settings: Partial<GraphRAGSettings>): void;
    /**
     * Set tenant config (loaded from TenantConfigService)
     */
    setTenantConfig(config: unknown): void;
    /**
     * Switch the operator to a new one
     */
    $switchOperator(operator: {
        _uid: string;
        type: UserType;
    }): void;
    /**
     * Abort the session
     */
    abort(reason?: string): void;
    /**
     * Throw if session is aborted
     */
    throwIfAborted(): void;
    /**
     * Serialize session for passing through Moleculer meta
     */
    serialize(): SerializedSessionContext;
    /**
     * Serialize to JSON string
     */
    toJSON(): string;
    /**
     * Deserialize from serialized form
     */
    static deserialize(data: SerializedSessionContext): GraphRAGSessionContext;
    /**
     * Deserialize from JSON string
     */
    static fromJSON(json: string): GraphRAGSessionContext;
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
    };
    /**
     * Cleanup resources (from orchestra IDestroyable)
     */
    $destroy(): void;
}
/**
 * Create a new session context
 */
export declare function createSession(operatorUuid: string, operatorType: UserType, clientPlatform: ClientPlatform, clientVersion: string, tenantId?: string): GraphRAGSessionContext;
/**
 * Default session factory (compatible with Orchestra's defaultSession)
 */
export declare function defaultSession(operatorUuid: string, operatorType: UserType, clientPlatform: ClientPlatform, clientVersion: string, tenantId?: string): GraphRAGSessionContext;
/**
 * Session factory type
 */
export type SessionFactory = (operatorUuid: string, operatorType: UserType) => GraphRAGSessionContext;
/**
 * Create a default session factory
 */
export declare function createSessionFactory(clientPlatform: ClientPlatform, clientVersion: string, defaultTenantId?: string): SessionFactory;
/**
 * Create a system session for internal operations
 */
export declare function createSystemSession(tenantId?: string, clientPlatform?: ClientPlatform, clientVersion?: string): GraphRAGSessionContext;
/**
 * Type alias for Orchestra compatibility
 */
export type OrchestraSession = GraphRAGSessionContext;
export type GertsSession = GraphRAGSessionContext;
