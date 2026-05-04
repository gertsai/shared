import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ZodOutputParser } from './zod-parser';

describe('ZodOutputParser', () => {
  describe('Basic parsing', () => {
    it('should parse valid JSON string', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{"name": "Alice", "age": 30}';

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should parse valid JSON array', async () => {
      const schema = z.array(z.string());

      const parser = new ZodOutputParser(schema);
      const input = '["apple", "banana", "cherry"]';

      const result = await parser.parse(input);

      expect(result).toEqual(['apple', 'banana', 'cherry']);
    });

    it('should parse nested objects', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
        score: z.number(),
      });

      const parser = new ZodOutputParser(schema);
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
      const schema = z.object({ value: z.number() });

      const parser = new ZodOutputParser(schema);
      const input = `
Here is the result:

\`\`\`json
{"value": 42}
\`\`\`

Hope this helps!
      `;

      const result = await parser.parse(input);

      expect(result).toEqual({ value: 42 });
    });

    it('should extract JSON from code block without language tag', async () => {
      const schema = z.object({ count: z.number() });

      const parser = new ZodOutputParser(schema);
      const input = `
\`\`\`
{"count": 7}
\`\`\`
      `;

      const result = await parser.parse(input);

      expect(result).toEqual({ count: 7 });
    });

    it('should extract JSON from plain text with surrounding content', async () => {
      const schema = z.object({ status: z.string() });

      const parser = new ZodOutputParser(schema);
      const input = 'The result is {"status": "success"} and it worked!';

      const result = await parser.parse(input);

      expect(result).toEqual({ status: 'success' });
    });

    it('should extract array from plain text', async () => {
      const schema = z.array(z.number());

      const parser = new ZodOutputParser(schema);
      const input = 'Numbers: [1, 2, 3, 4, 5]';

      const result = await parser.parse(input);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('JSON fixing', () => {
    it('should fix trailing commas in objects', async () => {
      const schema = z.object({
        a: z.number(),
        b: z.string(),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{"a": 1, "b": "test",}';

      const result = await parser.parse(input);

      expect(result).toEqual({ a: 1, b: 'test' });
    });

    it('should fix trailing commas in arrays', async () => {
      const schema = z.array(z.string());

      const parser = new ZodOutputParser(schema);
      const input = '["x", "y", "z",]';

      const result = await parser.parse(input);

      expect(result).toEqual(['x', 'y', 'z']);
    });

    it('should fix single quotes to double quotes', async () => {
      const schema = z.object({ name: z.string() });

      const parser = new ZodOutputParser(schema);
      const input = "{'name': 'test'}";

      const result = await parser.parse(input);

      expect(result).toEqual({ name: 'test' });
    });

    it('should remove single-line comments', async () => {
      const schema = z.object({ x: z.number() });

      const parser = new ZodOutputParser(schema);
      const input = `{
        "x": 10 // this is a comment
      }`;

      const result = await parser.parse(input);

      expect(result).toEqual({ x: 10 });
    });

    it('should remove multi-line comments', async () => {
      const schema = z.object({ y: z.string() });

      const parser = new ZodOutputParser(schema);
      const input = `{
        /* multi-line
           comment */
        "y": "value"
      }`;

      const result = await parser.parse(input);

      expect(result).toEqual({ y: 'value' });
    });

    it('should fix multiple issues at once', async () => {
      const schema = z.object({
        name: z.string(),
        items: z.array(z.number()),
      });

      const parser = new ZodOutputParser(schema);
      const input = `{
        'name': 'test', // user name
        'items': [1, 2, 3,], /* numbers */
      }`;

      const result = await parser.parse(input);

      expect(result).toEqual({
        name: 'test',
        items: [1, 2, 3],
      });
    });
  });

  describe('Validation errors', () => {
    it('should throw on validation error with field name', async () => {
      const schema = z.object({
        age: z.number(),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{"age": "not a number"}';

      await expect(parser.parse(input)).rejects.toThrow('Validation error');
    });

    it('should throw on missing required field', async () => {
      const schema = z.object({
        required: z.string(),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{}';

      await expect(parser.parse(input)).rejects.toThrow('Validation error');
    });

    it('should throw on invalid enum value', async () => {
      const schema = z.object({
        status: z.enum(['active', 'inactive']),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{"status": "unknown"}';

      await expect(parser.parse(input)).rejects.toThrow('Validation error');
    });
  });

  describe('Parsing errors', () => {
    it('should throw on completely invalid JSON', async () => {
      const schema = z.object({ x: z.number() });

      const parser = new ZodOutputParser(schema);
      const input = 'this is not json at all';

      await expect(parser.parse(input)).rejects.toThrow('JSON parsing error');
    });

    it('should throw on unfixable JSON', async () => {
      const schema = z.object({ x: z.number() });

      const parser = new ZodOutputParser(schema);
      const input = '{"x": 1';

      await expect(parser.parse(input)).rejects.toThrow('JSON parsing error');
    });
  });

  describe('Format instructions', () => {
    it('should generate instructions for simple object', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const parser = new ZodOutputParser(schema);
      const instructions = parser.getFormatInstructions();

      expect(instructions).toContain('JSON');
      expect(instructions).toContain('name');
      expect(instructions).toContain('age');
      expect(instructions).toContain('string');
      expect(instructions).toContain('number');
    });

    it('should generate instructions for array schema', () => {
      const schema = z.array(z.string());

      const parser = new ZodOutputParser(schema);
      const instructions = parser.getFormatInstructions();

      expect(instructions).toContain('JSON');
      expect(instructions).toContain('array');
    });

    it('should generate instructions for enum', () => {
      const schema = z.object({
        status: z.enum(['pending', 'complete']),
      });

      const parser = new ZodOutputParser(schema);
      const instructions = parser.getFormatInstructions();

      expect(instructions).toContain('status');
      expect(instructions).toContain('pending');
      expect(instructions).toContain('complete');
    });

    it('should generate instructions for optional fields', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const parser = new ZodOutputParser(schema);
      const instructions = parser.getFormatInstructions();

      expect(instructions).toContain('required');
      expect(instructions).toContain('optional');
    });
  });

  describe('Complex schemas', () => {
    it('should parse entity extraction schema', async () => {
      const EntitySchema = z.object({
        name: z.string(),
        type: z.enum(['PERSON', 'ORGANIZATION', 'LOCATION']),
        confidence: z.number().min(0).max(1),
      });

      const ExtractionSchema = z.object({
        entities: z.array(EntitySchema),
        relationships: z.array(
          z.object({
            subject: z.string(),
            predicate: z.string(),
            object: z.string(),
          })
        ),
      });

      const parser = new ZodOutputParser(ExtractionSchema);
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

    it('should parse with nested optional fields', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{"user": {"name": "Bob"}}';

      const result = await parser.parse(input);

      expect(result).toEqual({ user: { name: 'Bob' } });
    });

    it('should parse with array of objects', async () => {
      const schema = z.object({
        items: z.array(
          z.object({
            id: z.string(),
            value: z.number(),
          })
        ),
      });

      const parser = new ZodOutputParser(schema);
      const input = `{
        "items": [
          {"id": "a", "value": 1},
          {"id": "b", "value": 2}
        ]
      }`;

      const result = await parser.parse(input);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('a');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty object', async () => {
      const schema = z.object({}).strict();

      const parser = new ZodOutputParser(schema);
      const input = '{}';

      const result = await parser.parse(input);

      expect(result).toEqual({});
    });

    it('should handle empty array', async () => {
      const schema = z.array(z.string());

      const parser = new ZodOutputParser(schema);
      const input = '[]';

      const result = await parser.parse(input);

      expect(result).toEqual([]);
    });

    it('should handle whitespace in JSON', async () => {
      const schema = z.object({ x: z.number() });

      const parser = new ZodOutputParser(schema);
      const input = `
        {
          "x"   :   42
        }
      `;

      const result = await parser.parse(input);

      expect(result).toEqual({ x: 42 });
    });

    it('should handle unicode characters', async () => {
      const schema = z.object({ text: z.string() });

      const parser = new ZodOutputParser(schema);
      const input = '{"text": "Hello 世界 🌍"}';

      const result = await parser.parse(input);

      expect(result).toEqual({ text: 'Hello 世界 🌍' });
    });

    it('should handle boolean values', async () => {
      const schema = z.object({
        active: z.boolean(),
        verified: z.boolean(),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{"active": true, "verified": false}';

      const result = await parser.parse(input);

      expect(result).toEqual({ active: true, verified: false });
    });

    it('should handle null values in optional fields', async () => {
      const schema = z.object({
        value: z.string().nullable(),
      });

      const parser = new ZodOutputParser(schema);
      const input = '{"value": null}';

      const result = await parser.parse(input);

      expect(result).toEqual({ value: null });
    });
  });
});
