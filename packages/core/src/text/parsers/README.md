# Output Parsers

Output parsers for LLM responses with validation and error recovery.

## ZodOutputParser

Parse and validate LLM output against Zod schemas. Handles common JSON errors like trailing commas, single quotes, and comments.

### Features

- Extract JSON from markdown code blocks
- Fix common JSON syntax errors automatically
- Validate against Zod schemas
- Generate format instructions for LLM prompts
- Type-safe output

### Basic Usage

```typescript
import { z } from 'zod';
import { ZodOutputParser } from '@gerts/core/text/parsers';

// Define your schema
const schema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

// Create parser
const parser = new ZodOutputParser(schema);

// Parse LLM output
const llmResponse = `
Here's the user data:

\`\`\`json
{
  "name": "Alice",
  "age": 30,
  "email": "alice@example.com"
}
\`\`\`
`;

const result = await parser.parse(llmResponse);
// result: { name: 'Alice', age: 30, email: 'alice@example.com' }
```

### Entity Extraction Example

```typescript
import { z } from 'zod';
import { ZodOutputParser } from '@gerts/core/text/parsers';

// Define entity extraction schema
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

// Use with LLM
const prompt = `
Extract entities and relationships from this text: "Alice works for Acme Corp in New York."

${parser.getFormatInstructions()}
`;

// Parse LLM response
const response = await llm.call(prompt);
const result = await parser.parse(response);
```

### Format Instructions

Generate schema-based instructions for LLM prompts:

```typescript
const schema = z.object({
  name: z.string(),
  score: z.number(),
});

const parser = new ZodOutputParser(schema);
console.log(parser.getFormatInstructions());

// Output:
// Respond in JSON format. The JSON must match this schema:
// {
//   "name": "string",
//   "score": "number"
// }
```

### Error Handling

The parser automatically fixes common JSON errors:

```typescript
// Trailing commas
await parser.parse('{"name": "Alice", "age": 30,}');

// Single quotes
await parser.parse("{'name': 'Alice', 'age': 30}");

// Comments
await parser.parse(`{
  "name": "Alice", // user name
  "age": 30 /* years old */
}`);

// All fixed automatically!
```

### Validation Errors

Validation errors are thrown with clear messages:

```typescript
const schema = z.object({
  age: z.number(),
});

try {
  await parser.parse('{"age": "not a number"}');
} catch (error) {
  console.error(error.message);
  // "Validation error: Expected number, received string"
}
```

### Configuration

```typescript
const parser = new ZodOutputParser(schema, {
  retryOnError: true,  // Retry on parse failure (future)
  maxRetries: 3,       // Max retry attempts (future)
});
```

## Future Parsers

- **StreamingParser**: Parse partial JSON from streaming LLM responses
- **XMLParser**: Parse XML output from LLMs
- **CSVParser**: Parse CSV output from LLMs
- **CustomParser**: Build your own parsers with the base class
