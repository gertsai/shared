/**
 * @gerts/core - Hook Context Classes
 * Phase 19: Hooks & Lifecycle
 *
 * Context objects passed to hooks for LLM and Tool operations.
 * From CrewAI pattern: Mutable contexts with human input support.
 */
import type { LLMMessage, LLMTool } from '../llm/types';
import type { LLMCallHookContext as ILLMCallHookContext, ToolCallHookContext as IToolCallHookContext } from './types';
/** Options for creating LLMCallContext */
export interface LLMCallContextOptions {
    /** Executor reference */
    executor?: unknown;
    /** Messages to send to LLM (mutable) */
    messages: LLMMessage[];
    /** LLM instance */
    llm: unknown;
    /** Current iteration count */
    iterations?: number;
    /** Agent reference */
    agent?: unknown;
    /** Task reference */
    task?: unknown;
    /** Workflow reference */
    workflow?: unknown;
    /** Response (for after hooks) */
    response?: string;
    /** Available tools */
    tools?: LLMTool[];
    /** Custom human input handler */
    humanInputHandler?: (prompt: string, defaultMessage?: string) => Promise<string>;
}
/**
 * Context passed to LLM hooks.
 *
 * From CrewAI pattern: Mutable messages list, human input support.
 *
 * @example
 * const context = new LLMCallContext({
 *   messages: [{ role: 'user', content: 'Hello' }],
 *   llm: myLLM,
 *   agent: myAgent,
 * });
 *
 * // Modify messages in pre-hook
 * context.messages.push({ role: 'system', content: 'Extra instruction' });
 *
 * // Request human input
 * const approval = await context.requestHumanInput('Continue?');
 */
export declare class LLMCallContext implements ILLMCallHookContext {
    /** Executor reference */
    readonly executor: unknown | null;
    /** Messages to send to LLM (mutable - modify in-place) */
    messages: LLMMessage[];
    /** LLM instance */
    readonly llm: unknown;
    /** Current iteration count */
    iterations: number;
    /** Agent reference */
    readonly agent: unknown | null;
    /** Task reference */
    readonly task: unknown | null;
    /** Workflow reference */
    readonly workflow: unknown | null;
    /** Response (only in after hooks) */
    response?: string;
    /** Available tools */
    readonly tools?: LLMTool[];
    /** Custom human input handler */
    private readonly humanInputHandler?;
    constructor(options: LLMCallContextOptions);
    /**
     * Request human input during hook execution.
     *
     * From CrewAI pattern: Approval gates for LLM calls.
     *
     * @param prompt - Prompt to display to user
     * @param defaultMessage - Default message shown with input
     * @returns User's input
     *
     * @example
     * async function approvalHook(context: LLMCallContext): Promise<boolean | null> {
     *   const approval = await context.requestHumanInput(
     *     'This operation costs $5. Continue?',
     *     'Press Enter to continue, or type "no" to cancel:'
     *   );
     *   if (approval.toLowerCase() === 'no') {
     *     return false; // Block execution
     *   }
     *   return null; // Continue
     * }
     */
    requestHumanInput(prompt: string, defaultMessage?: string): Promise<string>;
    /**
     * Create a copy of this context for background execution.
     */
    clone(): LLMCallContext;
}
/** Options for creating ToolCallContext */
export interface ToolCallContextOptions {
    /** Tool name */
    toolName: string;
    /** Tool input arguments (mutable) */
    toolInput: Record<string, unknown>;
    /** Tool reference */
    tool: unknown;
    /** Agent reference */
    agent?: unknown;
    /** Task reference */
    task?: unknown;
    /** Workflow reference */
    workflow?: unknown;
    /** Tool result (for after hooks) */
    toolResult?: string;
    /** Custom human input handler */
    humanInputHandler?: (prompt: string, defaultMessage?: string) => Promise<string>;
}
/**
 * Context passed to tool hooks.
 *
 * From CrewAI pattern: Mutable toolInput dict.
 *
 * @example
 * const context = new ToolCallContext({
 *   toolName: 'search',
 *   toolInput: { query: 'hello world' },
 *   tool: searchTool,
 * });
 *
 * // Modify input in pre-hook
 * context.toolInput.query = context.toolInput.query + ' site:example.com';
 *
 * // Request approval
 * const approval = await context.requestHumanInput('Execute search?');
 */
export declare class ToolCallContext implements IToolCallHookContext {
    /** Tool name */
    readonly toolName: string;
    /** Tool input arguments (mutable - modify in-place) */
    toolInput: Record<string, unknown>;
    /** Tool reference */
    readonly tool: unknown;
    /** Agent reference */
    readonly agent: unknown | null;
    /** Task reference */
    readonly task: unknown | null;
    /** Workflow reference */
    readonly workflow: unknown | null;
    /** Tool result (only in after hooks) */
    toolResult?: string;
    /** Custom human input handler */
    private readonly humanInputHandler?;
    constructor(options: ToolCallContextOptions);
    /**
     * Request human input for tool approval.
     *
     * From CrewAI pattern: Approval gates for dangerous operations.
     *
     * @param prompt - Prompt to display to user
     * @param defaultMessage - Default message shown with input
     * @returns User's input
     *
     * @example
     * async function approvalHook(context: ToolCallContext): Promise<boolean | null> {
     *   if (context.toolName === 'delete') {
     *     const approval = await context.requestHumanInput(
     *       `Delete ${context.toolInput.file}?`,
     *       'Type "yes" to confirm, or press Enter to cancel:'
     *     );
     *     if (approval !== 'yes') {
     *       return false; // Block execution
     *     }
     *   }
     *   return null; // Continue
     * }
     */
    requestHumanInput(prompt: string, defaultMessage?: string): Promise<string>;
    /**
     * Create a copy of this context for background execution.
     */
    clone(): ToolCallContext;
}
/**
 * Factory for creating hook contexts.
 */
export declare const HookContextFactory: {
    /**
     * Create LLM call context.
     */
    createLLMContext(options: LLMCallContextOptions): LLMCallContext;
    /**
     * Create tool call context.
     */
    createToolContext(options: ToolCallContextOptions): ToolCallContext;
};
//# sourceMappingURL=context.d.ts.map