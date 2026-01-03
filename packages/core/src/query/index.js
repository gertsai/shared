"use strict";
/**
 * @gerts/core - Query System
 *
 * Universal query types for type-safe query → result mapping.
 *
 * @see RFC-032: Universal Query System
 *
 * @example
 * ```typescript
 * import {
 *   QueryRouter,
 *   createNLQuery,
 *   isQuerySuccess,
 *   type NLQuery,
 *   type QueryResult,
 * } from '@gerts/core';
 *
 * // Create typed query
 * const query = createNLQuery(tenantId, 'Who works at NeuraTech?');
 *
 * // Execute with router
 * const result = await router.execute(query);
 *
 * // Type-safe result handling
 * if (isQuerySuccess(result)) {
 *   console.log(result.data.answer);
 *   console.log(result.sources);
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPriorityRouter = exports.createQueryRouter = exports.QueryRouter = exports.PriorityBasedSelector = exports.TypeBasedSelector = exports.createRAGQuery = exports.createVectorQuery = exports.createGraphQuery = exports.createNLQuery = exports.isKnownQueryType = exports.isRAGQuery = exports.isVectorQuery = exports.isGraphQuery = exports.isNLQuery = exports.findExecutorsByType = exports.findExecutorByName = exports.getAllSupportedTypes = exports.executorSupportsType = exports.createExecutorMetadata = exports.BaseQueryExecutor = exports.QueryError = exports.QUERY_ERROR_CODES = exports.queryPartial = exports.queryFailure = exports.querySuccess = exports.isQueryError = exports.isQueryPartial = exports.isQueryFailure = exports.isQuerySuccess = void 0;
var types_js_1 = require("./types.js");
// Type guards
Object.defineProperty(exports, "isQuerySuccess", { enumerable: true, get: function () { return types_js_1.isQuerySuccess; } });
Object.defineProperty(exports, "isQueryFailure", { enumerable: true, get: function () { return types_js_1.isQueryFailure; } });
Object.defineProperty(exports, "isQueryPartial", { enumerable: true, get: function () { return types_js_1.isQueryPartial; } });
Object.defineProperty(exports, "isQueryError", { enumerable: true, get: function () { return types_js_1.isQueryError; } });
// Factories
Object.defineProperty(exports, "querySuccess", { enumerable: true, get: function () { return types_js_1.querySuccess; } });
Object.defineProperty(exports, "queryFailure", { enumerable: true, get: function () { return types_js_1.queryFailure; } });
Object.defineProperty(exports, "queryPartial", { enumerable: true, get: function () { return types_js_1.queryPartial; } });
// Error codes
Object.defineProperty(exports, "QUERY_ERROR_CODES", { enumerable: true, get: function () { return types_js_1.QUERY_ERROR_CODES; } });
// Error class
Object.defineProperty(exports, "QueryError", { enumerable: true, get: function () { return types_js_1.QueryError; } });
var executor_js_1 = require("./executor.js");
Object.defineProperty(exports, "BaseQueryExecutor", { enumerable: true, get: function () { return executor_js_1.BaseQueryExecutor; } });
Object.defineProperty(exports, "createExecutorMetadata", { enumerable: true, get: function () { return executor_js_1.createExecutorMetadata; } });
Object.defineProperty(exports, "executorSupportsType", { enumerable: true, get: function () { return executor_js_1.executorSupportsType; } });
Object.defineProperty(exports, "getAllSupportedTypes", { enumerable: true, get: function () { return executor_js_1.getAllSupportedTypes; } });
Object.defineProperty(exports, "findExecutorByName", { enumerable: true, get: function () { return executor_js_1.findExecutorByName; } });
Object.defineProperty(exports, "findExecutorsByType", { enumerable: true, get: function () { return executor_js_1.findExecutorsByType; } });
var registry_js_1 = require("./registry.js");
// Type guards
Object.defineProperty(exports, "isNLQuery", { enumerable: true, get: function () { return registry_js_1.isNLQuery; } });
Object.defineProperty(exports, "isGraphQuery", { enumerable: true, get: function () { return registry_js_1.isGraphQuery; } });
Object.defineProperty(exports, "isVectorQuery", { enumerable: true, get: function () { return registry_js_1.isVectorQuery; } });
Object.defineProperty(exports, "isRAGQuery", { enumerable: true, get: function () { return registry_js_1.isRAGQuery; } });
Object.defineProperty(exports, "isKnownQueryType", { enumerable: true, get: function () { return registry_js_1.isKnownQueryType; } });
// Factories
Object.defineProperty(exports, "createNLQuery", { enumerable: true, get: function () { return registry_js_1.createNLQuery; } });
Object.defineProperty(exports, "createGraphQuery", { enumerable: true, get: function () { return registry_js_1.createGraphQuery; } });
Object.defineProperty(exports, "createVectorQuery", { enumerable: true, get: function () { return registry_js_1.createVectorQuery; } });
Object.defineProperty(exports, "createRAGQuery", { enumerable: true, get: function () { return registry_js_1.createRAGQuery; } });
var router_js_1 = require("./router.js");
Object.defineProperty(exports, "TypeBasedSelector", { enumerable: true, get: function () { return router_js_1.TypeBasedSelector; } });
Object.defineProperty(exports, "PriorityBasedSelector", { enumerable: true, get: function () { return router_js_1.PriorityBasedSelector; } });
Object.defineProperty(exports, "QueryRouter", { enumerable: true, get: function () { return router_js_1.QueryRouter; } });
Object.defineProperty(exports, "createQueryRouter", { enumerable: true, get: function () { return router_js_1.createQueryRouter; } });
Object.defineProperty(exports, "createPriorityRouter", { enumerable: true, get: function () { return router_js_1.createPriorityRouter; } });
//# sourceMappingURL=index.js.map