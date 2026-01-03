"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphRAGSessionContext = void 0;
exports.createSession = createSession;
exports.defaultSession = defaultSession;
exports.createSessionFactory = createSessionFactory;
exports.createSystemSession = createSystemSession;
const crypto_1 = require("crypto");
const types_1 = require("./types");
/**
 * Default GraphRAG settings
 */
const DEFAULT_GRAPHRAG_SETTINGS = {
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
class GraphRAGSessionContext {
    _tenantId;
    _operator;
    _requestMeta;
    _graphRagSettings;
    _tenantConfig;
    // Mutable state
    _touchedEntities = new Set();
    _performedQueries = [];
    _performedActions = [];
    _destroyed = false;
    // AbortController for cancellation
    _abortController;
    _timeoutId;
    constructor(config) {
        this._tenantId = config.tenantId;
        this._operator = config.operator;
        this._tenantConfig = config.tenantConfig;
        this._requestMeta = {
            requestId: config.requestId || (0, crypto_1.randomUUID)(),
            traceId: config.traceId,
            clientPlatform: config.clientPlatform,
            clientVersion: config.clientVersion,
            startedAt: new Date(),
            timeout: config.timeout || 30000,
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
    get tenantId() {
        return this._tenantId;
    }
    get operator() {
        return this._operator;
    }
    /** Alias for operator.id (Orchestra compatibility) */
    get operatorUuid() {
        return this._operator.id;
    }
    /** Alias for operator.type (Orchestra compatibility) */
    get operatorType() {
        return this._operator.type;
    }
    get requestId() {
        return this._requestMeta.requestId;
    }
    get traceId() {
        return this._requestMeta.traceId;
    }
    get clientPlatform() {
        return this._requestMeta.clientPlatform;
    }
    get clientVersion() {
        return this._requestMeta.clientVersion;
    }
    get graphRagSettings() {
        return this._graphRagSettings;
    }
    get tenantConfig() {
        return this._tenantConfig;
    }
    get signal() {
        return this._abortController.signal;
    }
    get isAborted() {
        return this._abortController.signal.aborted;
    }
    get isDestroyed() {
        return this._destroyed;
    }
    // ========== Mutation Marks ==========
    /**
     * Create mutation marks for new entities
     */
    createMutationMarks() {
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
    createUpdateMarks() {
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
    touchEntity(entityId) {
        this._touchedEntities.add(entityId);
    }
    /**
     * Track entities batch
     */
    touchEntities(entityIds) {
        for (const id of entityIds) {
            this._touchedEntities.add(id);
        }
    }
    /**
     * Track performed query
     */
    trackQuery(question) {
        this._performedQueries.push(question);
    }
    /**
     * Track performed action
     */
    trackAction(action) {
        this._performedActions.push(action);
    }
    // ========== Settings Update ==========
    /**
     * Update GraphRAG settings for this session
     */
    updateSettings(settings) {
        Object.assign(this._graphRagSettings, settings);
    }
    /**
     * Set tenant config (loaded from TenantConfigService)
     */
    setTenantConfig(config) {
        this._tenantConfig = config;
    }
    // ========== Operator Switch (Orchestra compatibility) ==========
    /**
     * Switch the operator to a new one
     */
    $switchOperator(operator) {
        this._operator.id = operator._uid;
        this._operator.type = operator.type;
    }
    // ========== Abort ==========
    /**
     * Abort the session
     */
    abort(reason) {
        this._abortController.abort(new Error(reason || 'Session aborted'));
    }
    /**
     * Throw if session is aborted
     */
    throwIfAborted() {
        if (this.isAborted) {
            throw this._abortController.signal.reason || new Error('Session aborted');
        }
    }
    // ========== Serialization ==========
    /**
     * Serialize session for passing through Moleculer meta
     */
    serialize() {
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
    toJSON() {
        return JSON.stringify(this.serialize());
    }
    /**
     * Deserialize from serialized form
     */
    static deserialize(data) {
        const session = new GraphRAGSessionContext({
            tenantId: data.tenantId,
            operator: data.operator,
            clientPlatform: data.requestMeta.clientPlatform,
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
    static fromJSON(json) {
        return GraphRAGSessionContext.deserialize(JSON.parse(json));
    }
    // ========== Audit ==========
    /**
     * Get audit data for logging/analytics
     */
    getAuditData() {
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
    $destroy() {
        if (this._destroyed)
            return;
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
exports.GraphRAGSessionContext = GraphRAGSessionContext;
// ========== Factory Functions (Orchestra compatibility) ==========
/**
 * Create a new session context
 */
function createSession(operatorUuid, operatorType, clientPlatform, clientVersion, tenantId = 'default') {
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
function defaultSession(operatorUuid, operatorType, clientPlatform, clientVersion, tenantId = 'default') {
    return createSession(operatorUuid, operatorType, clientPlatform, clientVersion, tenantId);
}
/**
 * Create a default session factory
 */
function createSessionFactory(clientPlatform, clientVersion, defaultTenantId = 'default') {
    return (operatorUuid, operatorType) => createSession(operatorUuid, operatorType, clientPlatform, clientVersion, defaultTenantId);
}
/**
 * Create a system session for internal operations
 */
function createSystemSession(tenantId = 'default', clientPlatform = 'api', clientVersion = 'v1') {
    return createSession('system', types_1.UserType.SYSTEM, clientPlatform, clientVersion, tenantId);
}
//# sourceMappingURL=session-context.js.map