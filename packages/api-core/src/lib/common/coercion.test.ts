/**
 * Unit tests for Query Parameter Coercion
 *
 * @see RFC-065-TYPIA-VALIDATOR-MOLECULER.md
 */

import { describe, it, expect } from 'vitest';
import {
  coerceNumericFields,
  coerceBooleanFields,
  coerceArrayFields,
  smartCoerce,
  coerceQueryParams,
} from './coercion';

describe('coerceNumericFields', () => {
  it('should coerce string numbers to numbers', () => {
    const params = { limit: '10', offset: '0', name: 'test' };
    coerceNumericFields(params, ['limit', 'offset']);

    expect(params.limit).toBe(10);
    expect(params.offset).toBe(0);
    expect(params.name).toBe('test');
  });

  it('should handle decimal numbers', () => {
    const params = { score: '0.75', threshold: '1.5' };
    coerceNumericFields(params, ['score', 'threshold']);

    expect(params.score).toBe(0.75);
    expect(params.threshold).toBe(1.5);
  });

  it('should handle negative numbers', () => {
    const params = { offset: '-10', delta: '-0.5' };
    coerceNumericFields(params, ['offset', 'delta']);

    expect(params.offset).toBe(-10);
    expect(params.delta).toBe(-0.5);
  });

  it('should not coerce non-numeric strings', () => {
    const params = { limit: 'abc', offset: 'NaN' };
    coerceNumericFields(params, ['limit', 'offset']);

    expect(params.limit).toBe('abc');
    expect(params.offset).toBe('NaN');
  });

  it('should not modify already numeric values', () => {
    const params = { limit: 10, offset: 0 };
    coerceNumericFields(params, ['limit', 'offset']);

    expect(params.limit).toBe(10);
    expect(params.offset).toBe(0);
  });

  it('should handle undefined and null values', () => {
    const params = { limit: undefined, offset: null, page: '1' };
    coerceNumericFields(params, ['limit', 'offset', 'page']);

    expect(params.limit).toBeUndefined();
    expect(params.offset).toBeNull();
    expect(params.page).toBe(1);
  });

  it('should handle empty string', () => {
    const params = { limit: '' };
    coerceNumericFields(params, ['limit']);

    // Empty string converts to 0 via Number('')
    expect(params.limit).toBe(0);
  });
});

describe('coerceBooleanFields', () => {
  it('should coerce "true" and "false" strings', () => {
    const params = { active: 'true', deleted: 'false' };
    coerceBooleanFields(params, ['active', 'deleted']);

    expect(params.active).toBe(true);
    expect(params.deleted).toBe(false);
  });

  it('should coerce "1" and "0" strings', () => {
    const params = { enabled: '1', disabled: '0' };
    coerceBooleanFields(params, ['enabled', 'disabled']);

    expect(params.enabled).toBe(true);
    expect(params.disabled).toBe(false);
  });

  it('should coerce "yes" and "no" strings', () => {
    const params = { confirmed: 'yes', rejected: 'no' };
    coerceBooleanFields(params, ['confirmed', 'rejected']);

    expect(params.confirmed).toBe(true);
    expect(params.rejected).toBe(false);
  });

  it('should be case-insensitive', () => {
    const params = { a: 'TRUE', b: 'False', c: 'YES', d: 'NO' };
    coerceBooleanFields(params, ['a', 'b', 'c', 'd']);

    expect(params.a).toBe(true);
    expect(params.b).toBe(false);
    expect(params.c).toBe(true);
    expect(params.d).toBe(false);
  });

  it('should not coerce unrecognized strings', () => {
    const params = { maybe: 'maybe', empty: '' };
    coerceBooleanFields(params, ['maybe', 'empty']);

    expect(params.maybe).toBe('maybe');
    expect(params.empty).toBe('');
  });

  it('should not modify already boolean values', () => {
    const params = { active: true, deleted: false };
    coerceBooleanFields(params, ['active', 'deleted']);

    expect(params.active).toBe(true);
    expect(params.deleted).toBe(false);
  });
});

describe('coerceArrayFields', () => {
  it('should split comma-separated strings into arrays', () => {
    const params = { tags: 'a,b,c' };
    coerceArrayFields(params, ['tags']);

    expect(params.tags).toEqual(['a', 'b', 'c']);
  });

  it('should trim whitespace from array elements', () => {
    const params = { tags: 'a , b , c' };
    coerceArrayFields(params, ['tags']);

    expect(params.tags).toEqual(['a', 'b', 'c']);
  });

  it('should filter empty elements', () => {
    const params = { tags: 'a,,b,  ,c' };
    coerceArrayFields(params, ['tags']);

    expect(params.tags).toEqual(['a', 'b', 'c']);
  });

  it('should not split strings without commas', () => {
    const params = { tag: 'single' };
    coerceArrayFields(params, ['tag']);

    expect(params.tag).toBe('single');
  });

  it('should not modify already array values', () => {
    const params = { tags: ['a', 'b', 'c'] };
    coerceArrayFields(params, ['tags']);

    expect(params.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('smartCoerce', () => {
  it('should apply all coercions in correct order', () => {
    const params = {
      limit: '10',
      active: 'true',
      tags: 'a,b,c',
      name: 'test',
    };

    smartCoerce(params, {
      numericFields: ['limit'],
      booleanFields: ['active'],
      arrayFields: ['tags'],
    });

    expect(params).toEqual({
      limit: 10,
      active: true,
      tags: ['a', 'b', 'c'],
      name: 'test',
    });
  });

  it('should handle empty schema', () => {
    const params = { limit: '10' };
    smartCoerce(params, {});

    expect(params.limit).toBe('10');
  });

  it('should handle partial schema', () => {
    const params = { limit: '10', active: 'true' };
    smartCoerce(params, { numericFields: ['limit'] });

    expect(params.limit).toBe(10);
    expect(params.active).toBe('true');
  });

  it('should process arrays before primitives', () => {
    // This ensures array fields are split before numeric coercion
    // (though typically these wouldn't overlap)
    const params = { ids: '1,2,3' };
    smartCoerce(params, {
      arrayFields: ['ids'],
      numericFields: [], // ids not coerced to number
    });

    expect(params.ids).toEqual(['1', '2', '3']);
  });
});

describe('coerceQueryParams (legacy)', () => {
  it('should coerce common numeric params', () => {
    const params = {
      limit: '10',
      offset: '0',
      page: '1',
      topK: '5',
      maxTokens: '100',
      priority: '3',
    };

    coerceQueryParams(params);

    expect(params.limit).toBe(10);
    expect(params.offset).toBe(0);
    expect(params.page).toBe(1);
    expect(params.topK).toBe(5);
    expect(params.maxTokens).toBe(100);
    expect(params.priority).toBe(3);
  });

  it('should not affect non-numeric params', () => {
    const params = {
      limit: '10',
      name: 'test',
      status: 'active',
    };

    coerceQueryParams(params);

    expect(params.limit).toBe(10);
    expect(params.name).toBe('test');
    expect(params.status).toBe('active');
  });
});
