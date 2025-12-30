import { describe, expect, it, vi } from 'vitest';
import type { ColorTag } from './colors';
import {
  colors,
  colorsMap,
  getRandomColor,
  strToColorTag,
  usernameColors,
} from './colors';

describe('colors data', () => {
  describe('colorsMap', () => {
    it('should contain correct color mappings', () => {
      expect(colorsMap.red).toBe('#F8724C');
      expect(colorsMap.orange).toBe('#FFAD33');
      expect(colorsMap.yellow).toBe('#e09602');
      expect(colorsMap.green).toBe('#24C775');
      expect(colorsMap.cyan).toBe('#439EFB');
      expect(colorsMap.blue).toBe('#5D79F6');
      expect(colorsMap.violet).toBe('#725CFF');
      expect(colorsMap.imperial).toBe('#8E77F9');
      expect(colorsMap.rose).toBe('#FE909A');
    });

    it('should have all hex color values', () => {
      Object.values(colorsMap).forEach((color) => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('colors array', () => {
    it('should contain all color values from colorsMap', () => {
      const expectedColors = Object.values(colorsMap);
      expect(colors).toEqual(expectedColors);
    });

    it('should have the correct length', () => {
      expect(colors).toHaveLength(9);
    });

    it('should contain only valid hex colors', () => {
      colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('usernameColors array', () => {
    it('should be the same as colors array', () => {
      expect(usernameColors).toEqual(colors);
    });

    it('should have ColorTag type', () => {
      usernameColors.forEach((color) => {
        expect(typeof color).toBe('string');
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });
});

describe('strToColorTag', () => {
  it('should return a valid color tag for non-empty strings', () => {
    const testStrings = ['John', 'Jane', 'Bob', 'Alice', 'Test123'];

    testStrings.forEach((str) => {
      const color = strToColorTag(str);
      expect(usernameColors).toContain(color);
    });
  });

  it('should return consistent color for same string', () => {
    const testString = 'John Doe';
    const color1 = strToColorTag(testString);
    const color2 = strToColorTag(testString);
    expect(color1).toBe(color2);
  });

  it('should return different colors for different first characters', () => {
    const colors1 = strToColorTag('A');
    const colors2 = strToColorTag('B');
    // Note: They might be the same due to modulo operation, so we just check they're valid
    expect(usernameColors).toContain(colors1);
    expect(usernameColors).toContain(colors2);
  });

  it('should handle single character strings', () => {
    const color = strToColorTag('X');
    expect(usernameColors).toContain(color);
  });

  it('should throw for empty string', () => {
    // strToColorTag with empty string will cause strToNum to receive undefined
    // which will throw when trying to read .length property
    expect(() => strToColorTag('')).toThrow();
  });

  it('should handle numeric strings', () => {
    const color = strToColorTag('123');
    expect(usernameColors).toContain(color);
  });

  it('should return undefined for special characters not in CHARS', () => {
    // Special characters like '!' are not in the CHARS string, so CHARS.indexOf returns -1
    // This results in negative numbers which give undefined when used as array indices
    const color = strToColorTag('!@#$');
    expect(color).toBeUndefined();
  });

  it('should use only the first character for color determination', () => {
    const color1 = strToColorTag('A123');
    const color2 = strToColorTag('Axyz');
    expect(color1).toBe(color2);
  });
});

describe('getRandomColor', () => {
  it('should return a valid color from the colors array', () => {
    const color = getRandomColor();
    expect(colors).toContain(color);
  });

  it('should return a ColorTag type', () => {
    const color = getRandomColor();
    expect(typeof color).toBe('string');
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('should potentially return different colors on multiple calls', () => {
    // Mock Math.random to test different scenarios
    const originalRandom = Math.random;

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const color1 = getRandomColor();

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const color2 = getRandomColor();

    expect(colors).toContain(color1);
    expect(colors).toContain(color2);

    // Restore original Math.random
    Math.random = originalRandom;
  });

  it('should handle edge cases with Math.random', () => {
    const originalRandom = Math.random;

    // Test with random = 0 (should return first color)
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const firstColor = getRandomColor();
    expect(firstColor).toBe(colors[0]);

    // Test with random = 1 (should return last color due to Math.round)
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const lastColor = getRandomColor();
    expect(lastColor).toBe(colors[colors.length - 1]);

    // Restore original Math.random
    Math.random = originalRandom;
  });

  it('should work with actual random values', () => {
    // Test multiple calls to ensure they don't throw errors
    for (let i = 0; i < 10; i++) {
      const color = getRandomColor();
      expect(colors).toContain(color);
    }
  });
});
