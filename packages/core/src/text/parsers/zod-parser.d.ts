import { z, ZodSchema } from 'zod';
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
export declare class ZodOutputParser<T extends ZodSchema> {
    private readonly schema;
    private readonly options;
    constructor(schema: T, options?: ZodOutputParserOptions);
    /**
     * Parse and validate output.
     *
     * @param text - Raw text output from LLM (may include markdown)
     * @returns Validated object matching schema
     * @throws Error if parsing or validation fails
     */
    parse(text: string): Promise<z.infer<T>>;
    /**
     * Get format instructions for LLM.
     * Generates human-readable instructions from the Zod schema.
     *
     * @returns Instructions to include in LLM prompt
     */
    getFormatInstructions(): string;
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
    private extractJSON;
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
    private fixJSON;
    /**
     * Generate schema description for format instructions.
     *
     * @returns Schema description as plain object
     * @private
     */
    private getSchemaDescription;
    /**
     * Describe a Zod type in human-readable format.
     *
     * @param schema - Zod schema to describe
     * @returns Description string or object
     * @private
     */
    private describeZodType;
}
