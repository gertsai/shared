"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodOutputParser = void 0;
const zod_1 = require("zod");
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
class ZodOutputParser {
    schema;
    options;
    constructor(schema, options = {}) {
        this.schema = schema;
        this.options = options;
    }
    /**
     * Parse and validate output.
     *
     * @param text - Raw text output from LLM (may include markdown)
     * @returns Validated object matching schema
     * @throws Error if parsing or validation fails
     */
    async parse(text) {
        // Extract JSON from potential markdown
        const jsonStr = this.extractJSON(text);
        try {
            const parsed = JSON.parse(jsonStr);
            return this.schema.parse(parsed);
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                // Try to fix common JSON issues
                try {
                    const fixed = this.fixJSON(jsonStr);
                    const parsed = JSON.parse(fixed);
                    return this.schema.parse(parsed);
                }
                catch (fixError) {
                    throw new Error(`JSON parsing error: ${error.message}. Fix attempt also failed: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
                }
            }
            if (error instanceof zod_1.ZodError) {
                throw new Error(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
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
    getFormatInstructions() {
        // Generate instructions from schema
        return `Respond in JSON format. The JSON must match this schema:\n${JSON.stringify(this.getSchemaDescription(), null, 2)}`;
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
    extractJSON(text) {
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
    fixJSON(text) {
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
    getSchemaDescription() {
        // Simplified schema description
        if (this.schema instanceof zod_1.z.ZodObject) {
            const shape = this.schema.shape;
            const description = {};
            for (const [key, value] of Object.entries(shape)) {
                description[key] = this.describeZodType(value);
            }
            return description;
        }
        if (this.schema instanceof zod_1.z.ZodArray) {
            return { type: 'array', items: this.describeZodType(this.schema.element) };
        }
        return this.describeZodType(this.schema);
    }
    /**
     * Describe a Zod type in human-readable format.
     *
     * @param schema - Zod schema to describe
     * @returns Description string or object
     * @private
     */
    describeZodType(schema) {
        if (schema instanceof zod_1.z.ZodString)
            return 'string';
        if (schema instanceof zod_1.z.ZodNumber)
            return 'number';
        if (schema instanceof zod_1.z.ZodBoolean)
            return 'boolean';
        if (schema instanceof zod_1.z.ZodArray)
            return ['array'];
        if (schema instanceof zod_1.z.ZodObject)
            return 'object';
        if (schema instanceof zod_1.z.ZodEnum)
            return schema.options;
        if (schema instanceof zod_1.z.ZodOptional) {
            const innerType = this.describeZodType(schema.unwrap());
            return { type: innerType, optional: true };
        }
        return 'unknown';
    }
}
exports.ZodOutputParser = ZodOutputParser;
//# sourceMappingURL=zod-parser.js.map