import { describe, expect, it } from 'vitest';
import { convertDeltaToPlaintext } from './convertDeltaToPlainText';

describe('convertDeltaToPlaintext', () => {
  it('should convert a delta to plain text', () => {
    const delta = [
      { insert: 'Hello ' },
      { insert: 'World', attributes: { bold: true } },
    ];
    const text = convertDeltaToPlaintext(delta);
    expect(text).toBe('Hello World');
  });

  it('should handle deltas with non-string inserts', () => {
    const delta = [{ insert: { image: '...' } }, { insert: 'Hello' }];
    const text = convertDeltaToPlaintext(delta);
    expect(text).toBe(' Hello');
  });

  it('should handle deltas without inserts', () => {
    const delta = [{}];
    const text = convertDeltaToPlaintext(delta);
    expect(text).toBe('');
  });
});
