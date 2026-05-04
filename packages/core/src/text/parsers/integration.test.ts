import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test that parsers can be imported from main export
describe('Parser Integration', () => {
  it('should be importable from text/parsers', async () => {
    const { ZodOutputParser } = await import('./index');
    expect(ZodOutputParser).toBeDefined();
  });

  it('should work with actual entity extraction schema from spec', async () => {
    const { ZodOutputParser } = await import('./index');

    // Schema from Phase 23 spec
    const EntitySchema = z.object({
      name: z.string(),
      type: z.enum(['PERSON', 'ORGANIZATION', 'LOCATION', 'EVENT', 'CONCEPT', 'PRODUCT', 'DATE', 'QUANTITY', 'CUSTOM']),
      aliases: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1),
      mentions: z.array(
        z.object({
          text: z.string(),
          startIndex: z.number(),
          endIndex: z.number(),
        })
      ),
    });

    const ExtractionSchema = z.object({
      entities: z.array(EntitySchema),
      relationships: z.array(
        z.object({
          subject: z.string(),
          predicate: z.string(),
          object: z.string(),
          confidence: z.number(),
          evidence: z.string().optional(),
        })
      ),
    });

    const parser = new ZodOutputParser(ExtractionSchema);

    const llmOutput = `
Here are the extracted entities and relationships:

\`\`\`json
{
  "entities": [
    {
      "name": "Alice Johnson",
      "type": "PERSON",
      "aliases": ["Alice", "A. Johnson"],
      "confidence": 0.95,
      "mentions": [
        {
          "text": "Alice Johnson",
          "startIndex": 0,
          "endIndex": 13
        }
      ]
    },
    {
      "name": "Acme Corporation",
      "type": "ORGANIZATION",
      "confidence": 0.92,
      "mentions": [
        {
          "text": "Acme Corp",
          "startIndex": 30,
          "endIndex": 39
        }
      ]
    },
    {
      "name": "New York",
      "type": "LOCATION",
      "confidence": 0.88,
      "mentions": [
        {
          "text": "New York",
          "startIndex": 43,
          "endIndex": 51
        }
      ]
    }
  ],
  "relationships": [
    {
      "subject": "Alice Johnson",
      "predicate": "WORKS_FOR",
      "object": "Acme Corporation",
      "confidence": 0.90,
      "evidence": "Alice Johnson works for Acme Corp"
    },
    {
      "subject": "Acme Corporation",
      "predicate": "LOCATED_IN",
      "object": "New York",
      "confidence": 0.85,
      "evidence": "Acme Corp in New York"
    }
  ]
}
\`\`\`
    `;

    const result = await parser.parse(llmOutput);

    expect(result.entities).toHaveLength(3);
    expect(result.entities[0].name).toBe('Alice Johnson');
    expect(result.entities[0].type).toBe('PERSON');
    expect(result.entities[0].mentions).toHaveLength(1);

    expect(result.relationships).toHaveLength(2);
    expect(result.relationships[0].predicate).toBe('WORKS_FOR');
    expect(result.relationships[1].predicate).toBe('LOCATED_IN');
  });

  it('should generate useful format instructions for entity extraction', async () => {
    const { ZodOutputParser } = await import('./index');

    const schema = z.object({
      entities: z.array(z.object({
        name: z.string(),
        type: z.string(),
      })),
    });

    const parser = new ZodOutputParser(schema);
    const instructions = parser.getFormatInstructions();

    expect(instructions).toContain('JSON');
    expect(instructions).toContain('entities');
  });
});
