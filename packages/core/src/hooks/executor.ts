/**
 * @gertsai/core - Hook Executor
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

import type {
  PreHook,
  PostHook,
  PreHookParams,
  PostHookParams,
  ToolPreHook,
  ToolPostHook,
  FunctionCall,
  HookMetadata,
  HookExecutorConfig,
  HookExecutionEvent,
  Guardrail,
  Evaluator,
  HookLike,
} from './types';
import { RunEvent } from './types';
import type { LLMCallContext, ToolCallContext } from './context';
import { hookManager } from './manager';
import { SimpleEventBus, type EventBus } from '../event-bus';

// ============================================================================
// Hook Metadata Helpers
// ============================================================================

/** Symbol for storing hook metadata */
const HOOK_METADATA_KEY = Symbol('gertsHookMetadata');

/**
 * Get hook metadata from a function.
 */
export function getHookMetadata(hook: Function): HookMetadata | undefined {
  return (hook as any)[HOOK_METADATA_KEY];
}

/**
 * Set hook metadata on a function.
 */
export function setHookMetadata(hook: Function, metadata: HookMetadata): void {
  Object.defineProperty(hook, HOOK_METADATA_KEY, {
    value: metadata,
    writable: false,
    enumerable: false,
  });
}

/**
 * Check if a hook should run in background.
 */
export function shouldRunInBackground(hook: Function): boolean {
  return getHookMetadata(hook)?.runInBackground === true;
}

/**
 * Decide whether a given hook should be queued to the background queue
 * (Wave 12.D-fix per FR-023 / L-7).
 *
 * Rule: a hook tagged `blocking: true` ALWAYS runs synchronously, even if
 * the workflow-level `runInBackground` flag is true. Otherwise either the
 * hook's own `runInBackground` opt-in OR the workflow flag will queue it.
 */
export function shouldUseBackground(
  hook: Function,
  workflowRunInBackground: boolean,
): boolean {
  const meta = getHookMetadata(hook);
  if (meta?.blocking === true) return false;
  return meta?.runInBackground === true || workflowRunInBackground === true;
}

/**
 * Get hook priority (for execution ordering).
 */
export function getHookPriority(hook: Function): number {
  return getHookMetadata(hook)?.priority ?? 0;
}

/**
 * Get hook name.
 */
export function getHookName(hook: Function): string {
  return getHookMetadata(hook)?.name ?? hook.name ?? 'anonymous';
}

// ============================================================================
// Deep Copy for Background Hooks
// ============================================================================

/** Keys that should be deep copied for background hooks */
const COPY_KEYS = new Set([
  'runInput',
  'runContext',
  'runOutput',
  'sessionState',
  'dependencies',
  'metadata',
]);

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
export function copyArgsForBackground<T extends Record<string, unknown>>(
  args: T
): T {
  const copied: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (COPY_KEYS.has(key) && value != null) {
      copied[key] = deepCloneValue(value);
    } else {
      // Shallow copy for other keys (e.g., agent, session - references)
      copied[key] = value;
    }
  }

  return copied as T;
}

/**
 * Deep clone a value using `structuredClone` (Node 17+, guaranteed on
 * Node ≥22 per `engines.node`). Preserves Date, Map, Set, ArrayBuffer,
 * typed arrays, and cyclic refs — unlike the old JSON.parse(JSON.stringify(...))
 * which corrupted Dates and threw on cycles.
 *
 * Falls back to shallow copy if structuredClone throws (functions, DOM
 * nodes, class instances with non-cloneable members).
 *
 * Wave 12.D-fix per FR-023 / L-7.
 */
function deepCloneValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    if (Array.isArray(value)) return [...value];
    if (value !== null && typeof value === 'object') return { ...value };
    return value;
  }
}

// ============================================================================
// Background Queue
// ============================================================================

/**
 * Simple background queue for async hook execution.
 * Similar to p-queue but simpler and dependency-free.
 */
class BackgroundQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private readonly concurrency: number;
  private readonly timeout: number;
  /**
   * Deferred resolved when the queue is empty AND no tasks are running.
   * Replaces the old `setTimeout(check, 10)` polling loop (Wave 12.D-fix
   * per FR-023 / L-7). If a new task is enqueued before drain resolves,
   * the deferred stays pending and resolves the next time the queue
   * goes idle.
   */
  private drainDeferred: { promise: Promise<void>; resolve: () => void } | null = null;

  constructor(options?: { concurrency?: number; timeout?: number }) {
    this.concurrency = options?.concurrency ?? 10;
    this.timeout = options?.timeout ?? 30000; // 30s default
  }

  /**
   * Add a task to the queue.
   */
  add(task: () => Promise<void>): void {
    this.queue.push(task);
    this.processQueue();
  }

  /**
   * Process the queue.
   */
  private async processQueue(): Promise<void> {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.running++;

      // Execute with timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Hook timeout')), this.timeout);
      });

      Promise.race([task(), timeoutPromise])
        .catch((error) => {
          console.error('Background hook error:', error);
        })
        .finally(() => {
          this.running--;
          this.processQueue();
          this.maybeResolveDrain();
        });
    }
  }

  /**
   * Resolve a pending `drain()` deferred if the queue is fully idle.
   */
  private maybeResolveDrain(): void {
    if (this.drainDeferred && this.queue.length === 0 && this.running === 0) {
      this.drainDeferred.resolve();
      this.drainDeferred = null;
    }
  }

  /**
   * Get queue length.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Get number of running tasks.
   */
  get activeCount(): number {
    return this.running;
  }

  /**
   * Wait for all tasks to complete (Deferred-based — no polling).
   */
  drain(): Promise<void> {
    if (this.queue.length === 0 && this.running === 0) {
      return Promise.resolve();
    }
    if (!this.drainDeferred) {
      let resolveRef!: () => void;
      const promise = new Promise<void>((res) => {
        resolveRef = res;
      });
      this.drainDeferred = { promise, resolve: resolveRef };
    }
    return this.drainDeferred.promise;
  }
}

// ============================================================================
// Hook Executor
// ============================================================================

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
export class HookExecutor {
  private backgroundQueue: BackgroundQueue;
  private eventBus: EventBus;

  constructor(config?: HookExecutorConfig) {
    this.backgroundQueue = new BackgroundQueue({
      concurrency: config?.backgroundConcurrency ?? 10,
      timeout: config?.backgroundTimeout ?? 30000,
    });
    this.eventBus = new SimpleEventBus();
  }

  /**
   * Set event bus for hook events.
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  // ============================================================================
  // Pre-Hook Execution
  // ============================================================================

  /**
   * Execute pre-hooks with optional background execution.
   *
   * @param hooks - List of pre-hooks to execute
   * @param params - Hook parameters
   * @param runInBackground - Global background flag (from workflow config)
   *
   * @throws InputCheckError if a hook blocks execution
   */
  async executePreHooks(
    hooks: PreHook[],
    params: PreHookParams,
    runInBackground: boolean = false
  ): Promise<void> {
    // Sort by priority (higher = earlier)
    const sorted = this.sortByPriority(hooks);

    for (const hook of sorted) {
      const shouldRunInBg = shouldUseBackground(hook, runInBackground);
      const hookName = getHookName(hook);

      // Emit start event
      this.emitHookEvent(RunEvent.PRE_HOOK_STARTED, hookName, 'pre', shouldRunInBg);

      if (shouldRunInBg) {
        // Deep copy for background execution
        const copied = copyArgsForBackground(params);
        this.backgroundQueue.add(async () => {
          const startTime = Date.now();
          try {
            await hook(copied);
            this.emitHookEvent(
              RunEvent.PRE_HOOK_COMPLETED,
              hookName,
              'pre',
              true,
              Date.now() - startTime
            );
          } catch (error) {
            this.emitHookEvent(
              RunEvent.PRE_HOOK_ERROR,
              hookName,
              'pre',
              true,
              Date.now() - startTime,
              String(error)
            );
          }
        });
      } else {
        // Blocking execution
        const startTime = Date.now();
        try {
          await hook(params);
          this.emitHookEvent(
            RunEvent.PRE_HOOK_COMPLETED,
            hookName,
            'pre',
            false,
            Date.now() - startTime
          );
        } catch (error) {
          this.emitHookEvent(
            RunEvent.PRE_HOOK_ERROR,
            hookName,
            'pre',
            false,
            Date.now() - startTime,
            String(error)
          );
          throw error; // Pre-hooks can block
        }
      }
    }
  }

  // ============================================================================
  // Post-Hook Execution
  // ============================================================================

