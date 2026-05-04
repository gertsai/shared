/**
 * Output Parsers for LLM Responses
 *
 * Two parsers for different use cases:
 *
 * ## TypiaOutputParser (compile-time validation)
 * Use for: API validation, queue jobs, hot paths, static schemas
 * - ~20,000x faster than Zod (compile-time code generation)
 * - 0 KB runtime overhead
 * - Best for high-throughput scenarios
 *
 * ## ZodOutputParser (runtime validation)
 * Use for: LLM output parsing, dynamic schemas, form generation
 * - Rich ecosystem (zodToJsonSchema, response_format)
 * - Runtime schema composition (.extend(), .merge())
 * - Best for LLM integration with OpenAI/Anthropic
 *
 * @example
 * ```typescript
 * // Hot path (API, queue) → Typia
 * import { TypiaOutputParser } from '@gertsai/core/text/parsers';
 * const parser = new TypiaOutputParser(validateMyType, schema);
 *
 * // LLM parsing → Zod
 * import { ZodOutputParser } from '@gertsai/core/text/parsers';
 * const parser = new ZodOutputParser(MyZodSchema);
 * ```
 *
 * @see ADR: apps/pipeline/docs/architecture/ADR-ZOD-TYPIA-STRATEGY.md
 * @module @gertsai/core/text/parsers
 */

// ============================================================================
// Typia Parser (compile-time, ~20,000x faster)
// Use for: API validation, queue processing, hot paths
// Supports: Validation Feedback Strategy for LLM retry
// ============================================================================
export {
  TypiaOutputParser,
  createTypiaParser,
  type TypiaValidator,
  type TypiaOutputParserOptions,
  // Validation Feedback Strategy types
  type ValidationFeedback,
  type ParseResult,
  type RetryWithFeedback,
} from './typia-parser';

// ============================================================================
// Zod Parser (runtime, rich ecosystem)
// Use for: LLM output parsing, zodToJsonSchema, dynamic schemas
// ============================================================================
export { ZodOutputParser, type ZodOutputParserOptions } from './zod-parser';
