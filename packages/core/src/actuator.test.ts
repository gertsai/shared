import { describe, expect, it, vi } from 'vitest';
import {
  StepActuator,
  AIActuator,
  ActuatorResult,
  ExecutionContext,
  isAIActuator,
  canSupplyComponent,
  ExtractSupplyType,
  ExtractOutputType,
  ExtractInputType,
} from './actuator';
import { GertsConnectionTypes } from './connections';

// Mock ExecutionContext
const createMockContext = (): ExecutionContext => ({
  getInput: vi.fn().mockReturnValue({}),
  getVariable: vi.fn(),
  getVariables: vi.fn().mockReturnValue({}),
  getStepOutput: vi.fn(),
  getTool: vi.fn(),
  getCredential: vi.fn().mockReturnValue('test-credential'),
  getStepConfig: vi.fn().mockReturnValue({}),
  suspend: vi.fn() as never,
});

describe('StepActuator', () => {
  it('should allow creating a basic actuator implementation', async () => {
    const actuator: StepActuator<{ value: number }, number> = {
      type: 'double',
      async execute(input, _context) {
        return {
          status: 'success',
          output: input.value * 2,
          duration: 1,
        };
      },
    };

    const context = createMockContext();
    const result = await actuator.execute({ value: 5 }, context);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output).toBe(10);
    }
  });

  it('should support optional validate method', () => {
    const actuator: StepActuator<{ value: number }, number> = {
      type: 'positive-only',
      async execute(input) {
        return { status: 'success', output: input.value, duration: 0 };
      },
      validate(input) {
        if (input.value < 0) {
          return { valid: false, errors: ['Value must be positive'] };
        }
        return { valid: true };
      },
    };

    expect(actuator.validate?.({ value: 5 })).toEqual({ valid: true });
    expect(actuator.validate?.({ value: -1 })).toEqual({
      valid: false,
      errors: ['Value must be positive'],
    });
  });

  it('should support optional cleanup method', async () => {
    const cleanupFn = vi.fn();

    const actuator: StepActuator = {
      type: 'with-cleanup',
      async execute() {
        return { status: 'success', output: null, duration: 0 };
      },
      async cleanup(context) {
        cleanupFn(context);
      },
    };

    const context = createMockContext();
    await actuator.cleanup?.(context);

    expect(cleanupFn).toHaveBeenCalledWith(context);
  });
});

describe('ActuatorResult', () => {
  it('should support success result', () => {
    const result: ActuatorResult<string> = {
      status: 'success',
      output: 'hello',
      duration: 100,
    };

    expect(result.status).toBe('success');
  });

  it('should support success result with multiple outputs', () => {
    const result: ActuatorResult<string> = {
      status: 'success',
      output: 'main output',
      outputs: {
        0: 'output 0',
        1: 'output 1',
      },
      duration: 100,
    };

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.outputs).toEqual({ 0: 'output 0', 1: 'output 1' });
    }
  });

  it('should support suspended result', () => {
    const result: ActuatorResult<string> = {
      status: 'suspended',
      reason: 'Waiting for user approval',
      suspendData: { requestId: '123' },
    };

    expect(result.status).toBe('suspended');
  });

  it('should support failed result', () => {
    const result: ActuatorResult<string> = {
      status: 'failed',
      error: new Error('Something went wrong'),
    };

    expect(result.status).toBe('failed');
  });
});