  /**
   * Execute post-hooks with optional background execution.
   *
   * @param hooks - List of post-hooks to execute
   * @param params - Hook parameters
   * @param runInBackground - Global background flag
   */
  async executePostHooks(
    hooks: PostHook[],
    params: PostHookParams,
    runInBackground: boolean = false
  ): Promise<void> {
    const sorted = this.sortByPriority(hooks);

    for (const hook of sorted) {
      const shouldRunInBg = shouldUseBackground(hook, runInBackground);
      const hookName = getHookName(hook);

      this.emitHookEvent(RunEvent.POST_HOOK_STARTED, hookName, 'post', shouldRunInBg);

      if (shouldRunInBg) {
        const copied = copyArgsForBackground(params);
        this.backgroundQueue.add(async () => {
          const startTime = Date.now();
          try {
            await hook(copied);
            this.emitHookEvent(
              RunEvent.POST_HOOK_COMPLETED,
              hookName,
              'post',
              true,
              Date.now() - startTime
            );
          } catch (error) {
            this.emitHookEvent(
              RunEvent.POST_HOOK_ERROR,
              hookName,
              'post',
              true,
              Date.now() - startTime,
              String(error)
            );
          }
        });
      } else {
        const startTime = Date.now();
        try {
          await hook(params);
          this.emitHookEvent(
            RunEvent.POST_HOOK_COMPLETED,
            hookName,
            'post',
            false,
            Date.now() - startTime
          );
        } catch (error) {
          this.emitHookEvent(
            RunEvent.POST_HOOK_ERROR,
            hookName,
            'post',
            false,
            Date.now() - startTime,
            String(error)
          );
          // Post-hooks log errors but don't block
          console.error(`Post-hook ${hookName} failed:`, error);
        }
      }
    }
  }

  // ============================================================================
  // LLM Hook Execution
  // ============================================================================

  /**
   * Execute before LLM call hooks.
   *
   * @param context - LLM call context
   * @returns false if any hook blocks execution, null otherwise
   */
  async executeBeforeLLMHooks(context: LLMCallContext): Promise<boolean> {
    const agent = context.agent as { name?: string; role?: string } | undefined;
    const hooks = hookManager.getBeforeLLMHooks({
      ...(agent !== undefined && { agent }),
    });

    for (const hook of hooks) {
      try {
        const result = await hook(context);
        if (result === false) {
          return false; // Block execution
        }
      } catch (error) {
        console.error('Before LLM hook error:', error);
        throw error;
      }
    }

    return true; // Continue execution
  }

  /**
   * Execute after LLM call hooks.
   *
   * @param context - LLM call context (with response)
   * @returns Modified response or null
   */
  async executeAfterLLMHooks(context: LLMCallContext): Promise<string | null> {
    const agent = context.agent as { name?: string; role?: string } | undefined;
    const hooks = hookManager.getAfterLLMHooks({
      ...(agent !== undefined && { agent }),
    });

    let modifiedResponse: string | null = null;

    for (const hook of hooks) {
      try {
        const result = await hook(context);
        if (result !== null) {
          modifiedResponse = result;
          context.response = result; // Update context for next hook
        }
      } catch (error) {
        console.error('After LLM hook error:', error);
        // Don't block, just log
      }
    }

    return modifiedResponse;
  }

  // ============================================================================
  // Tool Hook Execution
  // ============================================================================

  /**
   * Execute before tool call hooks.
   *
   * @param context - Tool call context
   * @returns false if any hook blocks execution
   */
  async executeBeforeToolHooks(context: ToolCallContext): Promise<boolean> {
    const agent = context.agent as { name?: string; role?: string } | undefined;
    const hooks = hookManager.getBeforeToolHooks({
      toolName: context.toolName,
      ...(agent !== undefined && { agent }),
    });

    for (const hook of hooks) {
      try {
        const result = await hook(context);
        if (result === false) {
          return false; // Block execution
        }
      } catch (error) {
        console.error('Before tool hook error:', error);
        throw error;
      }
    }

    return true;
  }

