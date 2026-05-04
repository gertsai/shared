/**
 * Quill Delta operation type (simplified for our use case)
 */
interface DeltaOperation {
  insert?: string | object;
  delete?: number;
  retain?: number;
  attributes?: Record<string, unknown>;
}

/**
 * Converts a Quill Delta to plain text.
 *
 * @param delta - The Quill Delta to convert.
 * @returns The plain text representation of the Delta.
 *
 * @example
 * ```typescript
 * const delta = [
 *   { insert: 'Hello ' },
 *   { insert: 'World', attributes: { bold: true } },
 * ];
 *
 * const plainText = convertDeltaToPlaintext(delta);
 * // plainText is "Hello World"
 * ```
 */
// TODO: get rid of any
export function convertDeltaToPlaintext(delta: DeltaOperation[]): string {
  return delta.reduce((text, op) => {
    if (!('insert' in op)) {
      return text;
    }
    if (typeof op.insert !== 'string') {
      return text + ' ';
    }
    return text + op.insert;
  }, '');
}
