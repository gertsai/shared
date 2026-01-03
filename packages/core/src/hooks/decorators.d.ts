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
import type { BeforeLLMHook, AfterLLMHook, BeforeToolHook, AfterToolHook } from './types';
/** Options for @hook decorator */
export interface HookDecoratorOptions {
    /** Run hook in background (non-blocking) */
    runInBackground?: boolean;
    /** Execution priority (higher = earlier) */
    priority?: number;
    /** Custom hook name */
    name?: string;
}
/** Options for LLM hook decorators */
export interface LLMHookDecoratorOptions {
    /** Filter to specific agents */
    agents?: string[];
    /** Execution priority */
    priority?: number;
    /** Auto-register with global hook manager */
    autoRegister?: boolean;
}
/** Options for tool hook decorators */
export interface ToolHookDecoratorOptions {
    /** Filter to specific tools */
    tools?: string[];
    /** Filter to specific agents */
    agents?: string[];
    /** Execution priority */
    priority?: number;
    /** Auto-register with global hook manager */
    autoRegister?: boolean;
}
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
export declare function hook<T extends Function>(options?: HookDecoratorOptions): (target: T) => T;
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
export declare function createHook<T extends Function>(options: HookDecoratorOptions, fn: T): T;
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
export declare function beforeLLMCall(options?: LLMHookDecoratorOptions): <T extends BeforeLLMHook>(target: T) => T;
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
export declare function afterLLMCall(options?: LLMHookDecoratorOptions): <T extends AfterLLMHook>(target: T) => T;
/**
 * Create a before LLM call hook (alternative to decorator).
 */
export declare function createBeforeLLMHook(options: LLMHookDecoratorOptions | undefined, fn: BeforeLLMHook): BeforeLLMHook;
/**
 * Create an after LLM call hook (alternative to decorator).
 */
export declare function createAfterLLMHook(options: LLMHookDecoratorOptions | undefined, fn: AfterLLMHook): AfterLLMHook;
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
export declare function beforeToolCall(options?: ToolHookDecoratorOptions): <T extends BeforeToolHook>(target: T) => T;
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
export declare function afterToolCall(options?: ToolHookDecoratorOptions): <T extends AfterToolHook>(target: T) => T;
/**
 * Create a before tool call hook (alternative to decorator).
 */
export declare function createBeforeToolHook(options: ToolHookDecoratorOptions | undefined, fn: BeforeToolHook): BeforeToolHook;
/**
 * Create an after tool call hook (alternative to decorator).
 */
export declare function createAfterToolHook(options: ToolHookDecoratorOptions | undefined, fn: AfterToolHook): AfterToolHook;
/**
 * Create a blocking pre-hook (runs synchronously, can throw).
 */
export declare function blockingHook<T extends Function>(fn: T, options?: Omit<HookDecoratorOptions, 'runInBackground'>): T;
/**
 * Create a background hook (runs async, doesn't block).
 */
export declare function backgroundHook<T extends Function>(fn: T, options?: Omit<HookDecoratorOptions, 'runInBackground'>): T;
/**
 * Create a high-priority hook (runs first).
 */
export declare function priorityHook<T extends Function>(fn: T, priority?: number): T;
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
export declare function Hook(options?: HookDecoratorOptions): MethodDecorator;
/**
 * Method decorator for @BeforeLLMCall.
 */
export declare function BeforeLLMCall(options?: LLMHookDecoratorOptions): MethodDecorator;
/**
 * Method decorator for @AfterLLMCall.
 */
export declare function AfterLLMCall(options?: LLMHookDecoratorOptions): MethodDecorator;
/**
 * Method decorator for @BeforeToolCall.
 */
export declare function BeforeToolCall(options?: ToolHookDecoratorOptions): MethodDecorator;
/**
 * Method decorator for @AfterToolCall.
 */
export declare function AfterToolCall(options?: ToolHookDecoratorOptions): MethodDecorator;
//# sourceMappingURL=decorators.d.ts.map