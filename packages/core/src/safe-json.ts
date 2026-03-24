/**
 * Safe JSON parser for LLM responses.
 *
 * LLMs often return JSON wrapped in markdown code blocks, with leading/trailing
 * text, or with other formatting artifacts. This utility extracts and parses
 * JSON reliably from messy LLM output.
 *
 * @example
 * ```typescript
 * import { safeJsonParse } from '@gerts/core';
 *
 * // All of these work:
 * safeJsonParse('{"key": "value"}');                    // direct JSON
 * safeJsonParse('```json\n{"key": "value"}\n```');      // markdown fence
 * safeJsonParse('Here is the result:\n{"key": "value"}\nDone.'); // surrounded by text
 * safeJsonParse('```\n[1, 2, 3]\n```');                 // array in fence
 * ```
 */

/**
 * Attempt to extract and parse JSON from potentially messy LLM output.
 *
 * Strategy (ordered by priority):
 * 1. Direct JSON.parse
 * 2. Strip markdown code fences (```json ... ```)
 * 3. Find first balanced { ... } or [ ... ] block
 *
 * @returns Parsed object or null if no valid JSON found
 */
export function safeJsonParse<T = unknown>(text: string): T | null {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  // 1. Direct parse — fastest path
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue to fallback strategies
  }

  // 2. Strip markdown code fences
  //    Handles: ```json\n{...}\n```, ```\n{...}\n```, ```json{...}```
  const fenceRegex = /```(?:json|JSON|js|javascript)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = trimmed.match(fenceRegex);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try {
      return JSON.parse(inner) as T;
    } catch {
      // fence content wasn't valid JSON, try extracting from it
      const nestedJson = extractJsonBlock(inner);
      if (nestedJson !== null) return nestedJson as T;
    }
  }

  // 3. Find first balanced JSON block in the text
  const extracted = extractJsonBlock(trimmed);
  if (extracted !== null) return extracted as T;

  return null;
}

/**
 * Extract the first valid JSON object or array from text.
 * Handles cases where JSON is surrounded by explanatory text.
 */
function extractJsonBlock(text: string): unknown | null {
  // Try to find JSON object
  const objStart = text.indexOf('{');
  if (objStart !== -1) {
    const candidate = findBalancedBrace(text, objStart, '{', '}');
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        // not valid JSON despite balanced braces
      }
    }
  }

  // Try to find JSON array
  const arrStart = text.indexOf('[');
  if (arrStart !== -1) {
    const candidate = findBalancedBrace(text, arrStart, '[', ']');
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        // not valid JSON despite balanced brackets
      }
    }
  }

  return null;
}

/**
 * Find a balanced brace/bracket pair starting from a given position.
 * Respects strings (won't count braces inside "...").
 */
function findBalancedBrace(
  text: string,
  startIdx: number,
  openChar: string,
  closeChar: string,
): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\') {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;

    if (depth === 0) {
      return text.slice(startIdx, i + 1);
    }
  }

  return null; // unbalanced
}
