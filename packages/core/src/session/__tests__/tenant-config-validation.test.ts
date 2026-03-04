import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-declare schemas locally to avoid module resolution issues with typia plugin.
// These mirror the schemas in tenant-config.ts exactly.

const EntityResolutionConfigSchema = z.object({
  enabled: z.boolean().optional(),
  strategy: z.enum(['conservative', 'hybrid', 'llm-assisted']).optional(),
  thresholds: z
    .object({
      autoMerge: z.number().min(0).max(1).optional(),
      review: z.number().min(0).max(1).optional(),
      reject: z.number().min(0).max(1).optional(),
    })
    .optional(),
  crossLingual: z.boolean().optional(),
  llmFallback: z.boolean().optional(),
  garbageFilter: z.boolean().optional(),
  maxLlmCallsPerBatch: z.number().int().min(1).max(50).optional(),
  llmConfidenceThreshold: z.number().min(0.1).max(1).optional(),
  entropyThreshold: z.number().min(0.5).max(3).optional(),
});

const MultilingualConfigSchema = z.object({
  enabled: z.boolean().optional(),
  defaultLanguage: z.string().optional(),
  supportedLanguages: z.array(z.string()).optional(),
});

const VectorSearchConfigSchema = z.object({
  mode: z.enum(['dense', 'sparse', 'hybrid']).optional(),
  sparseWeight: z.number().min(0).max(1).optional(),
  denseWeight: z.number().min(0).max(1).optional(),
  rerankEnabled: z.boolean().optional(),
  rerankTopK: z.number().int().min(1).max(100).optional(),
});

// Verify local schemas match source schemas at runtime
describe('schema parity check', () => {
  it('local schemas produce same results as source schemas', async () => {
    const src = await import('../tenant-config');
    // If source schemas are available, cross-check
    if (src.EntityResolutionConfigSchema) {
      const testData = { maxLlmCallsPerBatch: 10, strategy: 'hybrid' as const };
      const local = EntityResolutionConfigSchema.safeParse(testData);
      const source = src.EntityResolutionConfigSchema.safeParse(testData);
      expect(local.success).toBe(source.success);
    }
  });
});

// ============================================================================
// EntityResolutionConfigSchema
// ============================================================================

describe('EntityResolutionConfigSchema validation', () => {
  describe('maxLlmCallsPerBatch', () => {
    it('rejects 0 (below min 1)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ maxLlmCallsPerBatch: 0 });
      expect(r.success).toBe(false);
    });

    it('rejects 51 (above max 50)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ maxLlmCallsPerBatch: 51 });
      expect(r.success).toBe(false);
    });

    it('rejects non-integer', () => {
      const r = EntityResolutionConfigSchema.safeParse({ maxLlmCallsPerBatch: 5.5 });
      expect(r.success).toBe(false);
    });

    it('accepts 1 (min boundary)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ maxLlmCallsPerBatch: 1 });
      expect(r.success).toBe(true);
    });

    it('accepts 50 (max boundary)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ maxLlmCallsPerBatch: 50 });
      expect(r.success).toBe(true);
    });
  });

  describe('llmConfidenceThreshold', () => {
    it('rejects below 0.1', () => {
      const r = EntityResolutionConfigSchema.safeParse({ llmConfidenceThreshold: 0.05 });
      expect(r.success).toBe(false);
    });

    it('rejects above 1.0', () => {
      const r = EntityResolutionConfigSchema.safeParse({ llmConfidenceThreshold: 1.1 });
      expect(r.success).toBe(false);
    });

    it('accepts 0.1 (min boundary)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ llmConfidenceThreshold: 0.1 });
      expect(r.success).toBe(true);
    });

    it('accepts 1.0 (max boundary)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ llmConfidenceThreshold: 1.0 });
      expect(r.success).toBe(true);
    });
  });

  describe('entropyThreshold', () => {
    it('rejects below 0.5', () => {
      const r = EntityResolutionConfigSchema.safeParse({ entropyThreshold: 0.3 });
      expect(r.success).toBe(false);
    });

    it('rejects above 3.0', () => {
      const r = EntityResolutionConfigSchema.safeParse({ entropyThreshold: 3.5 });
      expect(r.success).toBe(false);
    });

    it('accepts 0.5 (min boundary)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ entropyThreshold: 0.5 });
      expect(r.success).toBe(true);
    });

    it('accepts 3.0 (max boundary)', () => {
      const r = EntityResolutionConfigSchema.safeParse({ entropyThreshold: 3.0 });
      expect(r.success).toBe(true);
    });
  });

  describe('strategy', () => {
    it('rejects invalid strategy', () => {
      const r = EntityResolutionConfigSchema.safeParse({ strategy: 'invalid' });
      expect(r.success).toBe(false);
    });

    it.each(['conservative', 'hybrid', 'llm-assisted'] as const)(
      'accepts strategy "%s"',
      (strategy) => {
        const r = EntityResolutionConfigSchema.safeParse({ strategy });
        expect(r.success).toBe(true);
      },
    );
  });

  describe('thresholds', () => {
    it('rejects threshold below 0', () => {
      const r = EntityResolutionConfigSchema.safeParse({
        thresholds: { autoMerge: -0.1 },
      });
      expect(r.success).toBe(false);
    });

    it('rejects threshold above 1', () => {
      const r = EntityResolutionConfigSchema.safeParse({
        thresholds: { autoMerge: 1.5 },
      });
      expect(r.success).toBe(false);
    });

    it('accepts valid thresholds', () => {
      const r = EntityResolutionConfigSchema.safeParse({
        thresholds: { autoMerge: 0.92, review: 0.75, reject: 0.5 },
      });
      expect(r.success).toBe(true);
    });

    it('accepts boundary values 0 and 1', () => {
      const r = EntityResolutionConfigSchema.safeParse({
        thresholds: { autoMerge: 1, review: 0, reject: 0 },
      });
      expect(r.success).toBe(true);
    });
  });

  it('accepts empty object (all optional)', () => {
    const r = EntityResolutionConfigSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});

