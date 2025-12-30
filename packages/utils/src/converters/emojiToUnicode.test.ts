import { describe, expect, it } from 'vitest';
import { emojiToUnicode } from './emojiToUnicode';

describe('emojiToUnicode', () => {
  it('should convert a simple emoji to its unicode representation', () => {
    const emoji = '😀';
    const unicode = emojiToUnicode(emoji);
    expect(unicode).toBe('1f600');
  });

  it('should handle multi-character emoji', () => {
    const emoji = '👨‍👩‍👧‍👦';
    const unicode = emojiToUnicode(emoji);
    expect(unicode).toBe('1f468-200d-1f469-200d-1f467-200d-1f466');
  });

  it('should handle emoji with skin tone modifier', () => {
    const emoji = '👍🏾';
    const unicode = emojiToUnicode(emoji);
    expect(unicode).toBe('1f44d-1f3fe');
  });

  it('should handle flag emoji', () => {
    const emoji = '🇺🇸';
    const unicode = emojiToUnicode(emoji);
    expect(unicode).toBe('1f1fa-1f1f8');
  });
});
