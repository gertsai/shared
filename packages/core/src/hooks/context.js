/**
 * @gerts/core - Hook Context Classes
 * Phase 19: Hooks & Lifecycle
 *
 * Context objects passed to hooks for LLM and Tool operations.
 * From CrewAI pattern: Mutable contexts with human input support.
 */
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
export class LLMCallContext {
    /** Executor reference */
    executor;
    /** Messages to send to LLM (mutable - modify in-place) */
    messages;
    /** LLM instance */
    llm;
    /** Current iteration count */
    iterations;
    /** Agent reference */
    agent;
    /** Task reference */
    task;
    /** Workflow reference */
    workflow;
    /** Response (only in after hooks) */
    response;
    /** Available tools */
    tools;
    /** Custom human input handler */
    humanInputHandler;
    constructor(options) {
        this.executor = options.executor ?? null;
        this.messages = options.messages;
        this.llm = options.llm;
        this.iterations = options.iterations ?? 0;
        this.agent = options.agent ?? null;
        this.task = options.task ?? null;
        this.workflow = options.workflow ?? null;
        this.response = options.response;
        this.tools = options.tools;
        this.humanInputHandler = options.humanInputHandler;
    }
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
    async requestHumanInput(prompt, defaultMessage = 'Press Enter to continue, or provide feedback:') {
        // Use custom handler if provided
        if (this.humanInputHandler) {
            return this.humanInputHandler(prompt, defaultMessage);
        }
        // Default implementation using readline (Node.js environment)
        // In browser or other environments, this should be overridden
        if (typeof process !== 'undefined' && process.stdin && process.stdout) {
            const readline = await import('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            console.log(`\n${prompt}`);
            console.log(defaultMessage);
            return new Promise((resolve) => {
                rl.question('> ', (answer) => {
                    rl.close();
                    resolve(answer);
                });
            });
        }
        // Fallback: return empty string (auto-approve)
        console.warn('Human input not available in this environment');
        return '';
    }
    /**
     * Create a copy of this context for background execution.
     */
    clone() {
        return new LLMCallContext({
            executor: this.executor,
            messages: [...this.messages],
            llm: this.llm,
            iterations: this.iterations,
            agent: this.agent,
            task: this.task,
            workflow: this.workflow,
            response: this.response,
            tools: this.tools ? [...this.tools] : undefined,
            humanInputHandler: this.humanInputHandler,
        });
    }
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
export class ToolCallContext {
    /** Tool name */
    toolName;
    /** Tool input arguments (mutable - modify in-place) */
    toolInput;
    /** Tool reference */
    tool;
    /** Agent reference */
    agent;
    /** Task reference */
    task;
    /** Workflow reference */
    workflow;
    /** Tool result (only in after hooks) */
    toolResult;
    /** Custom human input handler */
    humanInputHandler;
    constructor(options) {
        this.toolName = options.toolName;
        this.toolInput = options.toolInput;
        this.tool = options.tool;
        this.agent = options.agent ?? null;
        this.task = options.task ?? null;
        this.workflow = options.workflow ?? null;
        this.toolResult = options.toolResult;
        this.humanInputHandler = options.humanInputHandler;
    }
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
    async requestHumanInput(prompt, defaultMessage = 'Press Enter to continue, or provide feedback:') {
        // Use custom handler if provided
        if (this.humanInputHandler) {
            return this.humanInputHandler(prompt, defaultMessage);
        }
        // Default implementation using readline (Node.js environment)
        if (typeof process !== 'undefined' && process.stdin && process.stdout) {
            const readline = await import('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            console.log(`\n${prompt}`);
            console.log(defaultMessage);
            return new Promise((resolve) => {
                rl.question('> ', (answer) => {
                    rl.close();
                    resolve(answer);
                });
            });
        }
        // Fallback: return empty string (auto-approve)
        console.warn('Human input not available in this environment');
        return '';
    }
    /**
     * Create a copy of this context for background execution.
     */
    clone() {
        return new ToolCallContext({
            toolName: this.toolName,
            toolInput: { ...this.toolInput },
            tool: this.tool,
            agent: this.agent,
            task: this.task,
            workflow: this.workflow,
            toolResult: this.toolResult,
            humanInputHandler: this.humanInputHandler,
        });
    }
}
// ============================================================================
// Context Factory
// ============================================================================
/**
 * Factory for creating hook contexts.
 */
export const HookContextFactory = {
    /**
     * Create LLM call context.
     */
    createLLMContext(options) {
        return new LLMCallContext(options);
    },
    /**
     * Create tool call context.
     */
    createToolContext(options) {
        return new ToolCallContext(options);
    },
};
