/**
 * @gertsai/core - Hooks & Lifecycle Tests
 * Phase 19: Hooks & Lifecycle
 *
 * Comprehensive tests for the hooks system covering:
 * - Hook types and errors
 * - Context classes
 * - Hook manager (registration, filtering)
 * - Hook executor (execution order, background, deep copy)
 * - Decorators
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  // Types
  CheckTrigger,
  InputCheckError,
  OutputCheckError,
  RunEvent,
  type PreHookParams,
  type PostHookParams,
  type PreHook,
  type PostHook,
  type BeforeLLMHook,
  type AfterLLMHook,
  type BeforeToolHook,
  type RunInput,
  type RunContext,
  type RunOutput,

  // Context
  LLMCallContext,
  ToolCallContext,
  HookContextFactory,

  // Manager
  HookManager,
  hookManager,

  // Executor
  HookExecutor,
  getHookMetadata,
  setHookMetadata,
  shouldRunInBackground,
  getHookPriority,
  getHookName,
  copyArgsForBackground,

  // Decorators
  hook,
  createHook,
  beforeLLMCall,
  afterLLMCall,
  beforeToolCall,
  afterToolCall,
  blockingHook,
  backgroundHook,
  priorityHook,
} from './index';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRunInput(): RunInput {
  return {
    inputContent: 'test input',
    inputContentString: () => 'test input',
    toDict: () => ({ content: 'test input' }),
  };
}

function createMockRunContext(): RunContext {
  return {
    runId: 'run-123',
    sessionId: 'session-456',
    userId: 'user-789',
    metadata: {},
    sessionState: {},
  };
}

function createMockRunOutput(): RunOutput {
  return {
    content: 'test output',
    messages: [],
    runId: 'run-123',
    sessionId: 'session-456',
    agentId: 'agent-001',
    agentName: 'TestAgent',
    status: 'completed',
  };
}

function createMockPreHookParams(): PreHookParams {
  return {
    runInput: createMockRunInput(),
    runContext: createMockRunContext(),
    agent: { name: 'TestAgent', role: 'Assistant' },
    metadata: {},
    sessionState: {},
  };
}

function createMockPostHookParams(): PostHookParams {
  return {
    runOutput: createMockRunOutput(),
    runContext: createMockRunContext(),
    agent: { name: 'TestAgent', role: 'Assistant' },
    metadata: {},
    sessionState: {},
  };
}

// ============================================================================
// Types and Errors
// ============================================================================

describe('Hook Types and Errors', () => {
  describe('CheckTrigger', () => {
    it('should have all expected trigger types', () => {
      expect(CheckTrigger.INPUT_NOT_ALLOWED).toBe('input_not_allowed');
      expect(CheckTrigger.OUTPUT_NOT_ALLOWED).toBe('output_not_allowed');
      expect(CheckTrigger.PII_DETECTED).toBe('pii_detected');
      expect(CheckTrigger.PROMPT_INJECTION).toBe('prompt_injection');
      expect(CheckTrigger.UNSAFE_CONTENT).toBe('unsafe_content');
      expect(CheckTrigger.TOOL_BLOCKED).toBe('tool_blocked');
    });
  });

  describe('InputCheckError', () => {
    it('should create error with message and trigger', () => {
      const error = new InputCheckError(
        'PII detected in input',
        CheckTrigger.PII_DETECTED
      );

      expect(error.message).toBe('PII detected in input');
      expect(error.checkTrigger).toBe(CheckTrigger.PII_DETECTED);
      expect(error.name).toBe('InputCheckError');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('OutputCheckError', () => {
    it('should create error with message and trigger', () => {
      const error = new OutputCheckError(
        'Output contains unsafe content',
        CheckTrigger.UNSAFE_CONTENT
      );

      expect(error.message).toBe('Output contains unsafe content');
      expect(error.checkTrigger).toBe(CheckTrigger.UNSAFE_CONTENT);
      expect(error.name).toBe('OutputCheckError');
    });
  });

  describe('RunEvent', () => {
    it('should have all expected event types', () => {
      expect(RunEvent.RUN_STARTED).toBe('run_started');
      expect(RunEvent.RUN_COMPLETED).toBe('run_completed');
      expect(RunEvent.PRE_HOOK_STARTED).toBe('pre_hook_started');
      expect(RunEvent.POST_HOOK_COMPLETED).toBe('post_hook_completed');
      expect(RunEvent.TOOL_CALL_STARTED).toBe('tool_call_started');
    });
  });
});

// ============================================================================
// Context Classes
// ============================================================================

describe('Hook Context Classes', () => {
  describe('LLMCallContext', () => {
    it('should create context with required fields', () => {
      const context = new LLMCallContext({
        messages: [{ role: 'user', content: 'Hello' }],
        llm: { id: 'gpt-4' },
      });

      expect(context.messages).toHaveLength(1);
      expect(context.llm).toEqual({ id: 'gpt-4' });
      expect(context.iterations).toBe(0);
      expect(context.agent).toBeNull();
    });

    it('should allow modifying messages', () => {
      const context = new LLMCallContext({
        messages: [{ role: 'user', content: 'Hello' }],
        llm: { id: 'gpt-4' },
      });

      context.messages.push({ role: 'system', content: 'Extra instruction' });

      expect(context.messages).toHaveLength(2);
    });

    it('should create context with all optional fields', () => {
      const context = new LLMCallContext({
        messages: [],
        llm: { id: 'gpt-4' },
        executor: { name: 'test' },
        iterations: 5,
        agent: { name: 'Agent1' },
        task: { name: 'Task1' },
        workflow: { name: 'Workflow1' },
        response: 'test response',
        tools: [{ type: 'function', function: { name: 'tool1', description: '', parameters: {} } }],
      });

      expect(context.executor).toEqual({ name: 'test' });
      expect(context.iterations).toBe(5);
      expect(context.agent).toEqual({ name: 'Agent1' });
      expect(context.response).toBe('test response');
      expect(context.tools).toHaveLength(1);
    });

    it('should clone context', () => {
      const context = new LLMCallContext({
        messages: [{ role: 'user', content: 'Hello' }],
        llm: { id: 'gpt-4' },
        iterations: 3,
      });

      const cloned = context.clone();

      expect(cloned.messages).toEqual(context.messages);
      expect(cloned.iterations).toBe(3);

      // Verify it's a separate copy
      cloned.messages.push({ role: 'system', content: 'New' });
      expect(context.messages).toHaveLength(1);
      expect(cloned.messages).toHaveLength(2);
    });
  });

  describe('ToolCallContext', () => {
    it('should create context with required fields', () => {
      const context = new ToolCallContext({
        toolName: 'search',
        toolInput: { query: 'test' },
        tool: { name: 'search' },
      });

      expect(context.toolName).toBe('search');
      expect(context.toolInput).toEqual({ query: 'test' });
      expect(context.agent).toBeNull();
    });

    it('should allow modifying toolInput', () => {
      const context = new ToolCallContext({
        toolName: 'search',
        toolInput: { query: 'test' },
        tool: { name: 'search' },
      });

      context.toolInput.limit = 10;

      expect(context.toolInput).toEqual({ query: 'test', limit: 10 });
    });

    it('should clone context', () => {
      const context = new ToolCallContext({
        toolName: 'search',
        toolInput: { query: 'test' },
        tool: { name: 'search' },
        toolResult: 'result',
      });

      const cloned = context.clone();

      expect(cloned.toolInput).toEqual(context.toolInput);
      expect(cloned.toolResult).toBe('result');

      // Verify it's a separate copy
      cloned.toolInput.query = 'modified';
      expect(context.toolInput.query).toBe('test');
    });
  });

  describe('HookContextFactory', () => {
    it('should create LLM context', () => {
      const context = HookContextFactory.createLLMContext({
        messages: [],
        llm: { id: 'test' },
      });

      expect(context).toBeInstanceOf(LLMCallContext);
    });

    it('should create Tool context', () => {
      const context = HookContextFactory.createToolContext({
        toolName: 'test',
        toolInput: {},
        tool: {},
      });

      expect(context).toBeInstanceOf(ToolCallContext);
    });
  });
});

// ============================================================================
// Hook Manager
// ============================================================================

describe('HookManager', () => {
  beforeEach(() => {
    hookManager.clearAllHooks();
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const instance1 = HookManager.getInstance();
      const instance2 = HookManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = HookManager.getInstance();
      HookManager.resetInstance();
      const instance2 = HookManager.getInstance();

      // After reset, it's a new instance
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('LLM Hook Registration', () => {
    it('should register before LLM hook', () => {
      const hook: BeforeLLMHook = () => null;
      hookManager.registerBeforeLLMHook(hook);

      const hooks = hookManager.getBeforeLLMHooks({});
      expect(hooks).toHaveLength(1);
    });

    it('should register after LLM hook', () => {
      const hook: AfterLLMHook = () => null;
      hookManager.registerAfterLLMHook(hook);

      const hooks = hookManager.getAfterLLMHooks({});
      expect(hooks).toHaveLength(1);
    });

    it('should filter hooks by agent', () => {
      const hook1: BeforeLLMHook = () => null;
      const hook2: BeforeLLMHook = () => null;

      hookManager.registerBeforeLLMHook(hook1, { agents: ['Agent1'] });
      hookManager.registerBeforeLLMHook(hook2, { agents: ['Agent2'] });

      const agent1Hooks = hookManager.getBeforeLLMHooks({
        agent: { name: 'Agent1' },
      });
      expect(agent1Hooks).toHaveLength(1);

      const agent2Hooks = hookManager.getBeforeLLMHooks({
        agent: { name: 'Agent2' },
      });
      expect(agent2Hooks).toHaveLength(1);
    });

    it('should unregister LLM hooks', () => {
      const hook: BeforeLLMHook = () => null;
      hookManager.registerBeforeLLMHook(hook);

      expect(hookManager.getBeforeLLMHooks({})).toHaveLength(1);

      hookManager.unregisterBeforeLLMHook(hook);

      expect(hookManager.getBeforeLLMHooks({})).toHaveLength(0);
    });
  });

  describe('Tool Hook Registration', () => {
    it('should register before tool hook', () => {
      const hook: BeforeToolHook = () => null;
      hookManager.registerBeforeToolHook(hook);

      const hooks = hookManager.getBeforeToolHooks({});
      expect(hooks).toHaveLength(1);
    });

    it('should filter hooks by tool name', () => {
      const hook1: BeforeToolHook = () => null;
      const hook2: BeforeToolHook = () => null;

      hookManager.registerBeforeToolHook(hook1, { tools: ['search'] });
      hookManager.registerBeforeToolHook(hook2, { tools: ['delete'] });

      const searchHooks = hookManager.getBeforeToolHooks({ toolName: 'search' });
      expect(searchHooks).toHaveLength(1);

      const deleteHooks = hookManager.getBeforeToolHooks({ toolName: 'delete' });
      expect(deleteHooks).toHaveLength(1);
    });

    it('should filter by both tool and agent', () => {
      const hook: BeforeToolHook = () => null;

      hookManager.registerBeforeToolHook(hook, {
        tools: ['search'],
        agents: ['Researcher'],
      });

      const matchingHooks = hookManager.getBeforeToolHooks({
        toolName: 'search',
        agent: { role: 'Researcher' },
      });
      expect(matchingHooks).toHaveLength(1);

      const nonMatchingHooks = hookManager.getBeforeToolHooks({
        toolName: 'delete',
        agent: { role: 'Researcher' },
      });
      expect(nonMatchingHooks).toHaveLength(0);
    });
  });

  describe('Agent Lifecycle Hooks', () => {
    it('should register agent pre-hooks', () => {
      const hook: PreHook = () => {};
      hookManager.registerAgentPreHook(hook);

      const hooks = hookManager.getAgentPreHooks({});
      expect(hooks).toHaveLength(1);
    });

    it('should register agent post-hooks with background flag', () => {
      const hook: PostHook = () => {};
      hookManager.registerAgentPostHook(hook, undefined, { runInBackground: true });

      const hooks = hookManager.getAgentPostHooks({});
      expect(hooks).toHaveLength(1);
      expect(hooks[0].runInBackground).toBe(true);
    });
  });

  describe('Priority Ordering', () => {
    it('should order hooks by priority', () => {
      const hook1: BeforeLLMHook = function lowPriority() { return null; };
      const hook2: BeforeLLMHook = function highPriority() { return null; };
      const hook3: BeforeLLMHook = function mediumPriority() { return null; };

      hookManager.registerBeforeLLMHook(hook1, undefined, 10);
      hookManager.registerBeforeLLMHook(hook2, undefined, 100);
      hookManager.registerBeforeLLMHook(hook3, undefined, 50);

      const hooks = hookManager.getBeforeLLMHooks({});

      // Should be ordered by priority (highest first)
      expect(hooks[0]).toBe(hook2); // 100
      expect(hooks[1]).toBe(hook3); // 50
      expect(hooks[2]).toBe(hook1); // 10
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      hookManager.registerBeforeLLMHook(() => null);
      hookManager.registerAfterLLMHook(() => null);
      hookManager.registerBeforeToolHook(() => null);
      hookManager.registerAfterToolHook(() => null);
      hookManager.registerAgentPreHook(() => {});
      hookManager.registerAgentPostHook(() => {});

      const stats = hookManager.getStats();

      expect(stats.llm.before).toBe(1);
      expect(stats.llm.after).toBe(1);
      expect(stats.tool.before).toBe(1);
      expect(stats.tool.after).toBe(1);
      expect(stats.agent.pre).toBe(1);
      expect(stats.agent.post).toBe(1);
      expect(stats.total).toBe(6);
    });
  });

  describe('Clear Methods', () => {
    it('should clear all hooks', () => {
      hookManager.registerBeforeLLMHook(() => null);
      hookManager.registerBeforeToolHook(() => null);
      hookManager.registerAgentPreHook(() => {});

      hookManager.clearAllHooks();

      const stats = hookManager.getStats();
      expect(stats.total).toBe(0);
    });

    it('should clear specific hook types', () => {
      hookManager.registerBeforeLLMHook(() => null);
      hookManager.registerAfterLLMHook(() => null);
      hookManager.registerBeforeToolHook(() => null);

      hookManager.clearLLMHooks();

      const stats = hookManager.getStats();
      expect(stats.llm.before).toBe(0);
      expect(stats.llm.after).toBe(0);
      expect(stats.tool.before).toBe(1);
    });
  });
});

// ============================================================================
// Hook Executor
// ============================================================================

describe('HookExecutor', () => {
  let executor: HookExecutor;

  beforeEach(() => {
    executor = new HookExecutor();
    hookManager.clearAllHooks();
  });

  describe('Pre-Hook Execution', () => {
    it('should execute pre-hooks in order', async () => {
      const order: number[] = [];

      const hook1: PreHook = () => { order.push(1); };
      const hook2: PreHook = () => { order.push(2); };
      const hook3: PreHook = () => { order.push(3); };

      await executor.executePreHooks(
        [hook1, hook2, hook3],
        createMockPreHookParams()
      );

      expect(order).toEqual([1, 2, 3]);
    });

    it('should throw on InputCheckError', async () => {
      const hook: PreHook = () => {
        throw new InputCheckError('Blocked', CheckTrigger.INPUT_NOT_ALLOWED);
      };

      await expect(
        executor.executePreHooks([hook], createMockPreHookParams())
      ).rejects.toThrow(InputCheckError);
    });

    it('should execute async hooks', async () => {
      let executed = false;

      const hook: PreHook = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executed = true;
      };

      await executor.executePreHooks([hook], createMockPreHookParams());

      expect(executed).toBe(true);
    });
  });

  describe('Post-Hook Execution', () => {
    it('should execute post-hooks', async () => {
      const order: number[] = [];

      const hook1: PostHook = () => { order.push(1); };
      const hook2: PostHook = () => { order.push(2); };

      await executor.executePostHooks(
        [hook1, hook2],
        createMockPostHookParams()
      );

      expect(order).toEqual([1, 2]);
    });

    it('should not throw on post-hook error (log only)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const hook: PostHook = () => {
        throw new Error('Post hook error');
      };

      // Should not throw
      await executor.executePostHooks([hook], createMockPostHookParams());

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Background Execution', () => {
    it('should execute background hooks without blocking', async () => {
      const backgroundHook = hook({ runInBackground: true })(
        function slowHook() {
          return new Promise((resolve) => setTimeout(resolve, 100));
        }
      ) as PreHook;

      const startTime = Date.now();
      await executor.executePreHooks([backgroundHook], createMockPreHookParams());
      const duration = Date.now() - startTime;

      // Should return immediately (not wait 100ms)
      expect(duration).toBeLessThan(50);
    });

    it('should wait for background hooks with waitForBackground', async () => {
      let completed = false;

      const backgroundHook = hook({ runInBackground: true })(
        async function slowHook() {
          await new Promise((resolve) => setTimeout(resolve, 50));
          completed = true;
        }
      ) as PreHook;

      await executor.executePreHooks([backgroundHook], createMockPreHookParams());

      // Not yet completed
      expect(completed).toBe(false);

      await executor.waitForBackground();

      // Now completed
      expect(completed).toBe(true);
    });
  });

  describe('Hook Normalization', () => {
    it('should normalize guardrails to hooks', () => {
      const guardrail = {
        name: 'TestGuardrail',
        check: vi.fn(),
      };

      const normalized = executor.normalizeHooks([guardrail], 'pre');

      expect(normalized).toHaveLength(1);
      expect(typeof normalized[0]).toBe('function');
    });

    it('should normalize evaluators with preCheck', () => {
      const evaluator = {
        name: 'TestEvaluator',
        preCheck: vi.fn(),
        postCheck: vi.fn(),
      };

      const preNormalized = executor.normalizeHooks([evaluator], 'pre');
      const postNormalized = executor.normalizeHooks([evaluator], 'post');

      expect(preNormalized).toHaveLength(1);
      expect(postNormalized).toHaveLength(1);
    });
  });

  describe('LLM Hook Execution', () => {
    it('should execute before LLM hooks and block if returns false', async () => {
      hookManager.registerBeforeLLMHook(() => false);

      const context = new LLMCallContext({
        messages: [],
        llm: { id: 'test' },
      });

      const shouldContinue = await executor.executeBeforeLLMHooks(context);

      expect(shouldContinue).toBe(false);
    });

    it('should execute after LLM hooks and modify response', async () => {
      hookManager.registerAfterLLMHook(() => 'modified response');

      const context = new LLMCallContext({
        messages: [],
        llm: { id: 'test' },
        response: 'original response',
      });

      const modified = await executor.executeAfterLLMHooks(context);

      expect(modified).toBe('modified response');
      expect(context.response).toBe('modified response');
    });
  });

  describe('Tool Hook Execution', () => {
    it('should execute before tool hooks', async () => {
      hookManager.registerBeforeToolHook(() => null);

      const context = new ToolCallContext({
        toolName: 'search',
        toolInput: { query: 'test' },
        tool: {},
      });

      const shouldContinue = await executor.executeBeforeToolHooks(context);

      expect(shouldContinue).toBe(true);
    });

    it('should block tool execution if hook returns false', async () => {
      hookManager.registerBeforeToolHook(() => false);

      const context = new ToolCallContext({
        toolName: 'search',
        toolInput: {},
        tool: {},
      });

      const shouldContinue = await executor.executeBeforeToolHooks(context);

      expect(shouldContinue).toBe(false);
    });
  });

  describe('Background Stats', () => {
    it('should return background queue stats', () => {
      const stats = executor.getBackgroundStats();

      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('running');
    });
  });
});

// ============================================================================
// Hook Metadata
// ============================================================================

describe('Hook Metadata', () => {
  describe('setHookMetadata / getHookMetadata', () => {
    it('should set and get metadata', () => {
      const fn = function testHook() {};

      setHookMetadata(fn, {
        name: 'testHook',
        runInBackground: true,
        priority: 50,
      });

      const metadata = getHookMetadata(fn);

      expect(metadata?.name).toBe('testHook');
      expect(metadata?.runInBackground).toBe(true);
      expect(metadata?.priority).toBe(50);
    });
  });

  describe('shouldRunInBackground', () => {
    it('should return true for background hooks', () => {
      const fn = function bgHook() {};
      setHookMetadata(fn, { name: 'bgHook', runInBackground: true });

      expect(shouldRunInBackground(fn)).toBe(true);
    });

    it('should return false for blocking hooks', () => {
      const fn = function blockingHook() {};
      setHookMetadata(fn, { name: 'blockingHook', runInBackground: false });

      expect(shouldRunInBackground(fn)).toBe(false);
    });

    it('should return false for hooks without metadata', () => {
      const fn = function noMetadata() {};

      expect(shouldRunInBackground(fn)).toBe(false);
    });
  });

  describe('getHookPriority', () => {
    it('should return priority from metadata', () => {
      const fn = function priorityHook() {};
      setHookMetadata(fn, { name: 'priorityHook', priority: 100 });

      expect(getHookPriority(fn)).toBe(100);
    });

    it('should return 0 for hooks without priority', () => {
      const fn = function noPriority() {};

      expect(getHookPriority(fn)).toBe(0);
    });
  });

  describe('getHookName', () => {
    it('should return name from metadata', () => {
      const fn = function namedHook() {};
      setHookMetadata(fn, { name: 'customName' });

      expect(getHookName(fn)).toBe('customName');
    });

    it('should fallback to function name', () => {
      function fallbackName() {}

      expect(getHookName(fallbackName)).toBe('fallbackName');
    });
  });
});

// ============================================================================
// Deep Copy
// ============================================================================

describe('copyArgsForBackground', () => {
  it('should deep copy specified keys', () => {
    const original = {
      runInput: { content: 'test' },
      runContext: { runId: '123', metadata: { key: 'value' } },
      agent: { name: 'Agent1' },
    };

    const copied = copyArgsForBackground(original);

    // Should be deep copied
    expect(copied.runInput).toEqual(original.runInput);
    expect(copied.runInput).not.toBe(original.runInput);

    expect(copied.runContext).toEqual(original.runContext);
    expect(copied.runContext).not.toBe(original.runContext);

    // Agent is shallow copied (reference)
    expect(copied.agent).toBe(original.agent);
  });

  it('should handle nested objects', () => {
    const original = {
      runContext: {
        runId: '123',
        metadata: {
          nested: {
            deep: 'value',
          },
        },
      },
    };

    const copied = copyArgsForBackground(original);

    // Modify original nested
    (original.runContext.metadata.nested as any).deep = 'modified';

    // Copy should be unaffected
    expect(copied.runContext.metadata.nested.deep).toBe('value');
  });

  it('should handle arrays', () => {
    const original = {
      sessionState: {
        items: [1, 2, 3],
      },
    };

    const copied = copyArgsForBackground(original);

    // Modify original
    original.sessionState.items.push(4);

    // Copy should be unaffected
    expect(copied.sessionState.items).toEqual([1, 2, 3]);
  });
});

// ============================================================================
// Decorators
// ============================================================================

describe('Hook Decorators', () => {
  beforeEach(() => {
    hookManager.clearAllHooks();
  });

  describe('hook decorator', () => {
    it('should set metadata', () => {
      const myHook = hook({ runInBackground: true, priority: 50 })(
        function myHook() {}
      );

      expect(shouldRunInBackground(myHook)).toBe(true);
      expect(getHookPriority(myHook)).toBe(50);
    });
  });

  describe('createHook', () => {
    it('should create hook with metadata', () => {
      const myHook = createHook(
        { runInBackground: true },
        function myHook() {}
      );

      expect(shouldRunInBackground(myHook)).toBe(true);
    });
  });

  describe('beforeLLMCall decorator', () => {
    it('should set metadata and auto-register', () => {
      const _myHook = beforeLLMCall({ agents: ['Agent1'] })(
        function myHook() { return null; }
      );

      // Should be registered
      const hooks = hookManager.getBeforeLLMHooks({
        agent: { name: 'Agent1' },
      });
      expect(hooks).toHaveLength(1);
    });

    it('should filter by agent', () => {
      beforeLLMCall({ agents: ['Agent1'] })(
        function hook1() { return null; }
      );
      beforeLLMCall({ agents: ['Agent2'] })(
        function hook2() { return null; }
      );

      const agent1Hooks = hookManager.getBeforeLLMHooks({
        agent: { name: 'Agent1' },
      });
      expect(agent1Hooks).toHaveLength(1);
    });
  });

  describe('afterLLMCall decorator', () => {
    it('should auto-register', () => {
      afterLLMCall()(function myHook() { return null; });

      const hooks = hookManager.getAfterLLMHooks({});
      expect(hooks).toHaveLength(1);
    });
  });

  describe('beforeToolCall decorator', () => {
    it('should filter by tool name', () => {
      beforeToolCall({ tools: ['search'] })(
        function searchHook() { return null; }
      );

      const searchHooks = hookManager.getBeforeToolHooks({ toolName: 'search' });
      expect(searchHooks).toHaveLength(1);

      const deleteHooks = hookManager.getBeforeToolHooks({ toolName: 'delete' });
      expect(deleteHooks).toHaveLength(0);
    });
  });

  describe('afterToolCall decorator', () => {
    it('should auto-register', () => {
      afterToolCall()(function myHook() { return null; });

      const hooks = hookManager.getAfterToolHooks({});
      expect(hooks).toHaveLength(1);
    });
  });

  describe('Convenience functions', () => {
    it('blockingHook should set runInBackground to false', () => {
      const myHook = blockingHook(function blocking() {});

      expect(shouldRunInBackground(myHook)).toBe(false);
    });

    it('backgroundHook should set runInBackground to true', () => {
      const myHook = backgroundHook(function background() {});

      expect(shouldRunInBackground(myHook)).toBe(true);
    });

    it('priorityHook should set priority', () => {
      const myHook = priorityHook(function priority() {}, 200);

      expect(getHookPriority(myHook)).toBe(200);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Hook Integration', () => {
  let executor: HookExecutor;

  beforeEach(() => {
    executor = new HookExecutor();
    hookManager.clearAllHooks();
  });

  it('should execute full pre-hook flow with validation', async () => {
    const validated: string[] = [];

    const validateInput: PreHook = ({ runInput }) => {
      if (typeof runInput.inputContent === 'string' &&
          runInput.inputContent.includes('forbidden')) {
        throw new InputCheckError('Forbidden content', CheckTrigger.INPUT_NOT_ALLOWED);
      }
      validated.push('input');
    };

    const logRequest: PreHook = () => {
      validated.push('logged');
    };

    // Valid input
    await executor.executePreHooks(
      [validateInput, logRequest],
      createMockPreHookParams()
    );

    expect(validated).toEqual(['input', 'logged']);

    // Invalid input
    validated.length = 0;
    const params = createMockPreHookParams();
    (params.runInput as any).inputContent = 'forbidden content';

    await expect(
      executor.executePreHooks([validateInput, logRequest], params)
    ).rejects.toThrow(InputCheckError);
  });

  it('should execute full post-hook flow with modification', async () => {
    const modifications: string[] = [];

    const formatOutput: PostHook = ({ runOutput }) => {
      (runOutput as any).content = 'formatted: ' + runOutput.content;
      modifications.push('formatted');
    };

    const addMetadata: PostHook = ({ runOutput }) => {
      (runOutput as any).metadata = { processed: true };
      modifications.push('metadata');
    };

    const params = createMockPostHookParams();

    await executor.executePostHooks([formatOutput, addMetadata], params);

    expect(modifications).toEqual(['formatted', 'metadata']);
    expect(params.runOutput.content).toBe('formatted: test output');
    expect((params.runOutput as any).metadata).toEqual({ processed: true });
  });

  it('should handle mixed blocking and background hooks', async () => {
    const order: string[] = [];

    const blockingValidation: PreHook = () => {
      order.push('blocking');
    };

    const backgroundLog = hook({ runInBackground: true })(
      async function backgroundLog() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push('background');
      }
    ) as PreHook;

    await executor.executePreHooks(
      [blockingValidation, backgroundLog],
      createMockPreHookParams()
    );

    // Only blocking should have run
    expect(order).toEqual(['blocking']);

    // Wait for background
    await executor.waitForBackground();

    // Now both should have run
    expect(order).toEqual(['blocking', 'background']);
  });

  it('should respect priority ordering', async () => {
    const order: number[] = [];

    const low = hook({ priority: 10 })(function low() { order.push(10); }) as PreHook;
    const high = hook({ priority: 100 })(function high() { order.push(100); }) as PreHook;
    const medium = hook({ priority: 50 })(function medium() { order.push(50); }) as PreHook;

    // Pass in any order
    await executor.executePreHooks([low, medium, high], createMockPreHookParams());

    // Should execute in priority order (high first)
    expect(order).toEqual([100, 50, 10]);
  });
});
