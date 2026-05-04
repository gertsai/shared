const convertEmoji = (input: string) => {
  if (input.length === 1) {
    return input.charCodeAt(0).toString();
  } else if (input.length > 1) {
    const pairs = [];
    for (let i = 0; i < input.length; i++) {
      if (input.charCodeAt(i) >= 0xd800 && input.charCodeAt(i) <= 0xdbff) {
        if (
          input.charCodeAt(i + 1) >= 0xdc00 &&
          input.charCodeAt(i + 1) <= 0xdfff
        ) {
          pairs.push(
            (input.charCodeAt(i) - 0xd800) * 0x400 +
              (input.charCodeAt(i + 1) - 0xdc00) +
              0x10000,
          );
        }
      } else if (input.charCodeAt(i) < 0xd800 || input.charCodeAt(i) > 0xdfff) {
        pairs.push(input.charCodeAt(i));
      }
    }
    return pairs.join(' ');
  }

  return '';
};

/**
 * Converts an emoji to its Unicode representation.
 *
 * @param emoji - The emoji to convert.
 * @returns The Unicode representation of the emoji.
 *
 * @example
 * ```typescript
 * const unicode = emojiToUnicode('😀');
 * // unicode is "1f600"
 * ```
 */
export const emojiToUnicode = (emoji: string) => {
  return convertEmoji(emoji)
    .split(' ')
    .map((val: string) => parseInt(val).toString(16))
    .join('-');
};
