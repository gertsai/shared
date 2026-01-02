/**
 * @gerts/core - Hook Executor
 * Phase 19: Hooks & Lifecycle
 *
 * Executes hooks with support for background execution and deep copy.
 * Combines Agno (background + deep copy) and CrewAI (filtering) patterns.
 *
 * Features:
 * - Background execution with queue
 * - Deep copy mechanism for background hooks
 * - Priority-based execution ordering
 * - Error isolation
 * - Parameter filtering based on function signature
 */
import type { PreHook, PostHook, PreHookParams, PostHookParams, ToolPreHook, ToolPostHook, FunctionCall, HookMetadata, HookExecutorConfig, HookLike } from './types';
import type { LLMCallContext, ToolCallContext } from './context';
import { type EventBus } from '../event-bus';
/**
 * Get hook metadata from a function.
 */
export declare function getHookMetadata(hook: Function): HookMetadata | undefined;
/**
 * Set hook metadata on a function.
 */
export declare function setHookMetadata(hook: Function, metadata: HookMetadata): void;
/**
 * Check if a hook should run in background.
 */
export declare function shouldRunInBackground(hook: Function): boolean;
/**
 * Get hook priority (for execution ordering).
 */
export declare function getHookPriority(hook: Function): number;
/**
 * Get hook name.
 */
export declare function getHookName(hook: Function): string;
/**
 * Create a deep copy of hook arguments for background execution.
 *
 * Why deep copy?
 * - Background hooks run after response is sent
 * - Session may continue and modify state
 * - Hooks should see consistent state snapshot
 *
 * From Agno pattern: Prevents race conditions when hooks run after response.
 *
 * @example
 * const copied = copyArgsForBackground(params);
 * backgroundQueue.add(() => hook(copied));
 */
export declare function copyArgsForBackground<T extends Record<string, unknown>>(args: T): T;
/**
 * Executes hooks with support for background execution.
 *
 * Combines Agno (background + deep copy) and CrewAI (filtering) patterns.
 *
 * @example
 * const executor = new HookExecutor();
 *
 * // Execute pre-hooks
 * await executor.executePreHooks(
 *   [validateInput, logRequest],
 *   { runInput, runContext, agent },
 *   false // runInBackground
 * );
 *
 * // Execute post-hooks
 * await executor.executePostHooks(
 *   [formatOutput, sendNotification],
 *   { runOutput, runContext, agent },
 *   false
 * );
 */
export declare class HookExecutor {
    private backgroundQueue;
    private eventBus;
    constructor(config?: HookExecutorConfig);
    /**
     * Set event bus for hook events.
     */
    setEventBus(eventBus: EventBus): void;
    /**
     * Execute pre-hooks with optional background execution.
     *
     * @param hooks - List of pre-hooks to execute
     * @param params - Hook parameters
     * @param runInBackground - Global background flag (from workflow config)
     *
     * @throws InputCheckError if a hook blocks execution
     */
    executePreHooks(hooks: PreHook[], params: PreHookParams, runInBackground?: boolean): Promise<void>;
    /**
     * Execute post-hooks with optional background execution.
     *
     * @param hooks - List of post-hooks to execute
     * @param params - Hook parameters
     * @param runInBackground - Global background flag
     */
    executePostHooks(hooks: PostHook[], params: PostHookParams, runInBackground?: boolean): Promise<void>;
    /**
     * Execute before LLM call hooks.
     *
     * @param context - LLM call context
     * @returns false if any hook blocks execution, null otherwise
     */
    executeBeforeLLMHooks(context: LLMCallContext): Promise<boolean>;
    /**
     * Execute after LLM call hooks.
     *
     * @param context - LLM call context (with response)
     * @returns Modified response or null
     */
    executeAfterLLMHooks(context: LLMCallContext): Promise<string | null>;
    /**
     * Execute before tool call hooks.
     *
     * @param context - Tool call context
     * @returns false if any hook blocks execution
     */
    executeBeforeToolHooks(context: ToolCallContext): Promise<boolean>;
    /**
     * Execute after tool call hooks.
     *
     * @param context - Tool call context (with result)
     * @returns Modified result or null
     */
    executeAfterToolHooks(context: ToolCallContext): Promise<string | null>;
    /**
     * Execute tool pre-hooks for a function call.
     *
     * @param hooks - Tool pre-hooks
     * @param fc - Function call
     * @returns false if blocked
     */
    executeToolPreHooks(hooks: ToolPreHook[], fc: FunctionCall): Promise<boolean>;
    /**
     * Execute tool post-hooks for a function call.
     *
     * @param hooks - Tool post-hooks
     * @param fc - Function call (with result)
     * @returns Modified result or null
     */
    executeToolPostHooks(hooks: ToolPostHook[], fc: FunctionCall): Promise<string | null>;
    /**
     * Normalize hooks (convert guardrails/evals to callables).
     *
     * @param hooks - Mixed array of hooks, guardrails, evaluators
     * @param type - Hook type (pre/post)
     * @returns Normalized hook functions
     */
    normalizeHooks(hooks: HookLike[] | undefined, type: 'pre' | 'post'): (PreHook | PostHook)[];
    /**
     * Wait for all background hooks to complete.
     */
    waitForBackground(): Promise<void>;
    /**
     * Get background queue statistics.
     */
    getBackgroundStats(): {
        queued: number;
        running: number;
    };
    /**
     * Sort hooks by priority (higher priority = earlier execution).
     */
    private sortByPriority;
    /**
     * Emit hook execution event.
     */
    private emitHookEvent;
}
/**
 * Default hook executor instance.
 */
export declare const hookExecutor: HookExecutor;
