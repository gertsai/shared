/**
 * TypiaOutputParser Tests
 *
 * Tests for the Typia-based LLM output parser.
 */

import { describe, it, expect, vi } from 'vitest';
import typia from 'typia';
import { TypiaOutputParser, createTypiaParser, type ValidationFeedback } from './typia-parser';

// Test interfaces
interface SimplePerson {
  name: string;
  age: number;
}

interface NestedUser {
  user: {
    name: string;
    email: string;
  };
  score: number;
}

interface EntityExtraction {
  entities: Array<{
    name: string;
    type: 'PERSON' | 'ORGANIZATION' | 'LOCATION';
    confidence: number;
  }>;
  relationships: Array<{
    subject: string;
    predicate: string;
    object: string;
  }>;
}

interface WithOptional {
  required: string;
  optional?: string;
}

interface WithEnum {
  status: 'active' | 'inactive';
}

// Create validators at compile time
const validateSimplePerson = typia.createValidate<SimplePerson>();
const validateNestedUser = typia.createValidate<NestedUser>();
const validateEntityExtraction = typia.createValidate<EntityExtraction>();
const validateWithOptional = typia.createValidate<WithOptional>();
const validateWithEnum = typia.createValidate<WithEnum>();
const validateStringArray = typia.createValidate<string[]>();
const validateNumberArray = typia.createValidate<number[]>();

