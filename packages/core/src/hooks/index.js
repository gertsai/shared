"use strict";
/**
 * @gerts/core - Hooks & Lifecycle System
 * Phase 19: Hooks & Lifecycle
 *
 * Unified hooks system merging Agno (decorators, background execution)
 * and CrewAI (global registry, event bus, filtering) patterns.
 *
 * Key Features:
 * - Pre/post hooks for agents, tools, workflows
 * - Background execution with deep copy
 * - Global hook registry with filtering
 * - Priority-based execution ordering
 * - Type-safe hook contexts
 *
 * @example
 * import {
 *   hook,
 *   hookManager,
 *   hookExecutor,
 *   LLMCallContext,
 *   ToolCallContext,
 * } from '@gerts/core';
 *
 * // Create a background hook
 * const logHook = hook({ runInBackground: true })(
 *   async function logHook({ runOutput }) {
 *     await logger.log(runOutput);
 *   }
 * );
 *
 * // Register global LLM hook
 * hookManager.registerBeforeLLMHook(
 *   async (context) => {
 *     if (context.messages.length > 100) {
 *       return false; // Block
 *     }
 *     return null; // Continue
 *   },
 *   { agents: ['ChatAgent'] }
 * );
 *
 * // Execute hooks
 * await hookExecutor.executePreHooks(
 *   [validateHook, logHook],
 *   { runInput, runContext, agent },
 *   false // runInBackground
 * );
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AfterToolCall = exports.BeforeToolCall = exports.AfterLLMCall = exports.BeforeLLMCall = exports.Hook = exports.priorityHook = exports.backgroundHook = exports.blockingHook = exports.createAfterToolHook = exports.createBeforeToolHook = exports.afterToolCall = exports.beforeToolCall = exports.createAfterLLMHook = exports.createBeforeLLMHook = exports.afterLLMCall = exports.beforeLLMCall = exports.createHook = exports.hook = exports.copyArgsForBackground = exports.getHookName = exports.getHookPriority = exports.shouldRunInBackground = exports.setHookMetadata = exports.getHookMetadata = exports.hookExecutor = exports.HookExecutor = exports.hookManager = exports.HookManager = exports.HookContextFactory = exports.ToolCallContext = exports.LLMCallContext = exports.BACKGROUND_HOOK_COPY_KEYS = exports.RunEvent = exports.OutputCheckError = exports.InputCheckError = exports.CheckTrigger = void 0;
var types_1 = require("./types");
// Errors
Object.defineProperty(exports, "CheckTrigger", { enumerable: true, get: function () { return types_1.CheckTrigger; } });
Object.defineProperty(exports, "InputCheckError", { enumerable: true, get: function () { return types_1.InputCheckError; } });
Object.defineProperty(exports, "OutputCheckError", { enumerable: true, get: function () { return types_1.OutputCheckError; } });
// Events
Object.defineProperty(exports, "RunEvent", { enumerable: true, get: function () { return types_1.RunEvent; } });
// Constants
Object.defineProperty(exports, "BACKGROUND_HOOK_COPY_KEYS", { enumerable: true, get: function () { return types_1.BACKGROUND_HOOK_COPY_KEYS; } });
// ============================================================================
// Context Classes
// ============================================================================
var context_1 = require("./context");
// Context classes
Object.defineProperty(exports, "LLMCallContext", { enumerable: true, get: function () { return context_1.LLMCallContext; } });
Object.defineProperty(exports, "ToolCallContext", { enumerable: true, get: function () { return context_1.ToolCallContext; } });
// Factory
Object.defineProperty(exports, "HookContextFactory", { enumerable: true, get: function () { return context_1.HookContextFactory; } });
// ============================================================================
// Hook Manager
// ============================================================================
var manager_1 = require("./manager");
Object.defineProperty(exports, "HookManager", { enumerable: true, get: function () { return manager_1.HookManager; } });
Object.defineProperty(exports, "hookManager", { enumerable: true, get: function () { return manager_1.hookManager; } });
// ============================================================================
// Hook Executor
// ============================================================================
var executor_1 = require("./executor");
Object.defineProperty(exports, "HookExecutor", { enumerable: true, get: function () { return executor_1.HookExecutor; } });
Object.defineProperty(exports, "hookExecutor", { enumerable: true, get: function () { return executor_1.hookExecutor; } });
// Metadata helpers
Object.defineProperty(exports, "getHookMetadata", { enumerable: true, get: function () { return executor_1.getHookMetadata; } });
Object.defineProperty(exports, "setHookMetadata", { enumerable: true, get: function () { return executor_1.setHookMetadata; } });
Object.defineProperty(exports, "shouldRunInBackground", { enumerable: true, get: function () { return executor_1.shouldRunInBackground; } });
Object.defineProperty(exports, "getHookPriority", { enumerable: true, get: function () { return executor_1.getHookPriority; } });
Object.defineProperty(exports, "getHookName", { enumerable: true, get: function () { return executor_1.getHookName; } });
// Deep copy
Object.defineProperty(exports, "copyArgsForBackground", { enumerable: true, get: function () { return executor_1.copyArgsForBackground; } });
// ============================================================================
// Decorators
// ============================================================================
var decorators_1 = require("./decorators");
// Function decorators
Object.defineProperty(exports, "hook", { enumerable: true, get: function () { return decorators_1.hook; } });
Object.defineProperty(exports, "createHook", { enumerable: true, get: function () { return decorators_1.createHook; } });
Object.defineProperty(exports, "beforeLLMCall", { enumerable: true, get: function () { return decorators_1.beforeLLMCall; } });
Object.defineProperty(exports, "afterLLMCall", { enumerable: true, get: function () { return decorators_1.afterLLMCall; } });
Object.defineProperty(exports, "createBeforeLLMHook", { enumerable: true, get: function () { return decorators_1.createBeforeLLMHook; } });
Object.defineProperty(exports, "createAfterLLMHook", { enumerable: true, get: function () { return decorators_1.createAfterLLMHook; } });
Object.defineProperty(exports, "beforeToolCall", { enumerable: true, get: function () { return decorators_1.beforeToolCall; } });
Object.defineProperty(exports, "afterToolCall", { enumerable: true, get: function () { return decorators_1.afterToolCall; } });
Object.defineProperty(exports, "createBeforeToolHook", { enumerable: true, get: function () { return decorators_1.createBeforeToolHook; } });
Object.defineProperty(exports, "createAfterToolHook", { enumerable: true, get: function () { return decorators_1.createAfterToolHook; } });
// Convenience functions
Object.defineProperty(exports, "blockingHook", { enumerable: true, get: function () { return decorators_1.blockingHook; } });
Object.defineProperty(exports, "backgroundHook", { enumerable: true, get: function () { return decorators_1.backgroundHook; } });
Object.defineProperty(exports, "priorityHook", { enumerable: true, get: function () { return decorators_1.priorityHook; } });
// Method decorators (for classes)
Object.defineProperty(exports, "Hook", { enumerable: true, get: function () { return decorators_1.Hook; } });
Object.defineProperty(exports, "BeforeLLMCall", { enumerable: true, get: function () { return decorators_1.BeforeLLMCall; } });
Object.defineProperty(exports, "AfterLLMCall", { enumerable: true, get: function () { return decorators_1.AfterLLMCall; } });
Object.defineProperty(exports, "BeforeToolCall", { enumerable: true, get: function () { return decorators_1.BeforeToolCall; } });
Object.defineProperty(exports, "AfterToolCall", { enumerable: true, get: function () { return decorators_1.AfterToolCall; } });
//# sourceMappingURL=index.js.map