describe('AIActuator', () => {
  it('should extend StepActuator with AI-specific properties', async () => {
    interface EmbeddingProvider {
      embed(texts: string[]): Promise<number[][]>;
    }

    const actuator: AIActuator<{ text: string }, void, EmbeddingProvider> = {
      type: 'embedding',
      aiConnectionType: GertsConnectionTypes.AiEmbedding,

      async execute() {
        return { status: 'success', output: undefined, duration: 0 };
      },

      async supplyComponent(_context): Promise<EmbeddingProvider> {
        return {
          async embed(texts: string[]) {
            return texts.map(() => [0.1, 0.2, 0.3]);
          },
        };
      },
    };

    expect(actuator.aiConnectionType).toBe(GertsConnectionTypes.AiEmbedding);
    expect(actuator.supplyComponent).toBeDefined();

    const context = createMockContext();
    const provider = await actuator.supplyComponent?.(context);
    expect(provider).toBeDefined();

    const embeddings = await provider?.embed(['hello']);
    expect(embeddings).toEqual([[0.1, 0.2, 0.3]]);
  });

  it('should support acceptsConnectionTypes', () => {
    const actuator: AIActuator = {
      type: 'agent',
      aiConnectionType: GertsConnectionTypes.AiAgent,
      acceptsConnectionTypes: [
        GertsConnectionTypes.AiLanguageModel,
        GertsConnectionTypes.AiMemory,
        GertsConnectionTypes.AiTool,
      ],

      async execute() {
        return { status: 'success', output: null, duration: 0 };
      },
    };

    expect(actuator.acceptsConnectionTypes).toContain(GertsConnectionTypes.AiLanguageModel);
    expect(actuator.acceptsConnectionTypes).toContain(GertsConnectionTypes.AiMemory);
    expect(actuator.acceptsConnectionTypes).toContain(GertsConnectionTypes.AiTool);
  });
});

describe('isAIActuator', () => {
  it('should return true for actuators with aiConnectionType', () => {
    const actuator: AIActuator = {
      type: 'ai-node',
      aiConnectionType: GertsConnectionTypes.AiAgent,
      async execute() {
        return { status: 'success', output: null, duration: 0 };
      },
    };

    expect(isAIActuator(actuator)).toBe(true);
  });

  it('should return true for actuators with supplyComponent', () => {
    const actuator: AIActuator<unknown, null, Record<string, unknown>> = {
      type: 'supplier',
      async execute() {
        return { status: 'success', output: null, duration: 0 };
      },
      async supplyComponent() {
        return {};
      },
    };

    expect(isAIActuator(actuator)).toBe(true);
  });

  it('should return false for basic StepActuator', () => {
    const actuator: StepActuator = {
      type: 'basic',
      async execute() {
        return { status: 'success', output: null, duration: 0 };
      },
    };

    expect(isAIActuator(actuator)).toBe(false);
  });
});

describe('canSupplyComponent', () => {
  it('should return true for AI actuators with supplyComponent', () => {
    const actuator: AIActuator<unknown, unknown, object> = {
      type: 'supplier',
      async execute() {
        return { status: 'success', output: null, duration: 0 };
      },
      async supplyComponent() {
        return {};
      },
    };

    expect(canSupplyComponent(actuator)).toBe(true);
  });

  it('should return false for AI actuators without supplyComponent', () => {
    const actuator: AIActuator = {
      type: 'no-supply',
      aiConnectionType: GertsConnectionTypes.AiAgent,
      async execute() {
        return { status: 'success', output: null, duration: 0 };
      },
    };

    expect(canSupplyComponent(actuator)).toBe(false);
  });
});

describe('Type extraction helpers', () => {
  it('should extract supply type from AIActuator', () => {
    interface TestProvider {
      test(): void;
    }

    type TestActuator = AIActuator<string, number, TestProvider>;
    type Supplied = ExtractSupplyType<TestActuator>;

    // Type-level test - if this compiles, the type works
    const _typeTest: Supplied = { test: () => {} };
    expect(_typeTest).toBeDefined();
  });

  it('should extract output type from StepActuator', () => {
    type TestActuator = StepActuator<string, { result: number }>;
    type Output = ExtractOutputType<TestActuator>;

    // Type-level test
    const _typeTest: Output = { result: 42 };
    expect(_typeTest.result).toBe(42);
  });

  it('should extract input type from StepActuator', () => {
    type TestActuator = StepActuator<{ name: string }, void>;
    type Input = ExtractInputType<TestActuator>;

    // Type-level test
    const _typeTest: Input = { name: 'test' };
    expect(_typeTest.name).toBe('test');
  });
});
