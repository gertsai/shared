"use strict";
/**
 * @gerts/core - Hook Decorators
 * Phase 19: Hooks & Lifecycle
 *
 * Decorator functions for hooks.
 * From Agno pattern: Decorator for background execution and metadata.
 * From CrewAI pattern: Auto-registration decorators.
 *
 * Features:
 * - @hook decorator for marking hooks
 * - @beforeLLMCall, @afterLLMCall for LLM hooks
 * - @beforeToolCall, @afterToolCall for tool hooks
 * - Auto-registration support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hook = hook;
exports.createHook = createHook;
exports.beforeLLMCall = beforeLLMCall;
exports.afterLLMCall = afterLLMCall;
exports.createBeforeLLMHook = createBeforeLLMHook;
exports.createAfterLLMHook = createAfterLLMHook;
exports.beforeToolCall = beforeToolCall;
exports.afterToolCall = afterToolCall;
exports.createBeforeToolHook = createBeforeToolHook;
exports.createAfterToolHook = createAfterToolHook;
exports.blockingHook = blockingHook;
exports.backgroundHook = backgroundHook;
exports.priorityHook = priorityHook;
exports.Hook = Hook;
exports.BeforeLLMCall = BeforeLLMCall;
exports.AfterLLMCall = AfterLLMCall;
exports.BeforeToolCall = BeforeToolCall;
exports.AfterToolCall = AfterToolCall;
const executor_1 = require("./executor");
const manager_1 = require("./manager");
// ============================================================================
// @hook Decorator
// ============================================================================
/**
 * Decorator for marking hooks with metadata.
 *
 * From Agno pattern: Sets metadata on function for background execution.
 *
 * @example
 * // Background hook
 * const logAnalytics = hook({ runInBackground: true })(
 *   async function logAnalytics({ runOutput }: PostHookParams) {
 *     await analyticsService.log(runOutput);
 *   }
 * );
 *
 * @example
 * // High priority hook
 * const validateInput = hook({ priority: 100 })(
 *   function validateInput({ runInput }: PreHookParams) {
 *     if (runInput.inputContent.includes('forbidden')) {
 *       throw new InputCheckError('Forbidden', CheckTrigger.INPUT_NOT_ALLOWED);
 *     }
 *   }
 * );
 */
function hook(options) {
    return function (target) {
        const metadata = {
            name: options?.name ?? target.name ?? 'anonymous',
            runInBackground: options?.runInBackground ?? false,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(target, metadata);
        return target;
    };
}
/**
 * Create a hook with metadata (alternative to decorator syntax).
 *
 * @example
 * const myHook = createHook(
 *   { runInBackground: true },
 *   async ({ runOutput }) => {
 *     await notificationService.send(runOutput);
 *   }
 * );
 */
function createHook(options, fn) {
    return hook(options)(fn);
}
// ============================================================================
// LLM Hook Decorators
// ============================================================================
/**
 * Decorator for before LLM call hooks.
 *
 * From CrewAI pattern: Decorator factory with filtering.
 *
 * @example
 * // Hook for all agents
 * const logAllCalls = beforeLLMCall()(
 *   function logAllCalls(context) {
 *     console.log('LLM call starting');
 *     return null; // Continue
 *   }
 * );
 *
 * @example
 * // Hook for specific agents with auto-registration
 * const logResearcherCalls = beforeLLMCall({
 *   agents: ['Researcher'],
 *   autoRegister: true
 * })(
 *   function logResearcherCalls(context) {
 *     console.log('Researcher LLM call');
 *     return null;
 *   }
 * );
 */
function beforeLLMCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(target, metadata);
        // Auto-register if requested
        if (options?.autoRegister !== false) {
            manager_1.hookManager.registerBeforeLLMHook(target, { agents: options?.agents }, options?.priority ?? 0);
        }
        return target;
    };
}
/**
 * Decorator for after LLM call hooks.
 *
 * @example
 * const redactSecrets = afterLLMCall({ autoRegister: true })(
 *   function redactSecrets(context) {
 *     if (context.response?.includes('SECRET')) {
 *       return context.response.replace(/SECRET/g, '***');
 *     }
 *     return null; // Keep original
 *   }
 * );
 */
function afterLLMCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(target, metadata);
        if (options?.autoRegister !== false) {
            manager_1.hookManager.registerAfterLLMHook(target, { agents: options?.agents }, options?.priority ?? 0);
        }
        return target;
    };
}
/**
 * Create a before LLM call hook (alternative to decorator).
 */
function createBeforeLLMHook(options, fn) {
    return beforeLLMCall(options)(fn);
}
/**
 * Create an after LLM call hook (alternative to decorator).
 */
function createAfterLLMHook(options, fn) {
    return afterLLMCall(options)(fn);
}
// ============================================================================
// Tool Hook Decorators
// ============================================================================
/**
 * Decorator for before tool call hooks.
 *
 * @example
 * // Require approval for dangerous tools
 * const approvalGate = beforeToolCall({
 *   tools: ['delete', 'execute'],
 *   autoRegister: true
 * })(
 *   async function approvalGate(context) {
 *     const approval = await context.requestHumanInput(
 *       `Execute ${context.toolName}?`
 *     );
 *     if (approval !== 'yes') {
 *       return false; // Block
 *     }
 *     return null; // Continue
 *   }
 * );
 */
function beforeToolCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(target, metadata);
        if (options?.autoRegister !== false) {
            manager_1.hookManager.registerBeforeToolHook(target, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
        }
        return target;
    };
}
/**
 * Decorator for after tool call hooks.
 *
 * @example
 * const redactToolResult = afterToolCall({ autoRegister: true })(
 *   function redactToolResult(context) {
 *     if (context.toolResult?.includes('PII')) {
 *       return '[REDACTED]';
 *     }
 *     return null;
 *   }
 * );
 */
function afterToolCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(target, metadata);
        if (options?.autoRegister !== false) {
            manager_1.hookManager.registerAfterToolHook(target, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
        }
        return target;
    };
}
/**
 * Create a before tool call hook (alternative to decorator).
 */
function createBeforeToolHook(options, fn) {
    return beforeToolCall(options)(fn);
}
/**
 * Create an after tool call hook (alternative to decorator).
 */
function createAfterToolHook(options, fn) {
    return afterToolCall(options)(fn);
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Create a blocking pre-hook (runs synchronously, can throw).
 */
function blockingHook(fn, options) {
    return hook({ ...options, runInBackground: false })(fn);
}
/**
 * Create a background hook (runs async, doesn't block).
 */
function backgroundHook(fn, options) {
    return hook({ ...options, runInBackground: true })(fn);
}
/**
 * Create a high-priority hook (runs first).
 */
function priorityHook(fn, priority = 100) {
    return hook({ priority })(fn);
}
// ============================================================================
// Method Decorators (for class methods)
// ============================================================================
/**
 * Method decorator for @Hook.
 *
 * Note: TypeScript decorators work on class methods only.
 *
 * @example
 * class MyHooks {
 *   @Hook({ runInBackground: true })
 *   async logOutput(params: PostHookParams) {
 *     console.log(params.runOutput.content);
 *   }
 * }
 */
function Hook(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: options?.name ?? String(propertyKey),
            runInBackground: options?.runInBackground ?? false,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(originalMethod, metadata);
        return descriptor;
    };
}
/**
 * Method decorator for @BeforeLLMCall.
 */
function BeforeLLMCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(originalMethod, metadata);
        if (options?.autoRegister) {
            manager_1.hookManager.registerBeforeLLMHook(originalMethod, { agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
/**
 * Method decorator for @AfterLLMCall.
 */
function AfterLLMCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(originalMethod, metadata);
        if (options?.autoRegister) {
            manager_1.hookManager.registerAfterLLMHook(originalMethod, { agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
/**
 * Method decorator for @BeforeToolCall.
 */
function BeforeToolCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(originalMethod, metadata);
        if (options?.autoRegister) {
            manager_1.hookManager.registerBeforeToolHook(originalMethod, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
/**
 * Method decorator for @AfterToolCall.
 */
function AfterToolCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        (0, executor_1.setHookMetadata)(originalMethod, metadata);
        if (options?.autoRegister) {
            manager_1.hookManager.registerAfterToolHook(originalMethod, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
//# sourceMappingURL=decorators.js.map