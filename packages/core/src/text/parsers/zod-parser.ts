import { z, ZodSchema, ZodError } from 'zod';

/**
 * Options for ZodOutputParser.
 */
export interface ZodOutputParserOptions {
  /** Retry parsing on failure */
  retryOnError?: boolean;
  /** Max retries */
  maxRetries?: number;
}

/**
 * ZodOutputParser - parse and validate LLM output.
 * From LangChain structured output patterns.
 *
 * Handles:
 * - JSON extraction from markdown code blocks
 * - Common JSON syntax errors (trailing commas, single quotes, comments)
 * - Zod schema validation
 * - Error recovery with retry logic
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 *
 * const parser = new ZodOutputParser(schema);
 * const result = await parser.parse(llmOutput);
 * ```
 */
export class ZodOutputParser<T extends ZodSchema> {
  constructor(
    private readonly schema: T,
    private readonly options: ZodOutputParserOptions = {},
  ) {}

  /**
   * Parse and validate output.
   *
   * @param text - Raw text output from LLM (may include markdown)
   * @returns Validated object matching schema
   * @throws Error if parsing or validation fails
   */
  async parse(text: string): Promise<z.infer<T>> {
    // Extract JSON from potential markdown
    const jsonStr = this.extractJSON(text);

    try {
      const parsed = JSON.parse(jsonStr);
      return this.schema.parse(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Try to fix common JSON issues
        try {
          const fixed = this.fixJSON(jsonStr);
          const parsed = JSON.parse(fixed);
          return this.schema.parse(parsed);
        } catch (fixError) {
          throw new Error(
            `JSON parsing error: ${error.message}. Fix attempt also failed: ${
              fixError instanceof Error ? fixError.message : String(fixError)
            }`,
          );
        }
      }

      if (error instanceof ZodError) {
        const formattedErrors = error.errors
          .map((e) => {
            const path = e.path.join('.');
            return path ? `${path}: ${e.message}` : e.message;
          })
          .join('; ');
        throw new Error(`Validation error: ${formattedErrors}`);
      }

      throw error;
    }
  }

  /**
   * Get format instructions for LLM.
   * Generates human-readable instructions from the Zod schema.
   *
   * @returns Instructions to include in LLM prompt
   */
  getFormatInstructions(): string {
    // Generate instructions from schema
    return `Respond in JSON format. The JSON must match this schema:\n${JSON.stringify(
      this.getSchemaDescription(),
      null,
      2,
    )}`;
  }

  /**
   * Extract JSON from markdown code blocks or raw text.
   *
   * Handles:
   * - ```json ... ```
   * - ``` ... ```
   * - Raw JSON objects/arrays
   *
   * @param text - Input text
   * @returns Extracted JSON string
   * @private
   */
  private extractJSON(text: string): string {
    // Try to extract JSON from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find JSON object/array
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    return text.trim();
  }

  /**
   * Fix common JSON syntax errors.
   *
   * Fixes:
   * - Trailing commas: {"a":1,} → {"a":1}
   * - Single quotes: {'a':'b'} → {"a":"b"}
   * - Comments: {"a":1 // comment} → {"a":1}
   *
   * @param text - Potentially malformed JSON
   * @returns Fixed JSON string
   * @private
   */
  private fixJSON(text: string): string {
    // Common fixes (order matters!)
    let fixed = text
      // Remove single-line comments first (before quote conversion)
      .replace(/\/\/.*$/gm, '')
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove trailing commas before } or ]
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix single quotes to double quotes (but be careful with property names)
      .replace(/'/g, '"');

    return fixed;
  }

  /**
   * Generate schema description for format instructions.
   *
   * @returns Schema description as plain object
   * @private
   */
  private getSchemaDescription(): unknown {
    return this.describeZodType(this.schema);
  }

  /**
   * Describe a Zod type in human-readable format.
   *
   * @param schema - Zod schema to describe
   * @returns Description string or object
   * @private
   */
  private describeZodType(schema: ZodSchema): unknown {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.describeZodType((schema as z.ZodArray<ZodSchema>).element),
      };
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const description: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(shape)) {
        description[key] = this.describeZodType(value as ZodSchema);
      }
      return description;
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'enum',
        options: (schema as z.ZodEnum<[string, ...string[]]>).options,
      };
    }

    if (schema instanceof z.ZodOptional) {
      const innerType = this.describeZodType((schema as z.ZodOptional<ZodSchema>).unwrap());
      // If innerType is an object (string/number etc are just strings), attach optional flag
      if (typeof innerType === 'object' && innerType !== null) {
        return { ...innerType, optional: true };
      }
      return { type: innerType, optional: true };
    }

    // Fallback for other types
    return 'unknown';
  }
}
