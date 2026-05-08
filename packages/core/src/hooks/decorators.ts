/**
 * @gertsai/core - Hook Decorators
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

import type {
  HookMetadata,
  BeforeLLMHook,
  AfterLLMHook,
  BeforeToolHook,
  AfterToolHook,
} from './types';
import { setHookMetadata } from './executor';
import { hookManager } from './manager';

// ============================================================================
// Hook Decorator Options
// ============================================================================

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
export function hook<T extends Function>(options?: HookDecoratorOptions) {
  return function (target: T): T {
    const metadata: HookMetadata = {
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
export function createHook<T extends Function>(
  options: HookDecoratorOptions,
  fn: T
): T {
  return hook(options)(fn) as T;
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
export function beforeLLMCall(options?: LLMHookDecoratorOptions) {
  return function <T extends BeforeLLMHook>(target: T): T {
    const metadata: HookMetadata = {
      name: target.name ?? 'anonymous',
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(target, metadata);

    // Auto-register if requested
    if (options?.autoRegister !== false) {
      hookManager.registerBeforeLLMHook(
        target,
        { agents: options?.agents },
        options?.priority ?? 0
      );
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
export function afterLLMCall(options?: LLMHookDecoratorOptions) {
  return function <T extends AfterLLMHook>(target: T): T {
    const metadata: HookMetadata = {
      name: target.name ?? 'anonymous',
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(target, metadata);

    if (options?.autoRegister !== false) {
      hookManager.registerAfterLLMHook(
        target,
        { agents: options?.agents },
        options?.priority ?? 0
      );
    }

    return target;
  };
}

/**
 * Create a before LLM call hook (alternative to decorator).
 */
export function createBeforeLLMHook(
  options: LLMHookDecoratorOptions | undefined,
  fn: BeforeLLMHook
): BeforeLLMHook {
  return beforeLLMCall(options)(fn);
}

/**
 * Create an after LLM call hook (alternative to decorator).
 */
export function createAfterLLMHook(
  options: LLMHookDecoratorOptions | undefined,
  fn: AfterLLMHook
): AfterLLMHook {
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
export function beforeToolCall(options?: ToolHookDecoratorOptions) {
  return function <T extends BeforeToolHook>(target: T): T {
    const metadata: HookMetadata = {
      name: target.name ?? 'anonymous',
      filterTools: options?.tools,
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(target, metadata);

    if (options?.autoRegister !== false) {
      hookManager.registerBeforeToolHook(
        target,
        { tools: options?.tools, agents: options?.agents },
        options?.priority ?? 0
      );
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
export function afterToolCall(options?: ToolHookDecoratorOptions) {
  return function <T extends AfterToolHook>(target: T): T {
    const metadata: HookMetadata = {
      name: target.name ?? 'anonymous',
      filterTools: options?.tools,
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(target, metadata);

    if (options?.autoRegister !== false) {
      hookManager.registerAfterToolHook(
        target,
        { tools: options?.tools, agents: options?.agents },
        options?.priority ?? 0
      );
    }

    return target;
  };
}

/**
 * Create a before tool call hook (alternative to decorator).
 */
export function createBeforeToolHook(
  options: ToolHookDecoratorOptions | undefined,
  fn: BeforeToolHook
): BeforeToolHook {
  return beforeToolCall(options)(fn);
}

/**
 * Create an after tool call hook (alternative to decorator).
 */
export function createAfterToolHook(
  options: ToolHookDecoratorOptions | undefined,
  fn: AfterToolHook
): AfterToolHook {
  return afterToolCall(options)(fn);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a blocking pre-hook (runs synchronously, can throw).
 */
export function blockingHook<T extends Function>(
  fn: T,
  options?: Omit<HookDecoratorOptions, 'runInBackground'>
): T {
  return hook({ ...options, runInBackground: false })(fn) as T;
}

/**
 * Create a background hook (runs async, doesn't block).
 */
export function backgroundHook<T extends Function>(
  fn: T,
  options?: Omit<HookDecoratorOptions, 'runInBackground'>
): T {
  return hook({ ...options, runInBackground: true })(fn) as T;
}

/**
 * Create a high-priority hook (runs first).
 */
export function priorityHook<T extends Function>(
  fn: T,
  priority: number = 100
): T {
  return hook({ priority })(fn) as T;
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
export function Hook(options?: HookDecoratorOptions): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    const metadata: HookMetadata = {
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
export function BeforeLLMCall(
  options?: LLMHookDecoratorOptions
): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as BeforeLLMHook;

    const metadata: HookMetadata = {
      name: String(propertyKey),
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(originalMethod, metadata);

    if (options?.autoRegister) {
      hookManager.registerBeforeLLMHook(
        originalMethod,
        { agents: options?.agents },
        options?.priority ?? 0
      );
    }

    return descriptor;
  };
}

/**
 * Method decorator for @AfterLLMCall.
 */
export function AfterLLMCall(
  options?: LLMHookDecoratorOptions
): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as AfterLLMHook;

    const metadata: HookMetadata = {
      name: String(propertyKey),
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(originalMethod, metadata);

    if (options?.autoRegister) {
      hookManager.registerAfterLLMHook(
        originalMethod,
        { agents: options?.agents },
        options?.priority ?? 0
      );
    }

    return descriptor;
  };
}

/**
 * Method decorator for @BeforeToolCall.
 */
export function BeforeToolCall(
  options?: ToolHookDecoratorOptions
): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as BeforeToolHook;

    const metadata: HookMetadata = {
      name: String(propertyKey),
      filterTools: options?.tools,
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(originalMethod, metadata);

    if (options?.autoRegister) {
      hookManager.registerBeforeToolHook(
        originalMethod,
        { tools: options?.tools, agents: options?.agents },
        options?.priority ?? 0
      );
    }

    return descriptor;
  };
}

/**
 * Method decorator for @AfterToolCall.
 */
export function AfterToolCall(
  options?: ToolHookDecoratorOptions
): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as AfterToolHook;

    const metadata: HookMetadata = {
      name: String(propertyKey),
      filterTools: options?.tools,
      filterAgents: options?.agents,
      priority: options?.priority ?? 0,
    };

    setHookMetadata(originalMethod, metadata);

    if (options?.autoRegister) {
      hookManager.registerAfterToolHook(
        originalMethod,
        { tools: options?.tools, agents: options?.agents },
        options?.priority ?? 0
      );
    }

    return descriptor;
  };
}
