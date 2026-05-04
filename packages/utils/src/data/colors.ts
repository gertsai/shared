import { strToNum } from '../converters';

type HEX = `#${string}`;

export type ColorTag = HEX;

/**
 * A map of color names to their hex values.
 */
export const colorsMap = {
  red: '#F8724C',
  orange: '#FFAD33',
  yellow: '#e09602',
  green: '#24C775',
  cyan: '#439EFB',
  blue: '#5D79F6',
  violet: '#725CFF',
  imperial: '#8E77F9',
  rose: '#FE909A',
};

/**
 * An array of color hex values.
 */
export const colors = Object.values(colorsMap);

/**
 * An array of color tags for usernames.
 */
export const usernameColors = Object.values(colorsMap) as ColorTag[];

/**
 * Converts a string to a color tag.
 *
 * @param str - The string to convert.
 * @returns A color tag.
 *
 * @example
 * ```typescript
 * const color = strToColorTag('John Doe');
 * // color is a color tag from the usernameColors array
 * ```
 */
export const strToColorTag = (str: string) => {
  return usernameColors[
    Math.ceil(strToNum(str[0] as string) % usernameColors.length)
  ];
};

/**
 * Returns a random color from the `colors` array.
 *
 * @returns A random color tag.
 */
export function getRandomColor() {
  return colors[Math.round(Math.random() * (colors.length - 1))] as ColorTag;
}
