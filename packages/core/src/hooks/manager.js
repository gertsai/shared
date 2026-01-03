"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.hookManager = exports.HookManager = void 0;
// ============================================================================
// Hook Manager
// ============================================================================
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
class HookManager {
    static instance = null;
    // LLM hooks
    beforeLLMHooks = [];
    afterLLMHooks = [];
    // Tool hooks
    beforeToolHooks = [];
    afterToolHooks = [];
    // Agent lifecycle hooks (pre/post)
    agentPreHooks = [];
    agentPostHooks = [];
    constructor() { }
    /**
     * Get singleton instance.
     */
    static getInstance() {
        if (!HookManager.instance) {
            HookManager.instance = new HookManager();
        }
        return HookManager.instance;
    }
    /**
     * Reset singleton (for testing).
     */
    static resetInstance() {
        HookManager.instance = null;
    }
    // ============================================================================
    // LLM Hook Registration
    // ============================================================================
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
    registerBeforeLLMHook(hook, filters, priority = 0) {
        this.beforeLLMHooks.push({ hook, filters, priority });
        this.sortByPriority(this.beforeLLMHooks);
    }
    /**
     * Register an after LLM call hook.
     *
     * @param hook - Hook function
     * @param filters - Optional filters (agents)
     * @param priority - Execution priority (higher = earlier)
     */
    registerAfterLLMHook(hook, filters, priority = 0) {
        this.afterLLMHooks.push({ hook, filters, priority });
        this.sortByPriority(this.afterLLMHooks);
    }
    /**
     * Unregister a before LLM hook.
     */
    unregisterBeforeLLMHook(hook) {
        this.beforeLLMHooks = this.beforeLLMHooks.filter((h) => h.hook !== hook);
    }
    /**
     * Unregister an after LLM hook.
     */
    unregisterAfterLLMHook(hook) {
        this.afterLLMHooks = this.afterLLMHooks.filter((h) => h.hook !== hook);
    }
    /**
     * Get before LLM hooks matching context.
     *
     * @param context - Filter context
     * @returns Matching hooks in priority order
     */
    getBeforeLLMHooks(context) {
        return this.beforeLLMHooks
            .filter(({ filters }) => this.matchesFilters(filters, context))
            .map(({ hook }) => hook);
    }
    /**
     * Get after LLM hooks matching context.
     */
    getAfterLLMHooks(context) {
        return this.afterLLMHooks
            .filter(({ filters }) => this.matchesFilters(filters, context))
            .map(({ hook }) => hook);
    }
    // ============================================================================
    // Tool Hook Registration
    // ============================================================================
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
    registerBeforeToolHook(hook, filters, priority = 0) {
        this.beforeToolHooks.push({ hook, filters, priority });
        this.sortByPriority(this.beforeToolHooks);
    }
    /**
     * Register an after tool call hook.
     */
    registerAfterToolHook(hook, filters, priority = 0) {
        this.afterToolHooks.push({ hook, filters, priority });
        this.sortByPriority(this.afterToolHooks);
    }
    /**
     * Unregister a before tool hook.
     */
    unregisterBeforeToolHook(hook) {
        this.beforeToolHooks = this.beforeToolHooks.filter((h) => h.hook !== hook);
    }
    /**
     * Unregister an after tool hook.
     */
    unregisterAfterToolHook(hook) {
        this.afterToolHooks = this.afterToolHooks.filter((h) => h.hook !== hook);
    }
    /**
     * Get before tool hooks matching context.
     */
    getBeforeToolHooks(context) {
        return this.beforeToolHooks
            .filter(({ filters }) => this.matchesToolFilters(filters, context))
            .map(({ hook }) => hook);
    }
    /**
     * Get after tool hooks matching context.
     */
    getAfterToolHooks(context) {
        return this.afterToolHooks
            .filter(({ filters }) => this.matchesToolFilters(filters, context))
            .map(({ hook }) => hook);
    }
    // ============================================================================
    // Agent Lifecycle Hook Registration
    // ============================================================================
    /**
     * Register a global pre-hook for agents.
     *
     * @param hook - Hook function
     * @param filters - Optional filters (agents)
     * @param options - Hook options
     */
    registerAgentPreHook(hook, filters, options) {
        this.agentPreHooks.push({
            hook,
            filters,
            priority: options?.priority ?? 0,
            runInBackground: options?.runInBackground ?? false,
        });
        this.sortByPriority(this.agentPreHooks);
    }
    /**
     * Register a global post-hook for agents.
     */
    registerAgentPostHook(hook, filters, options) {
        this.agentPostHooks.push({
            hook,
            filters,
            priority: options?.priority ?? 0,
            runInBackground: options?.runInBackground ?? false,
        });
        this.sortByPriority(this.agentPostHooks);
    }
    /**
     * Get agent pre-hooks matching context.
     */
    getAgentPreHooks(context) {
        return this.agentPreHooks
            .filter(({ filters }) => this.matchesFilters(filters, context))
            .map(({ hook, runInBackground }) => ({ hook: hook, runInBackground }));
    }
    /**
     * Get agent post-hooks matching context.
     */
    getAgentPostHooks(context) {
        return this.agentPostHooks
            .filter(({ filters }) => this.matchesFilters(filters, context))
            .map(({ hook, runInBackground }) => ({ hook: hook, runInBackground }));
    }
    // ============================================================================
    // Clear Methods
    // ============================================================================
    /**
     * Clear all registered hooks.
     */
    clearAllHooks() {
        this.beforeLLMHooks = [];
        this.afterLLMHooks = [];
        this.beforeToolHooks = [];
        this.afterToolHooks = [];
        this.agentPreHooks = [];
        this.agentPostHooks = [];
    }
    /**
     * Clear all LLM hooks.
     */
    clearLLMHooks() {
        this.beforeLLMHooks = [];
        this.afterLLMHooks = [];
    }
    /**
     * Clear all tool hooks.
     */
    clearToolHooks() {
        this.beforeToolHooks = [];
        this.afterToolHooks = [];
    }
    /**
     * Clear all agent lifecycle hooks.
     */
    clearAgentHooks() {
        this.agentPreHooks = [];
        this.agentPostHooks = [];
    }
    // ============================================================================
    // Statistics
    // ============================================================================
    /**
     * Get hook statistics.
     */
    getStats() {
        return {
            llm: {
                before: this.beforeLLMHooks.length,
                after: this.afterLLMHooks.length,
            },
            tool: {
                before: this.beforeToolHooks.length,
                after: this.afterToolHooks.length,
            },
            agent: {
                pre: this.agentPreHooks.length,
                post: this.agentPostHooks.length,
            },
            total: this.beforeLLMHooks.length +
                this.afterLLMHooks.length +
                this.beforeToolHooks.length +
                this.afterToolHooks.length +
                this.agentPreHooks.length +
                this.agentPostHooks.length,
        };
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    /**
     * Check if hook matches agent filters.
     */
    matchesFilters(filters, context) {
        if (!filters)
            return true;
        // Agent filter
        if (filters.agents && context.agent) {
            const agentIdentifier = context.agent.role || context.agent.name;
            if (agentIdentifier && !filters.agents.includes(agentIdentifier)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Check if hook matches tool filters.
     */
    matchesToolFilters(filters, context) {
        if (!filters)
            return true;
        // Tool filter
        if (filters.tools && context.toolName) {
            if (!filters.tools.includes(context.toolName)) {
                return false;
            }
        }
        // Agent filter
        if (filters.agents && context.agent) {
            const agentIdentifier = context.agent.role || context.agent.name;
            if (agentIdentifier && !filters.agents.includes(agentIdentifier)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Sort hooks by priority (higher priority = earlier execution).
     */
    sortByPriority(hooks) {
        hooks.sort((a, b) => b.priority - a.priority);
    }
}
exports.HookManager = HookManager;
// ============================================================================
// Singleton Export
// ============================================================================
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
exports.hookManager = HookManager.getInstance();
//# sourceMappingURL=manager.js.map