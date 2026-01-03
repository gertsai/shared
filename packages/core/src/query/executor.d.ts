/**
 * @gerts/core - Query Executor Interface
 *
 * Core IQueryExecutor interface (Port in Hexagonal Architecture).
 * Adapters implement this interface to provide query execution.
 *
 * @see RFC-032: Universal Query System
 */
import type { QueryRequest, QueryResult, SourceReference, QueryFailure } from './types.js';
/**
 * Executor latency estimates for routing decisions
 */
export type ExecutorLatency = 'fast' | 'medium' | 'slow';
/**
 * Executor metadata for routing and discovery.
 *
 * @example
 * ```typescript
 * const metadata: ExecutorMetadata = {
 *   name: 'nl-query',
 *   description: 'Natural language to Cypher query executor',
 *   supportedTypes: ['nl'],
 *   estimatedLatency: 'slow',
 *   capabilities: ['graph', 'llm'],
 * };
 * ```
 */
export interface ExecutorMetadata {
    /** Unique executor name */
    readonly name: string;
    /** Human-readable description */
    readonly description: string;
    /** Query types this executor supports */
    readonly supportedTypes: readonly string[];
    /** Estimated latency category */
    readonly estimatedLatency: ExecutorLatency;
    /** Required capabilities (for permission checking) */
    readonly capabilities?: readonly string[];
    /** Whether streaming is supported */
    readonly supportsStreaming?: boolean;
    /** Version for compatibility checking */
    readonly version?: string;
}
/**
 * Options for converting executor to tool
 */
export interface QueryToolOptions {
    /** Tool name override */
    readonly name?: string;
    /** Tool description override */
    readonly description?: string;
    /** Custom result formatter */
    readonly formatResult?: (data: unknown, sources: readonly SourceReference[]) => string;
}
/**
 * Core query executor interface (Port in Hexagonal Architecture).
 *
 * Adapters implement this interface to provide query execution.
 * The interface provides:
 * - `execute()` - Synchronous query execution
 * - `stream()` - Streaming query execution
 * - `asTool()` - Convert to agent tool
 *
 * @typeParam TQuery - Query request type (extends QueryRequest)
 * @typeParam TData - Result data type
 * @typeParam TMeta - Custom metadata type
 *
 * @example
 * ```typescript
 * class NLQueryExecutor implements IQueryExecutor<NLQuery, NLQueryData, NLQueryMeta> {
 *   readonly metadata: ExecutorMetadata = {
 *     name: 'nl-query',
 *     description: 'Natural language queries',
 *     supportedTypes: ['nl'],
 *     estimatedLatency: 'slow',
 *   };
 *
 *   async execute(query: NLQuery): Promise<QueryResult<NLQueryData, NLQueryMeta>> {
 *     // Implementation
 *   }
 *
 *   async *stream(query: NLQuery): AsyncIterable<QueryResult<NLQueryData, NLQueryMeta>> {
 *     yield await this.execute(query);
 *   }
 *
 *   asTool(options?: QueryToolOptions): Tool {
 *     // Tool wrapper implementation
 *   }
 * }
 * ```
 */
export interface IQueryExecutor<TQuery extends QueryRequest, TData, TMeta = unknown> {
    /**
     * Execute query and return full result.
     *
     * @param query - Query request
     * @returns Query result (success, error, or partial)
     */
    execute(query: TQuery): Promise<QueryResult<TData, TMeta>>;
    /**
     * Execute query with streaming results.
     *
     * Yields partial results during execution, then final result.
     * Default implementation delegates to execute().
     *
     * @param query - Query request
     * @yields Query results (partial during execution, final at end)
     */
    stream(query: TQuery): AsyncIterable<QueryResult<TData, TMeta>>;
    /**
     * Convert executor to agent tool.
     *
     * Returns a tool that wraps this executor for use with agents.
     * The tool automatically handles:
     * - Input validation via Zod schema
     * - Result formatting
     * - Error handling
     *
     * @param options - Tool options
     * @returns Agent tool
     */
    asTool(options?: QueryToolOptions): unknown;
    /**
     * Executor metadata for routing and discovery
     */
    readonly metadata: ExecutorMetadata;
}
/**
 * Abstract base class with common functionality.
 *
 * Provides default implementations for:
 * - `stream()` - Delegates to execute()
 * - `asTool()` - Basic tool wrapper
 *
 * Subclasses must implement:
 * - `metadata` - Executor metadata
 * - `execute()` - Query execution
 *
 * @example
 * ```typescript
 * class MyExecutor extends BaseQueryExecutor<MyQuery, MyData> {
 *   readonly metadata: ExecutorMetadata = {
 *     name: 'my-executor',
 *     description: 'My custom executor',
 *     supportedTypes: ['my-type'],
 *     estimatedLatency: 'fast',
 *   };
 *
 *   async execute(query: MyQuery): Promise<QueryResult<MyData>> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export declare abstract class BaseQueryExecutor<TQuery extends QueryRequest, TData, TMeta = unknown> implements IQueryExecutor<TQuery, TData, TMeta> {
    /**
     * Executor metadata - must be overridden
     */
    abstract readonly metadata: ExecutorMetadata;
    /**
     * Execute query - must be overridden
     */
    abstract execute(query: TQuery): Promise<QueryResult<TData, TMeta>>;
    /**
     * Default streaming implementation - delegates to execute()
     *
     * Override this method for true streaming support.
     */
    stream(query: TQuery): AsyncIterable<QueryResult<TData, TMeta>>;
    /**
     * Default tool wrapper implementation.
     *
     * Returns a basic tool structure. For full tool support,
     * use createQueryTool() from @gerts/tools.
     */
    asTool(options?: QueryToolOptions): unknown;
    /**
     * Helper: Wrap execution with error handling
     */
    protected safeExecute(fn: () => Promise<QueryResult<TData, TMeta>>): Promise<QueryResult<TData, TMeta>>;
    /**
     * Helper: Check if query type is supported
     */
    protected supportsType(type: string): boolean;
    /**
     * Helper: Validate query type
     */
    protected validateQueryType(query: TQuery): QueryFailure | null;
}
/**
 * Factory function for creating executors
 */
export type ExecutorFactory<TQuery extends QueryRequest, TData, TMeta = unknown, TConfig = unknown> = (config: TConfig) => IQueryExecutor<TQuery, TData, TMeta>;
/**
 * Executor registry entry
 */
export interface ExecutorRegistryEntry<TQuery extends QueryRequest = QueryRequest, TData = unknown, TMeta = unknown> {
    /** Executor instance */
    readonly executor: IQueryExecutor<TQuery, TData, TMeta>;
    /** Registration timestamp */
    readonly registeredAt: number;
    /** Priority for routing (higher = preferred) */
    readonly priority?: number;
}
/**
 * Create executor metadata
 */
export declare function createExecutorMetadata(name: string, options: Omit<ExecutorMetadata, 'name'>): ExecutorMetadata;
/**
 * Check if executor supports a query type
 */
export declare function executorSupportsType(executor: IQueryExecutor<any, any>, type: string): boolean;
/**
 * Get all supported types from multiple executors
 */
export declare function getAllSupportedTypes(executors: readonly IQueryExecutor<any, any>[]): string[];
/**
 * Find executor by name
 */
export declare function findExecutorByName<T extends IQueryExecutor<any, any>>(executors: readonly T[], name: string): T | undefined;
/**
 * Find executors supporting a type
 */
export declare function findExecutorsByType<T extends IQueryExecutor<any, any>>(executors: readonly T[], type: string): T[];
//# sourceMappingURL=executor.d.ts.map