describe('TypiaOutputParser', () => {
  describe('Basic parsing', () => {
    it('should parse valid JSON string', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = '{"name": "Alice", "age": 30}';

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should parse valid JSON array', async () => {
      const parser = new TypiaOutputParser(validateStringArray);
      const input = '["apple", "banana", "cherry"]';

      const result = await parser.parse(input);

      expect(result).toEqual(['apple', 'banana', 'cherry']);
    });

    it('should parse nested objects', async () => {
      const parser = new TypiaOutputParser(validateNestedUser);
      const input = JSON.stringify({
        user: { name: 'Bob', email: 'bob@example.com' },
        score: 95,
      });

      const result = await parser.parse(input);

      expect(result).toEqual({
        user: { name: 'Bob', email: 'bob@example.com' },
        score: 95,
      });
    });
  });

  describe('Markdown extraction', () => {
    it('should extract JSON from markdown code block', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = `
Here is the result:

\`\`\`json
{"name": "Test", "age": 42}
\`\`\`

Hope this helps!
      `;

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'Test', age: 42 });
    });

    it('should extract JSON from code block without language tag', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = `
\`\`\`
{"name": "Test", "age": 7}
\`\`\`
      `;

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'Test', age: 7 });
    });

    it('should extract JSON from plain text with surrounding content', async () => {
      const parser = new TypiaOutputParser(validateWithEnum);
      const input = 'The result is {"status": "active"} and it worked!';

      const result = await parser.parse(input);

      expect(result).toEqual({ status: 'active' });
    });

    it('should extract array from plain text', async () => {
      const parser = new TypiaOutputParser(validateNumberArray);
      const input = 'Numbers: [1, 2, 3, 4, 5]';

      const result = await parser.parse(input);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('JSON fixing', () => {
    it('should fix trailing commas in objects', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = '{"name": "test", "age": 1,}';

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'test', age: 1 });
    });

    it('should fix trailing commas in arrays', async () => {
      const parser = new TypiaOutputParser(validateStringArray);
      const input = '["x", "y", "z",]';

      const result = await parser.parse(input);

      expect(result).toEqual(['x', 'y', 'z']);
    });

    it('should fix single quotes to double quotes', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = "{'name': 'test', 'age': 25}";

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'test', age: 25 });
    });

    it('should remove single-line comments', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = `{
        "name": "test", // this is a comment
        "age": 10
      }`;

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'test', age: 10 });
    });

    it('should remove multi-line comments', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = `{
        /* multi-line
           comment */
        "name": "value",
        "age": 20
      }`;

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'value', age: 20 });
    });

    it('should fix multiple issues at once', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = `{
        'name': 'test', // user name
        'age': 30, /* number */
      }`;

      const result = await parser.parse(input);

      expect(result).toEqual({
        name: 'test',
        age: 30,
      });
    });
  });

  describe('Validation errors', () => {
    it('should throw on validation error with field info', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = '{"name": "test", "age": "not a number"}';

      await expect(parser.parse(input)).rejects.toThrow('Validation error');
    });

    it('should throw on missing required field', async () => {
      const parser = new TypiaOutputParser(validateWithOptional);
      const input = '{}';

      await expect(parser.parse(input)).rejects.toThrow('Validation error');
    });

    it('should throw on invalid enum value', async () => {
      const parser = new TypiaOutputParser(validateWithEnum);
      const input = '{"status": "unknown"}';

      await expect(parser.parse(input)).rejects.toThrow('Validation error');
    });
  });

  describe('Parsing errors', () => {
    it('should throw on completely invalid JSON', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = 'this is not json at all';

      await expect(parser.parse(input)).rejects.toThrow('JSON parsing error');
    });

    it('should throw on unfixable JSON', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = '{"name": "test"';

      await expect(parser.parse(input)).rejects.toThrow('JSON parsing error');
    });
  });

  describe('Format instructions', () => {
    it('should generate instructions with schema description', () => {
      const schemaDescription = {
        name: 'string',
        age: 'number',
      };

      const parser = new TypiaOutputParser(validateSimplePerson, schemaDescription);
      const instructions = parser.getFormatInstructions();

      expect(instructions).toContain('JSON');
      expect(instructions).toContain('name');
      expect(instructions).toContain('age');
      expect(instructions).toContain('string');
      expect(instructions).toContain('number');
    });

    it('should generate basic instructions without schema', () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const instructions = parser.getFormatInstructions();

      expect(instructions).toContain('JSON');
    });
  });

  describe('Complex schemas', () => {
    it('should parse entity extraction schema', async () => {
      const parser = new TypiaOutputParser(validateEntityExtraction);
      const input = `\`\`\`json
{
  "entities": [
    {"name": "Alice", "type": "PERSON", "confidence": 0.95},
    {"name": "Acme Corp", "type": "ORGANIZATION", "confidence": 0.88}
  ],
  "relationships": [
    {"subject": "Alice", "predicate": "WORKS_FOR", "object": "Acme Corp"}
  ]
}
\`\`\``;

      const result = await parser.parse(input);

      expect(result.entities).toHaveLength(2);
      expect(result.entities[0].name).toBe('Alice');
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].predicate).toBe('WORKS_FOR');
    });

    it('should parse with optional fields', async () => {
      const parser = new TypiaOutputParser(validateWithOptional);
      const input = '{"required": "value"}';

      const result = await parser.parse(input);

      expect(result).toEqual({ required: 'value' });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty array', async () => {
      const parser = new TypiaOutputParser(validateStringArray);
      const input = '[]';

      const result = await parser.parse(input);

      expect(result).toEqual([]);
    });

    it('should handle whitespace in JSON', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = `
        {
          "name"   :   "test",
          "age": 42
        }
      `;

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'test', age: 42 });
    });

    it('should handle unicode characters', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const input = '{"name": "Hello 世界 🌍", "age": 25}';

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'Hello 世界 🌍', age: 25 });
    });
  });

  describe('createTypiaParser helper', () => {
    it('should create parser with factory function', async () => {
      const parser = createTypiaParser(validateSimplePerson);
      const result = await parser.parse('{"name": "Factory", "age": 99}');

      expect(result).toEqual({ name: 'Factory', age: 99 });
    });
  });

  // ============================================================================
  // Validation Feedback Strategy Tests
  // ============================================================================

  describe('safeParse (Validation Feedback Strategy)', () => {
    it('should return success with data for valid input', () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const result = parser.safeParse('{"name": "Alice", "age": 30}');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'Alice', age: 30 });
      }
    });

    it('should return failure with feedback for invalid input', () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const result = parser.safeParse('{"name": "Alice", "age": "not a number"}');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.feedback.errors.length).toBeGreaterThan(0);
        expect(result.feedback.message).toContain('validation errors');
      }
    });

    it('should return failure with feedback for missing required field', () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const result = parser.safeParse('{"name": "Alice"}');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.feedback.message).toContain('age');
      }
    });

    it('should return failure for invalid JSON', () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const result = parser.safeParse('not valid json');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.feedback.message).toContain('JSON');
      }
    });

    it('should include hint for non-numeric value when number expected', () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const result = parser.safeParse('{"name": "Alice", "age": "not-a-number"}');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.feedback.message).toContain('numeric');
      }
    });

    it('should include hint for missing string', () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const result = parser.safeParse('{"age": 25}');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.feedback.message).toContain('string');
      }
    });

    it('should include hint for invalid enum', () => {
      const parser = new TypiaOutputParser(validateWithEnum);
      const result = parser.safeParse('{"status": "unknown"}');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.feedback.message).toContain('allowed values');
      }
    });
  });

  describe('parseWithRetry (Validation Feedback Strategy)', () => {
    it('should return data on first successful parse', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const retryFn = vi.fn();

      const result = await parser.parseWithRetry('{"name": "Alice", "age": 30}', retryFn);

      expect(result).toEqual({ name: 'Alice', age: 30 });
      expect(retryFn).not.toHaveBeenCalled();
    });

    it('should retry and succeed on second attempt', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      const retryFn = vi.fn().mockResolvedValueOnce('{"name": "Bob", "age": 25}');

      const result = await parser.parseWithRetry(
        '{"name": "Alice", "age": "invalid"}', // First attempt fails
        retryFn,
      );

      expect(result).toEqual({ name: 'Bob', age: 25 });
      expect(retryFn).toHaveBeenCalledTimes(1);
      expect(retryFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('validation errors'),
        }),
      );
    });

    it('should retry multiple times before succeeding', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson, undefined, { maxRetries: 3 });
      const retryFn = vi
        .fn()
        .mockResolvedValueOnce('{"name": "still bad"}') // 2nd attempt fails
        .mockResolvedValueOnce('{"name": "Alice", "age": 30}'); // 3rd attempt succeeds

      const result = await parser.parseWithRetry(
        '{"name": "bad"}', // 1st attempt fails
        retryFn,
      );

      expect(result).toEqual({ name: 'Alice', age: 30 });
      expect(retryFn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries exceeded', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson, undefined, { maxRetries: 2 });
      const retryFn = vi.fn().mockResolvedValue('{"name": "always invalid"}'); // Always fails

      await expect(parser.parseWithRetry('{"name": "bad"}', retryFn)).rejects.toThrow(
        'Validation failed after 3 attempts',
      );

      expect(retryFn).toHaveBeenCalledTimes(2);
    });

    it('should pass detailed feedback to retry function', async () => {
      const parser = new TypiaOutputParser(validateSimplePerson);
      let capturedFeedback: ValidationFeedback | null = null;
      const retryFn = vi.fn().mockImplementation((feedback: ValidationFeedback) => {
        capturedFeedback = feedback;
        return Promise.resolve('{"name": "Fixed", "age": 42}');
      });

      await parser.parseWithRetry('{"name": 123, "age": "wrong"}', retryFn);

      expect(capturedFeedback).not.toBeNull();
      expect(capturedFeedback!.errors).toBeInstanceOf(Array);
      expect(capturedFeedback!.message).toBeTruthy();
      expect(capturedFeedback!.input).toBeDefined();
    });
  });
});
