/**
 * Type Guards Tests
 *
 * Tests for RFC-030 type guards in envelope/type-guards.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  isOrchestraInfo,
  assertOrchestraInfo,
  getOrchestraInfo,
  isTenantContextMeta,
  extractTenantId,
  extractTraceId,
  extractRequestId,
  isUsageInfo,
  extractUsageInfo,
  extractPackageInfo,
  wantsLegacyFormat,
  // SEC-002: Tenant ID validation
  validateTenantIdFormat,
  isTenantIdValid,
  TENANT_ID_REGEX,
} from '../lib/envelope/type-guards';

// ============================================================================
// OrchestraInfo Tests
// ============================================================================

describe('OrchestraInfo Guards', () => {
  describe('isOrchestraInfo', () => {
    it('should return true for valid OrchestraInfo', () => {
      expect(isOrchestraInfo({ success: true, http_code: 200 })).toBe(true);
      expect(isOrchestraInfo({ success: false, message: 'Error' })).toBe(true);
      expect(isOrchestraInfo({ code: '200/ok' })).toBe(true);
      expect(isOrchestraInfo({})).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isOrchestraInfo(null)).toBe(false);
      expect(isOrchestraInfo(undefined)).toBe(false);
      expect(isOrchestraInfo('string')).toBe(false);
      expect(isOrchestraInfo(123)).toBe(false);
      expect(isOrchestraInfo([])).toBe(false);
    });

    it('should return false for invalid field types', () => {
      expect(isOrchestraInfo({ success: 'true' })).toBe(false);
      expect(isOrchestraInfo({ http_code: '200' })).toBe(false);
      expect(isOrchestraInfo({ message: 123 })).toBe(false);
      expect(isOrchestraInfo({ raw: 'true' })).toBe(false);
    });
  });

  describe('assertOrchestraInfo', () => {
    it('should not throw for valid OrchestraInfo', () => {
      expect(() => assertOrchestraInfo({ success: true })).not.toThrow();
    });

    it('should throw for invalid OrchestraInfo', () => {
      expect(() => assertOrchestraInfo(null)).toThrow('Invalid OrchestraInfo structure');
      expect(() => assertOrchestraInfo({ success: 'true' })).toThrow();
    });
  });

  describe('getOrchestraInfo', () => {
    it('should return value if valid', () => {
      const info = { success: true, http_code: 200 };
      expect(getOrchestraInfo(info)).toEqual(info);
    });

    it('should return fallback for invalid value', () => {
      const fallback = getOrchestraInfo(null);
      expect(fallback.success).toBe(false);
      expect(fallback.http_code).toBe(500);
      expect(fallback.message).toBe('Unknown error');
    });
  });
});

// ============================================================================
// TenantContextMeta Tests
// ============================================================================

describe('TenantContextMeta Guards', () => {
  describe('isTenantContextMeta', () => {
    it('should return true for valid context meta', () => {
      expect(isTenantContextMeta({ tenantId: 'demo' })).toBe(true);
      expect(isTenantContextMeta({ tenantId: 'demo', traceId: 'abc' })).toBe(true);
      expect(isTenantContextMeta({})).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isTenantContextMeta(null)).toBe(false);
      expect(isTenantContextMeta(undefined)).toBe(false);
      expect(isTenantContextMeta('string')).toBe(false);
    });
  });

  describe('extractTenantId', () => {
    it('should extract tenant ID from valid meta', () => {
      expect(extractTenantId({ tenantId: 'demo' })).toBe('demo');
      expect(extractTenantId({ tenantId: 'test-tenant' })).toBe('test-tenant');
    });

    it('should return fallback for missing tenant ID', () => {
      expect(extractTenantId({})).toBe('default');
      expect(extractTenantId({}, 'fallback')).toBe('fallback');
    });

    it('should return fallback for empty tenant ID', () => {
      expect(extractTenantId({ tenantId: '' })).toBe('default');
    });

    it('should return fallback for non-string tenant ID', () => {
      expect(extractTenantId({ tenantId: 123 })).toBe('default');
      expect(extractTenantId({ tenantId: null })).toBe('default');
    });

    it('should return fallback for invalid meta', () => {
      expect(extractTenantId(null)).toBe('default');
      expect(extractTenantId(undefined)).toBe('default');
    });
  });

  describe('extractTraceId', () => {
    it('should extract trace ID from valid meta', () => {
      expect(extractTraceId({ traceId: 'trace-123' })).toBe('trace-123');
    });

    it('should return undefined for missing trace ID', () => {
      expect(extractTraceId({})).toBeUndefined();
    });

    it('should return undefined for empty trace ID', () => {
      expect(extractTraceId({ traceId: '' })).toBeUndefined();
    });

    it('should return undefined for invalid meta', () => {
      expect(extractTraceId(null)).toBeUndefined();
    });
  });

  describe('extractRequestId', () => {
    it('should extract request ID from valid meta', () => {
      expect(extractRequestId({ requestId: 'req_123' })).toBe('req_123');
    });

    it('should return undefined for missing request ID', () => {
      expect(extractRequestId({})).toBeUndefined();
    });

    it('should return undefined for empty request ID', () => {
      expect(extractRequestId({ requestId: '' })).toBeUndefined();
    });

    it('should return undefined for invalid meta', () => {
      expect(extractRequestId(null)).toBeUndefined();
    });
  });
});

// ============================================================================
// UsageInfo Tests
// ============================================================================

describe('UsageInfo Guards', () => {
  describe('isUsageInfo', () => {
    it('should return true for valid UsageInfo', () => {
      expect(
        isUsageInfo({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        }),
      ).toBe(true);
    });

    it('should return true for UsageInfo with optional fields', () => {
      expect(
        isUsageInfo({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          graph_traversals: 5,
          vector_searches: 3,
          processing_time_ms: 1000,
        }),
      ).toBe(true);
    });

    it('should return false for missing required fields', () => {
      expect(isUsageInfo({ prompt_tokens: 100 })).toBe(false);
      expect(isUsageInfo({ prompt_tokens: 100, completion_tokens: 50 })).toBe(false);
    });

    it('should return false for negative values', () => {
      expect(
        isUsageInfo({
          prompt_tokens: -1,
          completion_tokens: 50,
          total_tokens: 150,
        }),
      ).toBe(false);
    });

    it('should return false for non-numeric values', () => {
      expect(
        isUsageInfo({
          prompt_tokens: '100',
          completion_tokens: 50,
          total_tokens: 150,
        }),
      ).toBe(false);
    });

    it('should return false for invalid optional fields', () => {
      expect(
        isUsageInfo({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          graph_traversals: -1,
        }),
      ).toBe(false);
    });
  });

  describe('extractUsageInfo', () => {
    it('should extract usage from data.usage', () => {
      const data = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };
      expect(extractUsageInfo(data)).toEqual(data.usage);
    });

    it('should extract usage from data._meta', () => {
      const data = {
        _meta: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          processingTime: 1000,
        },
      };
      const usage = extractUsageInfo(data);
      expect(usage).toBeDefined();
      expect(usage?.prompt_tokens).toBe(100);
      expect(usage?.completion_tokens).toBe(50);
      expect(usage?.total_tokens).toBe(150);
      expect(usage?.processing_time_ms).toBe(1000);
    });

    it('should return undefined for missing usage', () => {
      expect(extractUsageInfo({})).toBeUndefined();
      expect(extractUsageInfo({ data: 'value' })).toBeUndefined();
    });

    it('should return undefined for invalid data', () => {
      expect(extractUsageInfo(null)).toBeUndefined();
      expect(extractUsageInfo(undefined)).toBeUndefined();
      expect(extractUsageInfo('string')).toBeUndefined();
    });

    it('should return undefined for invalid usage object', () => {
      expect(extractUsageInfo({ usage: 'invalid' })).toBeUndefined();
      expect(extractUsageInfo({ usage: { prompt_tokens: 'not a number' } })).toBeUndefined();
    });
  });
});

// ============================================================================
// PackageJson Tests
// ============================================================================

describe('PackageJson Guards', () => {
  describe('extractPackageInfo', () => {
    it('should extract name and version from valid package.json', () => {
      const pkg = { name: '@gerts/test', version: '1.2.3' };
      expect(extractPackageInfo(pkg)).toEqual({ name: '@gerts/test', version: '1.2.3' });
    });

    it('should return defaults for missing fields', () => {
      expect(extractPackageInfo({})).toEqual({
        name: '@gerts/pipeline',
        version: '1.0.0',
      });
    });

    it('should return defaults for non-string fields', () => {
      expect(extractPackageInfo({ name: 123, version: true })).toEqual({
        name: '@gerts/pipeline',
        version: '1.0.0',
      });
    });

    it('should return defaults for invalid input', () => {
      expect(extractPackageInfo(null)).toEqual({
        name: '@gerts/pipeline',
        version: '1.0.0',
      });
      expect(extractPackageInfo(undefined)).toEqual({
        name: '@gerts/pipeline',
        version: '1.0.0',
      });
    });

    it('should handle partial package.json', () => {
      expect(extractPackageInfo({ name: '@gerts/partial' })).toEqual({
        name: '@gerts/partial',
        version: '1.0.0',
      });
      expect(extractPackageInfo({ version: '2.0.0' })).toEqual({
        name: '@gerts/pipeline',
        version: '2.0.0',
      });
    });
  });
});

// ============================================================================
// Request Format Tests
// ============================================================================

describe('Request Format Detection', () => {
  describe('wantsLegacyFormat', () => {
    it('should return false for null/undefined request', () => {
      expect(wantsLegacyFormat(null)).toBe(false);
      expect(wantsLegacyFormat(undefined)).toBe(false);
    });

    it('should return false for empty request', () => {
      expect(wantsLegacyFormat({})).toBe(false);
    });

    it('should detect legacy format from query param', () => {
      expect(wantsLegacyFormat({ query: { format: 'legacy' } })).toBe(true);
      expect(wantsLegacyFormat({ query: { format: 'json' } })).toBe(false);
    });

    it('should detect legacy format from query param array', () => {
      expect(wantsLegacyFormat({ query: { format: ['legacy', 'other'] } })).toBe(true);
      expect(wantsLegacyFormat({ query: { format: ['json', 'xml'] } })).toBe(false);
    });

    it('should detect legacy format from Accept header', () => {
      expect(
        wantsLegacyFormat({
          headers: { accept: 'application/vnd.orchestra+json' },
        }),
      ).toBe(true);
    });

    it('should detect legacy format from Accept header with multiple types', () => {
      expect(
        wantsLegacyFormat({
          headers: { accept: 'application/json, application/vnd.orchestra+json' },
        }),
      ).toBe(true);
    });

    it('should return false for standard Accept header', () => {
      expect(
        wantsLegacyFormat({
          headers: { accept: 'application/json' },
        }),
      ).toBe(false);
    });

    it('should handle Accept header as array', () => {
      expect(
        wantsLegacyFormat({
          headers: { accept: ['application/json', 'application/vnd.orchestra+json'] },
        }),
      ).toBe(true);
    });
  });
});

// ============================================================================
// SEC-002: Tenant ID Validation Tests
// ============================================================================

describe('Tenant ID Validation (SEC-002)', () => {
  describe('validateTenantIdFormat', () => {
    it('should accept valid alphanumeric tenant IDs', () => {
      expect(validateTenantIdFormat('tenant123')).toBe('tenant123');
      expect(validateTenantIdFormat('TENANT')).toBe('TENANT');
      expect(validateTenantIdFormat('12345')).toBe('12345');
    });

    it('should accept underscores and hyphens', () => {
      expect(validateTenantIdFormat('tenant_123')).toBe('tenant_123');
      expect(validateTenantIdFormat('tenant-123')).toBe('tenant-123');
      expect(validateTenantIdFormat('tenant_test-123')).toBe('tenant_test-123');
    });

    it('should accept single character tenant IDs', () => {
      expect(validateTenantIdFormat('a')).toBe('a');
      expect(validateTenantIdFormat('1')).toBe('1');
    });

    it('should accept 64 character tenant IDs', () => {
      const maxLength = 'a'.repeat(64);
      expect(validateTenantIdFormat(maxLength)).toBe(maxLength);
    });

    it('should reject empty string', () => {
      expect(validateTenantIdFormat('')).toBe(null);
    });

    it('should reject null/undefined', () => {
      expect(validateTenantIdFormat(null)).toBe(null);
      expect(validateTenantIdFormat(undefined)).toBe(null);
    });

    it('should reject IDs over 64 characters', () => {
      const tooLong = 'a'.repeat(65);
      expect(validateTenantIdFormat(tooLong)).toBe(null);
    });

    it('should reject special characters', () => {
      expect(validateTenantIdFormat('tenant@123')).toBe(null);
      expect(validateTenantIdFormat('tenant.123')).toBe(null);
      expect(validateTenantIdFormat('tenant/123')).toBe(null);
      expect(validateTenantIdFormat('tenant 123')).toBe(null);
    });

    it('should reject CRLF injection attempts', () => {
      expect(validateTenantIdFormat('evil\r\nSET hack 1')).toBe(null);
      expect(validateTenantIdFormat('tenant\n')).toBe(null);
      expect(validateTenantIdFormat('tenant\r')).toBe(null);
    });

    it('should reject null byte injection', () => {
      expect(validateTenantIdFormat('tenant\0evil')).toBe(null);
    });

    it('should reject Redis command injection', () => {
      expect(validateTenantIdFormat('*3\r\n$3\r\nSET')).toBe(null);
    });

    it('should reject path traversal attempts', () => {
      expect(validateTenantIdFormat('../../../etc/passwd')).toBe(null);
      expect(validateTenantIdFormat('..\\..\\etc')).toBe(null);
    });
  });

  describe('isTenantIdValid', () => {
    it('should return true for valid tenant IDs', () => {
      expect(isTenantIdValid('valid-tenant')).toBe(true);
      expect(isTenantIdValid('tenant_123')).toBe(true);
    });

    it('should return false for invalid tenant IDs', () => {
      expect(isTenantIdValid('')).toBe(false);
      expect(isTenantIdValid(null)).toBe(false);
      expect(isTenantIdValid('invalid@tenant')).toBe(false);
    });
  });

  describe('TENANT_ID_REGEX', () => {
    it('should match valid patterns', () => {
      expect(TENANT_ID_REGEX.test('abc')).toBe(true);
      expect(TENANT_ID_REGEX.test('ABC123')).toBe(true);
      expect(TENANT_ID_REGEX.test('a-b_c')).toBe(true);
    });

    it('should not match invalid patterns', () => {
      expect(TENANT_ID_REGEX.test('')).toBe(false);
      expect(TENANT_ID_REGEX.test('a@b')).toBe(false);
      expect(TENANT_ID_REGEX.test('a b')).toBe(false);
    });
  });
});