  /**
   * Execute after tool call hooks.
   *
   * @param context - Tool call context (with result)
   * @returns Modified result or null
   */
  async executeAfterToolHooks(context: ToolCallContext): Promise<string | null> {
    const agent = context.agent as { name?: string; role?: string } | undefined;
    const hooks = hookManager.getAfterToolHooks({
      toolName: context.toolName,
      ...(agent !== undefined && { agent }),
    });

    let modifiedResult: string | null = null;

    for (const hook of hooks) {
      try {
        const result = await hook(context);
        if (result !== null) {
          modifiedResult = result;
          context.toolResult = result;
        }
      } catch (error) {
        console.error('After tool hook error:', error);
      }
    }

    return modifiedResult;
  }

  // ============================================================================
  // Function Call Hook Execution
  // ============================================================================

  /**
   * Execute tool pre-hooks for a function call.
   *
   * @param hooks - Tool pre-hooks
   * @param fc - Function call
   * @returns false if blocked
   */
  async executeToolPreHooks(
    hooks: ToolPreHook[],
    fc: FunctionCall
  ): Promise<boolean> {
    for (const hook of hooks) {
      try {
        const result = await hook(fc);
        if (result === false) {
          return false;
        }
      } catch (error) {
        console.error('Tool pre-hook error:', error);
        throw error;
      }
    }
    return true;
  }

  /**
   * Execute tool post-hooks for a function call.
   *
   * @param hooks - Tool post-hooks
   * @param fc - Function call (with result)
   * @returns Modified result or null
   */
  async executeToolPostHooks(
    hooks: ToolPostHook[],
    fc: FunctionCall
  ): Promise<string | null> {
    let modifiedResult: string | null = null;

    for (const hook of hooks) {
      try {
        const result = await hook(fc);
        if (result !== null) {
          modifiedResult = result;
          fc.result = result;
        }
      } catch (error) {
        console.error('Tool post-hook error:', error);
      }
    }

    return modifiedResult;
  }

  // ============================================================================
  // Hook Normalization
  // ============================================================================

  /**
   * Normalize hooks (convert guardrails/evals to callables).
   *
   * @param hooks - Mixed array of hooks, guardrails, evaluators
   * @param type - Hook type (pre/post)
   * @returns Normalized hook functions
   */
  normalizeHooks(
    hooks: HookLike[] | undefined,
    type: 'pre' | 'post'
  ): (PreHook | PostHook)[] {
    if (!hooks) return [];

    return hooks.map((hook) => {
      if (typeof hook === 'function') {
        return hook as PreHook | PostHook;
      }

      // Guardrail
      if ('check' in hook && typeof (hook as Guardrail).check === 'function') {
        return (hook as Guardrail).check.bind(hook);
      }

      // Evaluator
      const evaluator = hook as Evaluator;
      if (type === 'pre' && evaluator.preCheck) {
        return evaluator.preCheck.bind(evaluator);
      }
      if (type === 'post' && evaluator.postCheck) {
        return evaluator.postCheck.bind(evaluator);
      }

      // No matching method, return no-op
      return () => {};
    });
  }

  // ============================================================================
  // Background Queue Management
  // ============================================================================

  /**
   * Wait for all background hooks to complete.
   */
  async waitForBackground(): Promise<void> {
    await this.backgroundQueue.drain();
  }

  /**
   * Get background queue statistics.
   */
  getBackgroundStats(): { queued: number; running: number } {
    return {
      queued: this.backgroundQueue.length,
      running: this.backgroundQueue.activeCount,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Sort hooks by priority (higher priority = earlier execution).
   */
  private sortByPriority<T extends Function>(hooks: T[]): T[] {
    return [...hooks].sort((a, b) => {
      const priorityA = getHookPriority(a);
      const priorityB = getHookPriority(b);
      return priorityB - priorityA; // Descending order
    });
  }

  /**
   * Emit hook execution event.
   */
  private emitHookEvent(
    eventType: RunEvent,
    hookName: string,
    hookType: 'pre' | 'post',
    isBackground: boolean,
    durationMs?: number,
    error?: string
  ): void {
    const event: HookExecutionEvent = {
      type: eventType,
      timestamp: new Date(),
      hookName,
      hookType,
      isBackground,
      ...(durationMs !== undefined && { durationMs }),
      ...(error !== undefined && { error }),
    };

    this.eventBus.emit(eventType, event);
  }
}

// ============================================================================
// Default Executor
// ============================================================================

/**
 * Default hook executor instance.
 */
export const hookExecutor = new HookExecutor();
