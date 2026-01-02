import { queryFailure, QueryError } from './types.js';
// ============================================================================
// Abstract Base Class
// ============================================================================
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
export class BaseQueryExecutor {
    /**
     * Default streaming implementation - delegates to execute()
     *
     * Override this method for true streaming support.
     */
    async *stream(query) {
        yield await this.execute(query);
    }
    /**
     * Default tool wrapper implementation.
     *
     * Returns a basic tool structure. For full tool support,
     * use createQueryTool() from @gerts/tools.
     */
    asTool(options) {
        const name = options?.name ?? `query_${this.metadata.supportedTypes[0]}`;
        const description = options?.description ?? this.metadata.description;
        return {
            name,
            description,
            executor: this,
            // Note: Full tool implementation is in @gerts/tools/query-tool.ts
        };
    }
    /**
     * Helper: Wrap execution with error handling
     */
    async safeExecute(fn) {
        try {
            return await fn();
        }
        catch (error) {
            if (error instanceof QueryError) {
                return error.toFailure();
            }
            return queryFailure('EXECUTION_FAILED', error instanceof Error ? error.message : String(error), { retryable: false });
        }
    }
    /**
     * Helper: Check if query type is supported
     */
    supportsType(type) {
        return this.metadata.supportedTypes.includes(type);
    }
    /**
     * Helper: Validate query type
     */
    validateQueryType(query) {
        if (!this.supportsType(query.type)) {
            return queryFailure('INVALID_QUERY', `Query type '${query.type}' not supported by ${this.metadata.name}. ` +
                `Supported: ${this.metadata.supportedTypes.join(', ')}`, { retryable: false });
        }
        return null;
    }
}
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Create executor metadata
 */
export function createExecutorMetadata(name, options) {
    return {
        name,
        ...options,
    };
}
/**
 * Check if executor supports a query type
 */
export function executorSupportsType(executor, type) {
    return executor.metadata.supportedTypes.includes(type);
}
/**
 * Get all supported types from multiple executors
 */
export function getAllSupportedTypes(executors) {
    const types = new Set();
    for (const executor of executors) {
        for (const type of executor.metadata.supportedTypes) {
            types.add(type);
        }
    }
    return Array.from(types);
}
/**
 * Find executor by name
 */
export function findExecutorByName(executors, name) {
    return executors.find((e) => e.metadata.name === name);
}
/**
 * Find executors supporting a type
 */
export function findExecutorsByType(executors, type) {
    return executors.filter((e) => e.metadata.supportedTypes.includes(type));
}
