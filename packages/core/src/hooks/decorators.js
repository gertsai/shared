import { setHookMetadata } from './executor';
import { hookManager } from './manager';
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
export function hook(options) {
    return function (target) {
        const metadata = {
            name: options?.name ?? target.name ?? 'anonymous',
            runInBackground: options?.runInBackground ?? false,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(target, metadata);
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
export function createHook(options, fn) {
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
export function beforeLLMCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(target, metadata);
        // Auto-register if requested
        if (options?.autoRegister !== false) {
            hookManager.registerBeforeLLMHook(target, { agents: options?.agents }, options?.priority ?? 0);
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
export function afterLLMCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(target, metadata);
        if (options?.autoRegister !== false) {
            hookManager.registerAfterLLMHook(target, { agents: options?.agents }, options?.priority ?? 0);
        }
        return target;
    };
}
/**
 * Create a before LLM call hook (alternative to decorator).
 */
export function createBeforeLLMHook(options, fn) {
    return beforeLLMCall(options)(fn);
}
/**
 * Create an after LLM call hook (alternative to decorator).
 */
export function createAfterLLMHook(options, fn) {
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
export function beforeToolCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(target, metadata);
        if (options?.autoRegister !== false) {
            hookManager.registerBeforeToolHook(target, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
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
export function afterToolCall(options) {
    return function (target) {
        const metadata = {
            name: target.name ?? 'anonymous',
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(target, metadata);
        if (options?.autoRegister !== false) {
            hookManager.registerAfterToolHook(target, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
        }
        return target;
    };
}
/**
 * Create a before tool call hook (alternative to decorator).
 */
export function createBeforeToolHook(options, fn) {
    return beforeToolCall(options)(fn);
}
/**
 * Create an after tool call hook (alternative to decorator).
 */
export function createAfterToolHook(options, fn) {
    return afterToolCall(options)(fn);
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Create a blocking pre-hook (runs synchronously, can throw).
 */
export function blockingHook(fn, options) {
    return hook({ ...options, runInBackground: false })(fn);
}
/**
 * Create a background hook (runs async, doesn't block).
 */
export function backgroundHook(fn, options) {
    return hook({ ...options, runInBackground: true })(fn);
}
/**
 * Create a high-priority hook (runs first).
 */
export function priorityHook(fn, priority = 100) {
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
export function Hook(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: options?.name ?? String(propertyKey),
            runInBackground: options?.runInBackground ?? false,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(originalMethod, metadata);
        return descriptor;
    };
}
/**
 * Method decorator for @BeforeLLMCall.
 */
export function BeforeLLMCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(originalMethod, metadata);
        if (options?.autoRegister) {
            hookManager.registerBeforeLLMHook(originalMethod, { agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
/**
 * Method decorator for @AfterLLMCall.
 */
export function AfterLLMCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(originalMethod, metadata);
        if (options?.autoRegister) {
            hookManager.registerAfterLLMHook(originalMethod, { agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
/**
 * Method decorator for @BeforeToolCall.
 */
export function BeforeToolCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(originalMethod, metadata);
        if (options?.autoRegister) {
            hookManager.registerBeforeToolHook(originalMethod, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
/**
 * Method decorator for @AfterToolCall.
 */
export function AfterToolCall(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const metadata = {
            name: String(propertyKey),
            filterTools: options?.tools,
            filterAgents: options?.agents,
            priority: options?.priority ?? 0,
        };
        setHookMetadata(originalMethod, metadata);
        if (options?.autoRegister) {
            hookManager.registerAfterToolHook(originalMethod, { tools: options?.tools, agents: options?.agents }, options?.priority ?? 0);
        }
        return descriptor;
    };
}
