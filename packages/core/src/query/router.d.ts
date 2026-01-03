/**
 * @gerts/core - Query Router
 *
 * Routes queries to appropriate executors based on type or custom logic.
 * Inspired by LlamaIndex RouterQueryEngine and TrustGraph OntoRAG.
 *
 * @see RFC-032: Universal Query System
 */
import type { QueryRequest, QueryResult } from './types.js';
import type { IQueryExecutor, ExecutorMetadata, QueryToolOptions } from './executor.js';
/**
 * Selection result from query selector
 */
export interface QuerySelection {
    /** Name of selected executor */
    readonly executorName: string;
    /** Selection confidence (0-1) */
    readonly confidence: number;
    /** Reason for selection */
    readonly reason?: string;
}
/**
 * Query selector interface - decides which executor to use.
 *
 * Implementations can use:
 * - Type-based routing (default)
 * - LLM-based routing (future)
 * - Custom logic
 */
export interface IQuerySelector {
    /** Selector name for logging */
    readonly name: string;
    /**
     * Select best executor for a query
     *
     * @param query - Query to route
     * @param executors - Available executors
     * @returns Selection result
     */
    select(query: QueryRequest, executors: readonly ExecutorMetadata[]): Promise<QuerySelection>;
}
/**
 * Simple selector that routes by query type.
 *
 * @example
 * ```typescript
 * const selector = new TypeBasedSelector();
 * const selection = await selector.select(query, executorMetadata);
 * // selection.executorName = 'nl-query' if query.type === 'nl'
 * ```
 */
export declare class TypeBasedSelector implements IQuerySelector {
    readonly name = "type-based";
    select(query: QueryRequest, executors: readonly ExecutorMetadata[]): Promise<QuerySelection>;
}
/**
 * Selector that uses explicit priority for routing
 */
export declare class PriorityBasedSelector implements IQuerySelector {
    private readonly priorities;
    readonly name = "priority-based";
    constructor(priorities?: Map<string, number>);
    /**
     * Set priority for an executor
     */
    setPriority(executorName: string, priority: number): this;
    select(query: QueryRequest, executors: readonly ExecutorMetadata[]): Promise<QuerySelection>;
}
/**
 * Query Router - routes queries to appropriate executors.
 *
 * Inspired by LlamaIndex RouterQueryEngine and TrustGraph OntoRAG.
 *
 * @example
 * ```typescript
 * const router = new QueryRouter()
 *   .register(nlExecutor)
 *   .register(graphExecutor)
 *   .register(vectorExecutor);
 *
 * // Execute with automatic routing
 * const result = await router.execute({
 *   type: 'nl',
 *   question: 'Who works at NeuraTech?',
 *   tenantId: 'demo' as TenantId,
 * });
 *
 * // Or use as a unified tool
 * const queryTool = router.asTool({
 *   name: 'unified_query',
 *   description: 'Query knowledge base',
 * });
 * ```
 */
export declare class QueryRouter implements IQueryExecutor<QueryRequest, unknown> {
    private executors;
    private selector;
    /**
     * Dynamic metadata based on registered executors
     */
    get metadata(): ExecutorMetadata;
    constructor(selector?: IQuerySelector);
    /**
     * Register an executor
     *
     * @param executor - Executor to register
     * @returns this for chaining
     */
    register<TQuery extends QueryRequest, TData, TMeta>(executor: IQueryExecutor<TQuery, TData, TMeta>): this;
    /**
     * Unregister an executor
     *
     * @param name - Executor name
     * @returns true if executor was removed
     */
    unregister(name: string): boolean;
    /**
     * Get registered executor by name
     */
    getExecutor(name: string): IQueryExecutor<any, any> | undefined;
    /**
     * List all registered executors
     */
    listExecutors(): readonly ExecutorMetadata[];
    /**
     * Get all supported query types
     */
    getSupportedTypes(): string[];
    /**
     * Check if a query type is supported
     */
    supportsType(type: string): boolean;
    /**
     * Set the query selector
     */
    setSelector(selector: IQuerySelector): this;
    /**
     * Execute a query with automatic routing
     */
    execute(query: QueryRequest): Promise<QueryResult<unknown>>;
    /**
     * Stream query results with automatic routing
     */
    stream(query: QueryRequest): AsyncIterable<QueryResult<unknown>>;
    /**
     * Convert router to unified tool
     */
    asTool(options?: QueryToolOptions): unknown;
}
/**
 * Create a query router with executors
 *
 * @example
 * ```typescript
 * const router = createQueryRouter([
 *   nlExecutor,
 *   graphExecutor,
 *   vectorExecutor,
 * ]);
 * ```
 */
export declare function createQueryRouter(executors: IQueryExecutor<any, any>[], selector?: IQuerySelector): QueryRouter;
/**
 * Create a query router with priority selector
 *
 * @example
 * ```typescript
 * const router = createPriorityRouter([
 *   nlExecutor,
 *   graphExecutor,
 * ], {
 *   'nl-query': 10,
 *   'graph-query': 5,
 * });
 * ```
 */
export declare function createPriorityRouter(executors: IQueryExecutor<any, any>[], priorities: Record<string, number>): QueryRouter;
//# sourceMappingURL=router.d.ts.map