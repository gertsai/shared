/**
 * Tests for GertsResponse envelope types
 */
import { describe, it, expect, vi } from 'vitest';
import {
  type GertsResponse,
  type UsageInfo,
  type GertsObjectType,
  ID_PREFIXES,
  generateId,
  createGertsResponse,
  isSuccessResponse,
} from './response';

describe('GertsResponse Envelope', () => {
  describe('ID_PREFIXES', () => {
    it('should define all expected prefixes', () => {
      expect(ID_PREFIXES.query).toBe('qry');
      expect(ID_PREFIXES.document).toBe('doc');
      expect(ID_PREFIXES.entity).toBe('ent');
      expect(ID_PREFIXES.relationship).toBe('rel');
      expect(ID_PREFIXES.community).toBe('com');
      expect(ID_PREFIXES.chunk).toBe('chk');
      expect(ID_PREFIXES.job).toBe('job');
      expect(ID_PREFIXES.list).toBe('lst');
      expect(ID_PREFIXES.key).toBe('key');
      expect(ID_PREFIXES.event).toBe('evt');
    });

    it('should have 3-letter prefixes', () => {
      for (const [, prefix] of Object.entries(ID_PREFIXES)) {
        expect(prefix).toHaveLength(3);
      }
    });
  });

  describe('generateId', () => {
    it('should generate ID with correct prefix', () => {
      const id = generateId('qry');
      expect(id).toMatch(/^qry_[a-zA-Z0-9]{12}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('doc'));
      }
      expect(ids.size).toBe(100);
    });

    it('should accept custom prefix', () => {
      const id = generateId('xyz');
      expect(id).toMatch(/^xyz_[a-zA-Z0-9]{12}$/);
    });

    it('should generate 12 random characters', () => {
      const id = generateId('test');
      const [, random] = id.split('_');
      expect(random).toHaveLength(12);
      expect(random).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });

  describe('UsageInfo', () => {
    it('should define required token fields', () => {
      const usage: UsageInfo = {
        prompt_tokens: 50,
        completion_tokens: 150,
        total_tokens: 200,
      };

      expect(usage.prompt_tokens).toBe(50);
      expect(usage.completion_tokens).toBe(150);
      expect(usage.total_tokens).toBe(200);
    });

    it('should accept gerts-specific fields', () => {
      const usage: UsageInfo = {
        prompt_tokens: 50,
        completion_tokens: 150,
        total_tokens: 200,
        graph_traversals: 5,
        vector_searches: 3,
        entities_found: 10,
        chunks_retrieved: 8,
        processing_time_ms: 250,
      };

      expect(usage.graph_traversals).toBe(5);
      expect(usage.vector_searches).toBe(3);
      expect(usage.entities_found).toBe(10);
      expect(usage.chunks_retrieved).toBe(8);
      expect(usage.processing_time_ms).toBe(250);
    });
  });

  describe('GertsObjectType', () => {
    it('should include query types', () => {
      const types: GertsObjectType[] = ['query.result', 'query.analysis'];
      expect(types).toHaveLength(2);
    });

    it('should include document types', () => {
      const types: GertsObjectType[] = ['document', 'document.list', 'chunk', 'chunk.list'];
      expect(types).toHaveLength(4);
    });

    it('should include entity types', () => {
      const types: GertsObjectType[] = [
        'entity',
        'entity.list',
        'relationship',
        'relationship.list',
      ];
      expect(types).toHaveLength(4);
    });

    it('should include job types', () => {
      const types: GertsObjectType[] = ['job', 'job.list', 'job.status'];
      expect(types).toHaveLength(3);
    });
  });

  describe('GertsResponse<T>', () => {
    it('should define required fields', () => {
      const response: GertsResponse<{ answer: string }> = {
        id: 'qry_abc123def456',
        object: 'query.result',
        created: 1704067200,
        success: true,
        data: { answer: 'The answer' },
        tenant_id: 'demo',
      };

      expect(response.id).toMatch(/^qry_/);
      expect(response.object).toBe('query.result');
      expect(response.success).toBe(true);
      expect(response.data.answer).toBe('The answer');
      expect(response.tenant_id).toBe('demo');
    });

    it('should accept optional fields', () => {
      const response: GertsResponse<{ value: number }> = {
        id: 'lst_abc123def456',
        object: 'list',
        created: 1704067200,
        success: true,
        data: { value: 42 },
        tenant_id: 'demo',
        model: 'gpt-4o-mini',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        trace_id: 'trace-123',
      };

      expect(response.model).toBe('gpt-4o-mini');
      expect(response.usage?.total_tokens).toBe(30);
      expect(response.trace_id).toBe('trace-123');
    });
  });

  describe('createGertsResponse', () => {
    it('should create response with required fields', () => {
      const response = createGertsResponse({
        object: 'query.result',
        data: { answer: 'Test' },
        tenant_id: 'demo',
      });

      expect(response.id).toMatch(/^qry_[a-zA-Z0-9]{12}$/);
      expect(response.object).toBe('query.result');
      expect(response.success).toBe(true);
      expect(response.data.answer).toBe('Test');
      expect(response.tenant_id).toBe('demo');
      expect(response.created).toBeDefined();
      expect(response.created).toBeGreaterThan(0);
    });

    it('should use correct prefix for object type', () => {
      const queryResponse = createGertsResponse({
        object: 'query.result',
        data: {},
        tenant_id: 'demo',
      });
      expect(queryResponse.id).toMatch(/^qry_/);

      const entityResponse = createGertsResponse({
        object: 'entity',
        data: {},
        tenant_id: 'demo',
      });
      expect(entityResponse.id).toMatch(/^ent_/);

      const listResponse = createGertsResponse({
        object: 'entity.list',
        data: {},
        tenant_id: 'demo',
      });
      expect(listResponse.id).toMatch(/^lst_/);
    });

    it('should include optional fields when provided', () => {
      const response = createGertsResponse({
        object: 'query.result',
        data: { answer: 'Test' },
        tenant_id: 'demo',
        model: 'claude-sonnet-4-20250514',
        trace_id: 'trace-abc',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
        },
      });

      expect(response.model).toBe('claude-sonnet-4-20250514');
      expect(response.trace_id).toBe('trace-abc');
      expect(response.usage?.total_tokens).toBe(300);
    });

    it('should use custom ID when provided', () => {
      const response = createGertsResponse({
        object: 'query.result',
        data: {},
        tenant_id: 'demo',
        id: 'custom_myid123456',
      });

      expect(response.id).toBe('custom_myid123456');
    });

    it('should set created timestamp to current time', () => {
      const before = Math.floor(Date.now() / 1000);
      const response = createGertsResponse({
        object: 'query.result',
        data: {},
        tenant_id: 'demo',
      });
      const after = Math.floor(Date.now() / 1000);

      expect(response.created).toBeGreaterThanOrEqual(before);
      expect(response.created).toBeLessThanOrEqual(after);
    });
  });

  describe('isSuccessResponse', () => {
    it('should return true for valid success response', () => {
      const response = createGertsResponse({
        object: 'query.result',
        data: { answer: 'Test' },
        tenant_id: 'demo',
      });

      expect(isSuccessResponse(response)).toBe(true);
    });

    it('should return false for error response', () => {
      const errorResponse = {
        success: false,
        error: { message: 'Error' },
      };

      expect(isSuccessResponse(errorResponse)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isSuccessResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isSuccessResponse(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isSuccessResponse('string')).toBe(false);
      expect(isSuccessResponse(123)).toBe(false);
      expect(isSuccessResponse([])).toBe(false);
    });

    it('should return false for object without success field', () => {
      expect(isSuccessResponse({ data: {} })).toBe(false);
    });

    it('should return false for object without data field', () => {
      expect(isSuccessResponse({ success: true })).toBe(false);
    });
  });
});
