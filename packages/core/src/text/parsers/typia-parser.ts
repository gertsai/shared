/**
 * Typia Output Parser
 *
 * Generic LLM output parser using Typia compile-time validation.
 * Replaces ZodOutputParser with ~20,000x faster validation.
 *
 * Features:
 * - JSON extraction from markdown code blocks
 * - Common JSON syntax error fixing
 * - Typia compile-time validation
 * - Human-readable format instructions
 */

import type { IValidation } from 'typia';

/**
 * Typia validator function type.
 * Generated via typia.createValidate<T>()
 */
export type TypiaValidator<T> = (input: unknown) => IValidation<T>;

/**
 * Validation error details for feedback to LLM.
 */
export interface ValidationFeedback {
  /** Original input that failed */
  input: unknown;
  /** Detailed validation errors */
  errors: Array<{
    path: string;
    expected: string;
    actual: string;
  }>;
  /** Human-readable error message for LLM */
  message: string;
}

/**
 * Result of parsing with retry capability.
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; feedback: ValidationFeedback };

/**
 * Retry function signature for Validation Feedback Strategy.
 * Called when validation fails, should return corrected LLM output.
 */
export type RetryWithFeedback = (feedback: ValidationFeedback) => Promise<string>;

/**
 * Options for TypiaOutputParser.
 */
export interface TypiaOutputParserOptions {
  /** Retry parsing on failure (default: false) */
  retryOnError?: boolean;
  /** Max retries with validation feedback (default: 2) */
  maxRetries?: number;
}

/**
 * TypiaOutputParser - parse and validate LLM output with Typia.
 *
 * Uses compile-time generated validators for ~20,000x faster validation
 * compared to runtime Zod schemas.
 *
 * @example
 * ```typescript
 * interface Person {
 *   name: string;
 *   age: number;
 * }
 *
 * const validator = typia.createValidate<Person>();
 * const parser = new TypiaOutputParser(validator);
 *
 * const result = await parser.parse(llmOutput);
 * // result is typed as Person
 * ```
 */
export class TypiaOutputParser<T> {
  private readonly maxRetries: number;

  constructor(
    private readonly validator: TypiaValidator<T>,
    private readonly schemaDescription?: unknown,
    options: TypiaOutputParserOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 2;
  }

  /**
   * Parse with automatic retry using Validation Feedback Strategy.
   *
   * According to Typia docs:
   * - 1st trial: ~50% success rate
   * - 2nd trial with feedback: ~99% success rate
   * - 3rd trial: virtually never fails
   *
   * @param text - Initial LLM output
   * @param retry - Callback to get corrected output from LLM
   * @returns Validated data
   * @throws Error after maxRetries exceeded
   *
   * @example
   * ```typescript
   * const result = await parser.parseWithRetry(llmOutput, async (feedback) => {
   *   // Send feedback.message to LLM and get corrected response
   *   return await llm.complete(`Fix these errors:\n${feedback.message}\n\nOriginal: ${text}`);
   * });
   * ```
   */
  async parseWithRetry(text: string, retry: RetryWithFeedback): Promise<T> {
    let currentText = text;
    let lastFeedback: ValidationFeedback | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const result = this.safeParse(currentText);

      if (result.success) {
        return result.data;
      }

      lastFeedback = result.feedback;

      // Don't retry on last attempt
      if (attempt < this.maxRetries) {
        currentText = await retry(result.feedback);
      }
    }

