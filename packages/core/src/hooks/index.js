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
export { 
// Errors
CheckTrigger, InputCheckError, OutputCheckError, 
// Events
RunEvent, 
// Constants
BACKGROUND_HOOK_COPY_KEYS, } from './types';
// ============================================================================
// Context Classes
// ============================================================================
export { 
// Context classes
LLMCallContext, ToolCallContext, 
// Factory
HookContextFactory, } from './context';
// ============================================================================
// Hook Manager
// ============================================================================
export { HookManager, hookManager, } from './manager';
// ============================================================================
// Hook Executor
// ============================================================================
export { HookExecutor, hookExecutor, 
// Metadata helpers
getHookMetadata, setHookMetadata, shouldRunInBackground, getHookPriority, getHookName, 
// Deep copy
copyArgsForBackground, } from './executor';
// ============================================================================
// Decorators
// ============================================================================
export { 
// Function decorators
hook, createHook, beforeLLMCall, afterLLMCall, createBeforeLLMHook, createAfterLLMHook, beforeToolCall, afterToolCall, createBeforeToolHook, createAfterToolHook, 
// Convenience functions
blockingHook, backgroundHook, priorityHook, 
// Method decorators (for classes)
Hook, BeforeLLMCall, AfterLLMCall, BeforeToolCall, AfterToolCall, } from './decorators';