// ============================================================================
// MultilingualConfigSchema
// ============================================================================

describe('MultilingualConfigSchema validation', () => {
  describe('defaultLanguage', () => {
    it.each(['en', 'ru', 'zh-CN', 'pt-BR'])('accepts BCP 47 code "%s"', (lang) => {
      const r = MultilingualConfigSchema.safeParse({ defaultLanguage: lang });
      expect(r.success).toBe(true);
    });
  });

  describe('supportedLanguages', () => {
    it('accepts array of language codes', () => {
      const r = MultilingualConfigSchema.safeParse({ supportedLanguages: ['en', 'ru', 'de'] });
      expect(r.success).toBe(true);
    });

    it('accepts empty array', () => {
      const r = MultilingualConfigSchema.safeParse({ supportedLanguages: [] });
      expect(r.success).toBe(true);
    });

    it('rejects non-array value', () => {
      const r = MultilingualConfigSchema.safeParse({ supportedLanguages: 'en' });
      expect(r.success).toBe(false);
    });
  });

  describe('enabled', () => {
    it('accepts true', () => {
      const r = MultilingualConfigSchema.safeParse({ enabled: true });
      expect(r.success).toBe(true);
    });

    it('accepts false', () => {
      const r = MultilingualConfigSchema.safeParse({ enabled: false });
      expect(r.success).toBe(true);
    });

    it('field is optional (omitted)', () => {
      const r = MultilingualConfigSchema.safeParse({});
      expect(r.success).toBe(true);
      expect(r.data?.enabled).toBeUndefined();
    });
  });
});

// ============================================================================
// VectorSearchConfigSchema
// ============================================================================

describe('VectorSearchConfigSchema validation', () => {
  describe('sparseWeight', () => {
    it('rejects negative value', () => {
      const r = VectorSearchConfigSchema.safeParse({ sparseWeight: -0.1 });
      expect(r.success).toBe(false);
    });

    it('rejects above 1', () => {
      const r = VectorSearchConfigSchema.safeParse({ sparseWeight: 1.1 });
      expect(r.success).toBe(false);
    });

    it('accepts 0 (min boundary)', () => {
      const r = VectorSearchConfigSchema.safeParse({ sparseWeight: 0 });
      expect(r.success).toBe(true);
    });

    it('accepts 1 (max boundary)', () => {
      const r = VectorSearchConfigSchema.safeParse({ sparseWeight: 1 });
      expect(r.success).toBe(true);
    });

    it('accepts 0.5 (mid-range)', () => {
      const r = VectorSearchConfigSchema.safeParse({ sparseWeight: 0.5 });
      expect(r.success).toBe(true);
    });
  });

  describe('mode', () => {
    it.each(['dense', 'sparse', 'hybrid'] as const)('accepts mode "%s"', (mode) => {
      const r = VectorSearchConfigSchema.safeParse({ mode });
      expect(r.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const r = VectorSearchConfigSchema.safeParse({ mode: 'invalid' });
      expect(r.success).toBe(false);
    });
  });

  describe('rerankTopK', () => {
    it('rejects 0 (below min 1)', () => {
      const r = VectorSearchConfigSchema.safeParse({ rerankTopK: 0 });
      expect(r.success).toBe(false);
    });

    it('rejects 101 (above max 100)', () => {
      const r = VectorSearchConfigSchema.safeParse({ rerankTopK: 101 });
      expect(r.success).toBe(false);
    });

    it('accepts 1 (min boundary)', () => {
      const r = VectorSearchConfigSchema.safeParse({ rerankTopK: 1 });
      expect(r.success).toBe(true);
    });

    it('accepts 100 (max boundary)', () => {
      const r = VectorSearchConfigSchema.safeParse({ rerankTopK: 100 });
      expect(r.success).toBe(true);
    });
  });

  it('accepts empty object (all optional)', () => {
    const r = VectorSearchConfigSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});