    // All retries exhausted
    throw new Error(
      `Validation failed after ${this.maxRetries + 1} attempts. Last error: ${lastFeedback?.message}`,
    );
  }

  /**
   * Safe parse that returns result instead of throwing.
   * Use this for Validation Feedback Strategy.
   *
   * @param text - Raw LLM output
   * @returns Success with data or failure with feedback
   */
  safeParse(text: string): ParseResult<T> {
    const jsonStr = this.extractJSON(text);

    try {
      const parsed = JSON.parse(jsonStr);
      const result = this.validator(parsed);

      if (!result.success) {
        return {
          success: false,
          feedback: this.formatValidationFeedback(parsed, result.errors),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Try to fix common JSON issues
        try {
          const fixed = this.fixJSON(jsonStr);
          const parsed = JSON.parse(fixed);
          const result = this.validator(parsed);

          if (!result.success) {
            return {
              success: false,
              feedback: this.formatValidationFeedback(parsed, result.errors),
            };
          }

          return { success: true, data: result.data };
        } catch {
          return {
            success: false,
            feedback: {
              input: jsonStr,
              errors: [],
              message: `JSON parsing error: ${error.message}. Please return valid JSON.`,
            },
          };
        }
      }

      return {
        success: false,
        feedback: {
          input: jsonStr,
          errors: [],
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Format validation errors into LLM-friendly feedback.
   * Uses Instructor-style format for better retry success rate.
   *
   * @see https://python.useinstructor.com/concepts/validation/
   */
  private formatValidationFeedback(
    input: unknown,
    errors: IValidation.IError[],
  ): ValidationFeedback {
    const formattedErrors = errors.map((e) => ({
      path: e.path ?? '$',
      expected: e.expected ?? 'unknown',
      actual: String(e.value),
    }));

    // Instructor-style format: clear errors + actionable hints
    const errorLines = formattedErrors
      .map((e, i) => {
        const hint = this.getHintForError(e.expected, e.actual);
        return `${i + 1}. ${e.path}: expected ${e.expected}, got ${e.actual}${hint ? `\n   → ${hint}` : ''}`;
      })
      .join('\n\n');

    return {
      input,
      errors: formattedErrors,
      message: `The following validation errors occurred:\n\n${errorLines}\n\nPlease fix ALL errors above and return valid JSON only.`,
    };
  }

  /**
   * Generate hint based on error type (improves retry success rate).
   */
  private getHintForError(expected: string, actual: string): string | null {
    const actualLower = actual.toLowerCase();

    // String expected but got undefined/null
    if (expected.includes('string') && (actualLower === 'undefined' || actualLower === 'null')) {
      return 'Provide a non-empty string value';
    }
    // Number expected but got non-numeric value
    if (expected.includes('number') && isNaN(Number(actual))) {
      return 'Provide a numeric value without quotes';
    }
    // Boolean expected
    if (expected.includes('boolean') && !['true', 'false'].includes(actualLower)) {
      return 'Use true or false (without quotes)';
    }
    // Array expected
    if (expected.includes('array') || expected.includes('[]')) {
      return 'Provide an array, e.g. [] or [item1, item2]';
    }
    // Enum/union type
    if (expected.includes('|')) {
      return `Use one of the allowed values: ${expected}`;
    }
    return null;
  }

  /**
   * Parse and validate output.
   *
   * @param text - Raw text output from LLM (may include markdown)
   * @returns Validated object matching schema
   * @throws Error if parsing or validation fails
   */
  async parse(text: string): Promise<T> {
    // Extract JSON from potential markdown
    const jsonStr = this.extractJSON(text);

    try {
      const parsed = JSON.parse(jsonStr);
      const result = this.validator(parsed);

      if (!result.success) {
        const formattedErrors = result.errors
          .map((e: IValidation.IError) => {
            const path = e.path;
            return path ? `${path}: expected ${e.expected}` : `expected ${e.expected}`;
          })
          .join('; ');
        throw new Error(`Validation error: ${formattedErrors}`);
      }

      return result.data;
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Try to fix common JSON issues
        try {
          const fixed = this.fixJSON(jsonStr);
          const parsed = JSON.parse(fixed);
          const result = this.validator(parsed);

          if (!result.success) {
            const formattedErrors = result.errors
              .map((e: IValidation.IError) => {
                const path = e.path;
                return path ? `${path}: expected ${e.expected}` : `expected ${e.expected}`;
              })
              .join('; ');
            throw new Error(`Validation error: ${formattedErrors}`);
          }

          return result.data;
        } catch (fixError) {
          throw new Error(
            `JSON parsing error: ${error.message}. Fix attempt also failed: ${
              fixError instanceof Error ? fixError.message : String(fixError)
            }`,
          );
        }
      }

      // Re-throw validation errors
      throw error;
    }
  }

  /**
   * Get format instructions for LLM.
   * Generates human-readable instructions from the schema description.
   *
   * @returns Instructions to include in LLM prompt
   */
  getFormatInstructions(): string {
    if (this.schemaDescription) {
      return `Respond in JSON format. The JSON must match this schema:\n${JSON.stringify(
        this.schemaDescription,
        null,
        2,
      )}`;
    }

    return 'Respond in valid JSON format.';
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
    if (codeBlockMatch?.[1]) {
      return codeBlockMatch[1].trim();
    }

    // Try to find JSON object/array
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch?.[1]) {
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
}

/**
 * Create a TypiaOutputParser with auto-generated schema description.
 *
 * @example
 * ```typescript
 * interface Person {
 *   name: string;
 *   age: number;
 * }
 *
 * const parser = createTypiaParser<Person>();
 * const result = await parser.parse(llmOutput);
 * ```
 */
export function createTypiaParser<T>(
  validator: TypiaValidator<T>,
  schemaDescription?: unknown,
  options?: TypiaOutputParserOptions,
): TypiaOutputParser<T> {
  return new TypiaOutputParser(validator, schemaDescription, options);
}
