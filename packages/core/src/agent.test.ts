/**
 * @gertsai/core - Agent interface type tests
 * Wave 12.D-fix per FR-015 (IAgent.run) + FR-016 (AgentFactoryConfig).
 *
 * These tests exercise the type system at compile time — runtime
 * assertions are minimal because the meaningful behaviour is in the
 * shape constraints.
 */
import { describe, it, expect } from 'vitest';
import type {
  IAgent,
  AgentFactoryConfig,
  AgentRunResult,
  IBaseLLM,
  ITool,
} from './agent';

describe('FR-015: IAgent.run accepts string | unknown', () => {
  it('accepts a string literal directly (no narrowing needed)', async () => {
    const agent: IAgent = {
      getId: () => 'a1',
      getRole: () => 'r',
      getGoal: () => 'g',
      tenantId: 't1',
      run: async (input: string | unknown): Promise<AgentRunResult> => ({
        status: 'completed',
        content: typeof input === 'string' ? input : 'non-string',
        sessionId: 's1',
      }),
    };

    const r = await agent.run('hello');
    expect(r.content).toBe('hello');
  });

  it('requires narrowing for unknown values (typeof check) — compile-time contract', async () => {
    const agent: IAgent = {
      getId: () => 'a2',
      getRole: () => 'r',
      getGoal: () => 'g',
      tenantId: 't1',
      run: async (input: string | unknown): Promise<AgentRunResult> => {
        // typeof narrowing — proves the input type is NOT `any` (which
        // would let you pass to ANY function unchecked).
        let s: string;
        if (typeof input === 'string') {
          s = input;
        } else if (input !== null && typeof input === 'object' && 'message' in input) {
          s = String((input as { message: unknown }).message);
        } else {
          s = String(input);
        }
        return { status: 'completed', content: s, sessionId: 's1' };
      },
    };

    const r = await agent.run({ message: 42 });
    expect(r.content).toBe('42');
  });
});

describe('FR-016: AgentFactoryConfig uses structural IBaseLLM / ITool', () => {
  it('compiles when model satisfies the IBaseLLM shape structurally', () => {
    const minimalModel: IBaseLLM = { provider: 'openai', model: 'gpt-4o' };
    const cfg: AgentFactoryConfig = {
      role: 'r',
      goal: 'g',
      backstory: 'b',
      model: minimalModel,
      tenantId: 't1',
    };
    expect(cfg.model.provider).toBe('openai');
    expect(cfg.model.model).toBe('gpt-4o');
  });

  it('accepts readonly ITool[]', () => {
    const tools: readonly ITool[] = [
      { name: 'search' },
      { name: 'calc', description: 'arithmetic' },
    ];
    const cfg: AgentFactoryConfig = {
      role: 'r',
      goal: 'g',
      backstory: 'b',
      model: { provider: 'openai', model: 'gpt-4o' },
      tenantId: 't1',
      tools,
    };
    expect(cfg.tools?.length).toBe(2);
    expect(cfg.tools?.[0]?.name).toBe('search');
  });

  it('a class with readonly provider+model satisfies IBaseLLM structurally', () => {
    // Mimics how OpenAIProvider / AnthropicProvider satisfy this contract
    // (their public fields are `readonly provider: string;` and
    // `readonly model: string;` on the abstract BaseLLM).
    class FakeProvider {
      public readonly provider = 'fake';
      public readonly model = 'fake-model';
      public extra = 'whatever';
    }
    const p: IBaseLLM = new FakeProvider();
    expect(p.provider).toBe('fake');
  });
});
