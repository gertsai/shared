/**
 * Unit tests for Typia Params Helpers
 *
 * @see RFC-065-TYPIA-VALIDATOR-MOLECULER.md
 */

import { describe, it, expect } from 'vitest';
import typia from 'typia';
import {
  createTypiaParams,
  createQueryParams,
  createBodyParams,
  isTypiaParamsWithSchema,
  isTypiaValidator,
  getValidator,
  getNumericFields,
  getBooleanFields,
  getArrayFields,
  getProperties,
} from './typia-params';

// Test interface
interface TestParams {
  id: string;
  limit?: number;
  offset?: number;
  active?: boolean;
  tags?: string[];
}

// Pre-create validator and schema (typia requires compile-time types)
const testValidator = typia.createValidate<TestParams>();
const testSchema = typia.json.schemas<[TestParams]>();

describe('createTypiaParams', () => {
  it('should create params with validate function', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(params.validate).toBe(testValidator);
    expect(typeof params.validate).toBe('function');
  });

  it('should extract numeric fields from schema', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(params.numericFields).toContain('limit');
    expect(params.numericFields).toContain('offset');
    expect(params.numericFields).not.toContain('id');
    expect(params.numericFields).not.toContain('active');
  });

  it('should extract boolean fields from schema', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(params.booleanFields).toContain('active');
    expect(params.booleanFields).not.toContain('id');
    expect(params.booleanFields).not.toContain('limit');
  });

  it('should extract array fields from schema', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(params.arrayFields).toContain('tags');
    expect(params.arrayFields).not.toContain('id');
  });

  it('should generate properties for REPL', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(params.properties.id).toBeDefined();
    expect(params.properties.id.type).toBe('string');
    expect(params.properties.id.optional).toBe(false);

    expect(params.properties.limit).toBeDefined();
    expect(params.properties.limit.optional).toBe(true);
  });

  it('should have marker property', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(params.__typia_params_with_schema__).toBe(true);
  });
});

describe('createQueryParams', () => {
  it('should be alias for createTypiaParams', () => {
    const params = createQueryParams(testValidator, testSchema);

    expect(params.validate).toBe(testValidator);
    expect(params.numericFields.length).toBeGreaterThan(0);
    expect(params.__typia_params_with_schema__).toBe(true);
  });
});

describe('createBodyParams', () => {
  it('should clear coercion fields', () => {
    const params = createBodyParams(testValidator, testSchema);

    expect(params.validate).toBe(testValidator);
    expect(params.numericFields).toEqual([]);
    expect(params.booleanFields).toEqual([]);
    expect(params.arrayFields).toEqual([]);
  });

  it('should keep properties for REPL', () => {
    const params = createBodyParams(testValidator, testSchema);

    expect(Object.keys(params.properties).length).toBeGreaterThan(0);
  });
});

describe('isTypiaParamsWithSchema', () => {
  it('should return true for TypiaParamsWithSchema', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(isTypiaParamsWithSchema(params)).toBe(true);
  });

  it('should return false for validator function', () => {
    expect(isTypiaParamsWithSchema(testValidator)).toBe(false);
  });

  it('should return false for plain object', () => {
    expect(isTypiaParamsWithSchema({} as any)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isTypiaParamsWithSchema(null as any)).toBe(false);
    expect(isTypiaParamsWithSchema(undefined as any)).toBe(false);
  });
});

describe('isTypiaValidator', () => {
  it('should return true for validator function', () => {
    expect(isTypiaValidator(testValidator)).toBe(true);
  });

  it('should return false for TypiaParamsWithSchema', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(isTypiaValidator(params)).toBe(false);
  });
});

describe('getValidator', () => {
  it('should return validator from TypiaParamsWithSchema', () => {
    const params = createTypiaParams(testValidator, testSchema);

    expect(getValidator(params)).toBe(testValidator);
  });

  it('should return validator function as-is', () => {
    expect(getValidator(testValidator)).toBe(testValidator);
  });
});

describe('getNumericFields', () => {
  it('should return fields from TypiaParamsWithSchema', () => {
    const params = createTypiaParams(testValidator, testSchema);
    const fields = getNumericFields(params);

    expect(fields).toContain('limit');
    expect(fields).toContain('offset');
  });

  it('should return empty array for validator function', () => {
    expect(getNumericFields(testValidator)).toEqual([]);
  });
});

describe('getBooleanFields', () => {
  it('should return fields from TypiaParamsWithSchema', () => {
    const params = createTypiaParams(testValidator, testSchema);
    const fields = getBooleanFields(params);

    expect(fields).toContain('active');
  });

  it('should return empty array for validator function', () => {
    expect(getBooleanFields(testValidator)).toEqual([]);
  });
});

describe('getArrayFields', () => {
  it('should return fields from TypiaParamsWithSchema', () => {
    const params = createTypiaParams(testValidator, testSchema);
    const fields = getArrayFields(params);

    expect(fields).toContain('tags');
  });

  it('should return empty array for validator function', () => {
    expect(getArrayFields(testValidator)).toEqual([]);
  });
});

describe('getProperties', () => {
  it('should return properties from TypiaParamsWithSchema', () => {
    const params = createTypiaParams(testValidator, testSchema);
    const props = getProperties(params);

    expect(props.id).toBeDefined();
    expect(props.limit).toBeDefined();
  });

  it('should return empty object for validator function', () => {
    expect(getProperties(testValidator)).toEqual({});
  });
});

describe('validation functionality', () => {
  it('should validate correct params', () => {
    const params = createTypiaParams(testValidator, testSchema);
    const result = params.validate({ id: 'test-id' });

    expect(result.success).toBe(true);
  });

  it('should reject invalid params', () => {
    const params = createTypiaParams(testValidator, testSchema);
    const result = params.validate({ id: 123 }); // id should be string

    expect(result.success).toBe(false);
  });

  it('should validate optional fields', () => {
    const params = createTypiaParams(testValidator, testSchema);

    // With optional fields
    const result1 = params.validate({
      id: 'test',
      limit: 10,
      offset: 0,
      active: true,
      tags: ['a', 'b'],
    });
    expect(result1.success).toBe(true);

    // Without optional fields
    const result2 = params.validate({ id: 'test' });
    expect(result2.success).toBe(true);
  });
});
