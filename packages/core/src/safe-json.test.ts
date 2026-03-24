import { describe, it, expect } from 'vitest';
import { safeJsonParse } from './safe-json';

describe('safeJsonParse', () => {
  // ==========================================================================
  // Direct JSON
  // ==========================================================================

  it('parses plain JSON object', () => {
    expect(safeJsonParse('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('parses plain JSON array', () => {
    expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('parses JSON with whitespace', () => {
    expect(safeJsonParse('  { "a": 1 }  ')).toEqual({ a: 1 });
  });

  it('parses nested JSON', () => {
    const input = '{"patterns": [{"name": "test"}], "insights": ["a", "b"]}';
    const result = safeJsonParse<{ patterns: unknown[]; insights: string[] }>(input);
    expect(result?.patterns).toHaveLength(1);
    expect(result?.insights).toEqual(['a', 'b']);
  });

  // ==========================================================================
  // Markdown code fences
  // ==========================================================================

  it('extracts JSON from ```json fence', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(safeJsonParse(input)).toEqual({ key: 'value' });
  });

  it('extracts JSON from ``` fence (no language)', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(safeJsonParse(input)).toEqual({ key: 'value' });
  });

  it('extracts JSON from ```JSON fence (uppercase)', () => {
    const input = '```JSON\n[1, 2]\n```';
    expect(safeJsonParse(input)).toEqual([1, 2]);
  });

  it('handles fence with extra whitespace', () => {
    const input = '```json\n  \n{"key": "value"}\n  \n```';
    expect(safeJsonParse(input)).toEqual({ key: 'value' });
  });

  it('handles multiline JSON in fence', () => {
    const input = '```json\n{\n  "patterns": [],\n  "insights": ["test"]\n}\n```';
    expect(safeJsonParse(input)).toEqual({ patterns: [], insights: ['test'] });
  });

  // ==========================================================================
  // Text surrounding JSON
  // ==========================================================================

  it('extracts JSON from text before and after', () => {
    const input = 'Here is the result:\n{"key": "value"}\nThank you!';
    expect(safeJsonParse(input)).toEqual({ key: 'value' });
  });

  it('extracts JSON with text before fence', () => {
    const input = 'The analysis is:\n```json\n{"result": true}\n```\nDone.';
    expect(safeJsonParse(input)).toEqual({ result: true });
  });

  it('finds first JSON object when multiple exist', () => {
    const input = 'First: {"a": 1} and second: {"b": 2}';
    expect(safeJsonParse(input)).toEqual({ a: 1 });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  it('returns null for empty string', () => {
    expect(safeJsonParse('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(safeJsonParse(null as unknown as string)).toBeNull();
    expect(safeJsonParse(undefined as unknown as string)).toBeNull();
    expect(safeJsonParse(42 as unknown as string)).toBeNull();
  });

  it('returns null for plain text without JSON', () => {
    expect(safeJsonParse('This is just plain text')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(safeJsonParse('{"key": value}')).toBeNull();
  });

  it('handles JSON with escaped quotes', () => {
    const input = '{"message": "He said \\"hello\\""}';
    expect(safeJsonParse(input)).toEqual({ message: 'He said "hello"' });
  });

  it('handles JSON with braces in strings', () => {
    const input = '{"template": "Hello {name}, welcome to {place}!"}';
    expect(safeJsonParse(input)).toEqual({ template: 'Hello {name}, welcome to {place}!' });
  });

  // ==========================================================================
  // Real LLM output patterns
  // ==========================================================================

  it('parses Gemini reflection response', () => {
    const input = `Here is my analysis:

\`\`\`json
{
  "patterns": [
    {"name": "memory_growth", "description": "Memory usage increases over sessions", "confidence": 0.8}
  ],
  "insights": ["User prefers concise answers"],
  "contradictions": [],
  "selfObservations": ["I should be more direct"]
}
\`\`\`

I hope this helps!`;

    const result = safeJsonParse<{
      patterns: Array<{ name: string; confidence: number }>;
      insights: string[];
    }>(input);

    expect(result).not.toBeNull();
    expect(result?.patterns).toHaveLength(1);
    expect(result?.patterns[0].name).toBe('memory_growth');
    expect(result?.insights).toContain('User prefers concise answers');
  });

  it('parses graph extractor response with fence', () => {
    const input =
      '```json\n{"entities": [{"name": "Alice", "type": "Person"}], "relationships": []}\n```';
    const result = safeJsonParse<{ entities: unknown[]; relationships: unknown[] }>(input);
    expect(result?.entities).toHaveLength(1);
    expect(result?.relationships).toHaveLength(0);
  });
});
