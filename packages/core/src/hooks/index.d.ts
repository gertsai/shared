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
export type { RunInput, ImageInput, VideoInput, AudioInput, FileInput, RunContext, FilterExpr, RunStatus, RunMetrics, ToolExecution, ReasoningStep, RunOutput, FunctionCall, PreHookParams, PostHookParams, PreHook, PostHook, ToolPreHook, ToolPostHook, BeforeLLMHook, AfterLLMHook, BeforeToolHook, AfterToolHook, LLMCallHookContext, ToolCallHookContext, Guardrail, Evaluator, HookLike, HookMetadata, HookFilters, BeforeKickoffCallback, AfterKickoffCallback, StepCallback, TaskCallback, StepInfo, TaskOutput, HookEvent, HookExecutionEvent, HookExecutorConfig, } from './types';
export { CheckTrigger, InputCheckError, OutputCheckError, RunEvent, BACKGROUND_HOOK_COPY_KEYS, } from './types';
export { LLMCallContext, ToolCallContext, type LLMCallContextOptions, type ToolCallContextOptions, HookContextFactory, } from './context';
export { HookManager, hookManager, } from './manager';
export { HookExecutor, hookExecutor, getHookMetadata, setHookMetadata, shouldRunInBackground, getHookPriority, getHookName, copyArgsForBackground, } from './executor';
export { hook, createHook, beforeLLMCall, afterLLMCall, createBeforeLLMHook, createAfterLLMHook, beforeToolCall, afterToolCall, createBeforeToolHook, createAfterToolHook, blockingHook, backgroundHook, priorityHook, Hook, BeforeLLMCall, AfterLLMCall, BeforeToolCall, AfterToolCall, type HookDecoratorOptions, type LLMHookDecoratorOptions, type ToolHookDecoratorOptions, } from './decorators';
//# sourceMappingURL=index.d.ts.map