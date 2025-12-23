/**
 * @gerts/core - Hook Manager
 * Phase 19: Hooks & Lifecycle
 *
 * Global hook registry for LLM and Tool hooks.
 * From CrewAI pattern: Centralized registration with filtering support.
 *
 * Features:
 * - Global hook registry (singleton)
 * - Filter support (agents, tools)
 * - Priority-based execution ordering
 * - Thread-safe registration
 */
import type { BeforeLLMHook, AfterLLMHook, BeforeToolHook, AfterToolHook, HookFilters, PreHook, PostHook } from './types';
/**
 * Global hook registry for gerts.ai platform.
 *
 * From CrewAI pattern: Centralized management with filtering support.
 *
 * @example
 * // Register a global before LLM hook
 * hookManager.registerBeforeLLMHook(
 *   async (context) => {
 *     console.log('LLM call starting');
 *     return null; // Continue execution
 *   },
 *   { agents: ['Researcher'] } // Only for Researcher agent
 * );
 *
 * // Register a global after tool hook
 * hookManager.registerAfterToolHook(
 *   async (context) => {
 *     console.log(`Tool ${context.toolName} completed`);
 *     return null; // Keep original result
 *   },
 *   { tools: ['search', 'browse'] } // Only for specific tools
 * );
 */
export declare class HookManager {
    private static instance;
    private beforeLLMHooks;
    private afterLLMHooks;
    private beforeToolHooks;
    private afterToolHooks;
    private agentPreHooks;
    private agentPostHooks;
    private constructor();
    /**
     * Get singleton instance.
     */
    static getInstance(): HookManager;
    /**
     * Reset singleton (for testing).
     */
    static resetInstance(): void;
    /**
     * Register a before LLM call hook.
     *
     * @param hook - Hook function
     * @param filters - Optional filters (agents)
     * @param priority - Execution priority (higher = earlier)
     *
     * @example
     * hookManager.registerBeforeLLMHook(
     *   async (context) => {
     *     // Validate messages
     *     if (context.messages.some(m => m.content.includes('forbidden'))) {
     *       return false; // Block execution
     *     }
     *     return null; // Continue
     *   },
     *   { agents: ['ChatAgent'] },
     *   100 // High priority
     * );
     */
    registerBeforeLLMHook(hook: BeforeLLMHook, filters?: HookFilters, priority?: number): void;
    /**
     * Register an after LLM call hook.
     *
     * @param hook - Hook function
     * @param filters - Optional filters (agents)
     * @param priority - Execution priority (higher = earlier)
     */
    registerAfterLLMHook(hook: AfterLLMHook, filters?: HookFilters, priority?: number): void;
    /**
     * Unregister a before LLM hook.
     */
    unregisterBeforeLLMHook(hook: BeforeLLMHook): void;
    /**
     * Unregister an after LLM hook.
     */
    unregisterAfterLLMHook(hook: AfterLLMHook): void;
    /**
     * Get before LLM hooks matching context.
     *
     * @param context - Filter context
     * @returns Matching hooks in priority order
     */
    getBeforeLLMHooks(context: {
        agent?: {
            name?: string;
            role?: string;
        };
    }): BeforeLLMHook[];
    /**
     * Get after LLM hooks matching context.
     */
    getAfterLLMHooks(context: {
        agent?: {
            name?: string;
            role?: string;
        };
    }): AfterLLMHook[];
    /**
     * Register a before tool call hook.
     *
     * @param hook - Hook function
     * @param filters - Optional filters (tools, agents)
     * @param priority - Execution priority (higher = earlier)
     *
     * @example
     * hookManager.registerBeforeToolHook(
     *   async (context) => {
     *     // Require approval for dangerous operations
     *     if (context.toolName === 'delete') {
     *       const approval = await context.requestHumanInput('Delete file?');
     *       if (approval !== 'yes') {
     *         return false; // Block
     *       }
     *     }
     *     return null; // Continue
     *   },
     *   { tools: ['delete', 'execute'] }
     * );
     */
    registerBeforeToolHook(hook: BeforeToolHook, filters?: HookFilters, priority?: number): void;
    /**
     * Register an after tool call hook.
     */
    registerAfterToolHook(hook: AfterToolHook, filters?: HookFilters, priority?: number): void;
    /**
     * Unregister a before tool hook.
     */
    unregisterBeforeToolHook(hook: BeforeToolHook): void;
    /**
     * Unregister an after tool hook.
     */
    unregisterAfterToolHook(hook: AfterToolHook): void;
    /**
     * Get before tool hooks matching context.
     */
    getBeforeToolHooks(context: {
        toolName?: string;
        agent?: {
            name?: string;
            role?: string;
        };
    }): BeforeToolHook[];
    /**
     * Get after tool hooks matching context.
     */
    getAfterToolHooks(context: {
        toolName?: string;
        agent?: {
            name?: string;
            role?: string;
        };
    }): AfterToolHook[];
    /**
     * Register a global pre-hook for agents.
     *
     * @param hook - Hook function
     * @param filters - Optional filters (agents)
     * @param options - Hook options
     */
    registerAgentPreHook(hook: PreHook, filters?: HookFilters, options?: {
        priority?: number;
        runInBackground?: boolean;
    }): void;
    /**
     * Register a global post-hook for agents.
     */
    registerAgentPostHook(hook: PostHook, filters?: HookFilters, options?: {
        priority?: number;
        runInBackground?: boolean;
    }): void;
    /**
     * Get agent pre-hooks matching context.
     */
    getAgentPreHooks(context: {
        agent?: {
            name?: string;
            role?: string;
        };
    }): Array<{
        hook: PreHook;
        runInBackground: boolean;
    }>;
    /**
     * Get agent post-hooks matching context.
     */
    getAgentPostHooks(context: {
        agent?: {
            name?: string;
            role?: string;
        };
    }): Array<{
        hook: PostHook;
        runInBackground: boolean;
    }>;
    /**
     * Clear all registered hooks.
     */
    clearAllHooks(): void;
    /**
     * Clear all LLM hooks.
     */
    clearLLMHooks(): void;
    /**
     * Clear all tool hooks.
     */
    clearToolHooks(): void;
    /**
     * Clear all agent lifecycle hooks.
     */
    clearAgentHooks(): void;
    /**
     * Get hook statistics.
     */
    getStats(): {
        llm: {
            before: number;
            after: number;
        };
        tool: {
            before: number;
            after: number;
        };
        agent: {
            pre: number;
            post: number;
        };
        total: number;
    };
    /**
     * Check if hook matches agent filters.
     */
    private matchesFilters;
    /**
     * Check if hook matches tool filters.
     */
    private matchesToolFilters;
    /**
     * Sort hooks by priority (higher priority = earlier execution).
     */
    private sortByPriority;
}
/**
 * Global hook manager instance.
 *
 * @example
 * import { hookManager } from '@gerts/core';
 *
 * // Register hooks
 * hookManager.registerBeforeLLMHook(myHook);
 *
 * // Get hooks for execution
 * const hooks = hookManager.getBeforeLLMHooks({ agent: myAgent });
 */
export declare const hookManager: HookManager;
//# sourceMappingURL=manager.d.ts.map