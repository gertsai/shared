"use strict";
/**
 * @gerts/core - Query Router
 *
 * Routes queries to appropriate executors based on type or custom logic.
 * Inspired by LlamaIndex RouterQueryEngine and TrustGraph OntoRAG.
 *
 * @see RFC-032: Universal Query System
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryRouter = exports.PriorityBasedSelector = exports.TypeBasedSelector = void 0;
exports.createQueryRouter = createQueryRouter;
exports.createPriorityRouter = createPriorityRouter;
const types_js_1 = require("./types.js");
const executor_js_1 = require("./executor.js");
// ============================================================================
// Type-Based Selector
// ============================================================================
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
class TypeBasedSelector {
    name = 'type-based';
    async select(query, executors) {
        // Find executor that supports this query type
        const matching = executors.filter((e) => e.supportedTypes.includes(query.type));
        if (matching.length === 0) {
            return {
                executorName: '',
                confidence: 0,
                reason: `No executor supports query type '${query.type}'`,
            };
        }
        // If multiple executors match, prefer:
        // 1. Lower latency
        // 2. First registered
        const sorted = [...matching].sort((a, b) => {
            const latencyOrder = { fast: 0, medium: 1, slow: 2 };
            return ((latencyOrder[a.estimatedLatency] ?? 1) -
                (latencyOrder[b.estimatedLatency] ?? 1));
        });
        return {
            executorName: sorted[0].name,
            confidence: 1.0,
            reason: `Type '${query.type}' matched executor '${sorted[0].name}'`,
        };
    }
}
exports.TypeBasedSelector = TypeBasedSelector;
// ============================================================================
// Priority-Based Selector
// ============================================================================
/**
 * Selector that uses explicit priority for routing
 */
class PriorityBasedSelector {
    priorities;
    name = 'priority-based';
    constructor(priorities = new Map()) {
        this.priorities = priorities;
    }
    /**
     * Set priority for an executor
     */
    setPriority(executorName, priority) {
        this.priorities.set(executorName, priority);
        return this;
    }
    async select(query, executors) {
        // Find matching executors
        const matching = executors.filter((e) => e.supportedTypes.includes(query.type));
        if (matching.length === 0) {
            return {
                executorName: '',
                confidence: 0,
                reason: `No executor supports query type '${query.type}'`,
            };
        }
        // Sort by priority (higher = better)
        const sorted = [...matching].sort((a, b) => {
            const priorityA = this.priorities.get(a.name) ?? 0;
            const priorityB = this.priorities.get(b.name) ?? 0;
            return priorityB - priorityA;
        });
        return {
            executorName: sorted[0].name,
            confidence: 1.0,
            reason: `Type '${query.type}' matched executor '${sorted[0].name}' (priority: ${this.priorities.get(sorted[0].name) ?? 0})`,
        };
    }
}
exports.PriorityBasedSelector = PriorityBasedSelector;
// ============================================================================
// Query Router
// ============================================================================
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
class QueryRouter {
    executors = new Map();
    selector;
    /**
     * Dynamic metadata based on registered executors
     */
    get metadata() {
        return {
            name: 'query-router',
            description: 'Routes queries to appropriate executors',
            supportedTypes: this.getSupportedTypes(),
            estimatedLatency: 'medium',
            supportsStreaming: true,
        };
    }
    constructor(selector) {
        this.selector = selector ?? new TypeBasedSelector();
    }
    /**
     * Register an executor
     *
     * @param executor - Executor to register
     * @returns this for chaining
     */
    register(executor) {
        this.executors.set(executor.metadata.name, executor);
        return this;
    }
    /**
     * Unregister an executor
     *
     * @param name - Executor name
     * @returns true if executor was removed
     */
    unregister(name) {
        return this.executors.delete(name);
    }
    /**
     * Get registered executor by name
     */
    getExecutor(name) {
        return this.executors.get(name);
    }
    /**
     * List all registered executors
     */
    listExecutors() {
        return Array.from(this.executors.values()).map((e) => e.metadata);
    }
    /**
     * Get all supported query types
     */
    getSupportedTypes() {
        return (0, executor_js_1.getAllSupportedTypes)(Array.from(this.executors.values()));
    }
    /**
     * Check if a query type is supported
     */
    supportsType(type) {
        return this.getSupportedTypes().includes(type);
    }
    /**
     * Set the query selector
     */
    setSelector(selector) {
        this.selector = selector;
        return this;
    }
    /**
     * Execute a query with automatic routing
     */
    async execute(query) {
        // 1. Select best executor
        const selection = await this.selector.select(query, this.listExecutors());
        if (selection.confidence === 0) {
            return (0, types_js_1.queryFailure)('NO_EXECUTOR', selection.reason ?? `No executor found for query type '${query.type}'`, { retryable: false });
        }
        // 2. Get executor
        const executor = this.executors.get(selection.executorName);
        if (!executor) {
            return (0, types_js_1.queryFailure)('EXECUTOR_NOT_FOUND', `Executor '${selection.executorName}' not found`, { retryable: false });
        }
        // 3. Execute
        const result = await executor.execute(query);
        // 4. Enrich metadata with routing info
        if ((0, types_js_1.isQuerySuccess)(result)) {
            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    custom: {
                        ...(result.metadata.custom ?? {}),
                        routing: {
                            selector: this.selector.name,
                            executor: selection.executorName,
                            confidence: selection.confidence,
                            reason: selection.reason,
                        },
                    },
                },
            };
        }
        return result;
    }
    /**
     * Stream query results with automatic routing
     */
    async *stream(query) {
        // 1. Select executor
        const selection = await this.selector.select(query, this.listExecutors());
        if (selection.confidence === 0) {
            yield (0, types_js_1.queryFailure)('NO_EXECUTOR', selection.reason ?? `No executor found for query type '${query.type}'`);
            return;
        }
        const executor = this.executors.get(selection.executorName);
        if (!executor) {
            yield (0, types_js_1.queryFailure)('EXECUTOR_NOT_FOUND', 'Executor not found');
            return;
        }
        // 2. Stream from executor
        for await (const result of executor.stream(query)) {
            // Enrich success results with routing info
            if ((0, types_js_1.isQuerySuccess)(result)) {
                yield {
                    ...result,
                    metadata: {
                        ...result.metadata,
                        custom: {
                            ...(result.metadata.custom ?? {}),
                            routing: {
                                selector: this.selector.name,
                                executor: selection.executorName,
                                confidence: selection.confidence,
                            },
                        },
                    },
                };
            }
            else {
                yield result;
            }
        }
    }
    /**
     * Convert router to unified tool
     */
    asTool(options) {
        const supportedTypes = this.getSupportedTypes();
        return {
            name: options?.name ?? 'unified_query',
            description: options?.description ??
                `Query knowledge base. Supports: ${supportedTypes.join(', ')}`,
            router: this,
            // Note: Full tool implementation is in @gerts/tools/query-tool.ts
        };
    }
}
exports.QueryRouter = QueryRouter;
// ============================================================================
// Router Factory
// ============================================================================
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
function createQueryRouter(executors, selector) {
    const router = new QueryRouter(selector);
    for (const executor of executors) {
        router.register(executor);
    }
    return router;
}
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
function createPriorityRouter(executors, priorities) {
    const selector = new PriorityBasedSelector();
    for (const [name, priority] of Object.entries(priorities)) {
        selector.setPriority(name, priority);
    }
    return createQueryRouter(executors, selector);
}
//# sourceMappingURL=router.js.map