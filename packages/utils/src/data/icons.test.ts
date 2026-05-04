import { describe, expect, it, vi } from 'vitest';
import { getRandomStatusIcon, statusIcons, statusesIconsMap } from './icons';

describe('icons data', () => {
  describe('statusesIconsMap', () => {
    it('should contain correct status icon mappings', () => {
      expect(statusesIconsMap.exclamation).toBe('status-exclamation');
      expect(statusesIconsMap.ellipsis).toBe('status-ellipsis');
      expect(statusesIconsMap.check).toBe('status-check');
      expect(statusesIconsMap.dash).toBe('status-dash');
      expect(statusesIconsMap.circle).toBe('status-circle');
      expect(statusesIconsMap.quarter).toBe('status-quarter');
      expect(statusesIconsMap.half).toBe('status-half');
      expect(statusesIconsMap['three-quarters']).toBe('status-three-quarters');
      expect(statusesIconsMap.failure).toBe('status-failure');
    });

    it('should have all values prefixed with "status-"', () => {
      Object.values(statusesIconsMap).forEach((iconClass) => {
        expect(iconClass).toMatch(/^status-/);
      });
    });

    it('should have the correct number of status icons', () => {
      expect(Object.keys(statusesIconsMap)).toHaveLength(9);
    });

    it('should have consistent naming convention', () => {
      Object.entries(statusesIconsMap).forEach(([key, value]) => {
        expect(value).toBe(`status-${key}`);
      });
    });
  });

  describe('statusIcons array', () => {
    it('should contain all icon classes from statusesIconsMap', () => {
      const expectedIcons = Object.values(statusesIconsMap);
      expect(statusIcons).toEqual(expectedIcons);
    });

    it('should have the correct length', () => {
      expect(statusIcons).toHaveLength(9);
    });

    it('should contain only valid icon class names', () => {
      statusIcons.forEach((icon) => {
        expect(typeof icon).toBe('string');
        expect(icon).toMatch(/^status-/);
        expect(icon.length).toBeGreaterThan(7); // "status-" is 7 characters
      });
    });

    it('should not contain duplicates', () => {
      const uniqueIcons = [...new Set(statusIcons)];
      expect(uniqueIcons).toHaveLength(statusIcons.length);
    });
  });
});

describe('getRandomStatusIcon', () => {
  it('should return a valid icon from the statusIcons array', () => {
    const icon = getRandomStatusIcon();
    expect(statusIcons).toContain(icon);
  });

  it('should return a string with correct format', () => {
    const icon = getRandomStatusIcon();
    expect(typeof icon).toBe('string');
    expect(icon).toMatch(/^status-/);
  });

  it('should handle edge cases with Math.random', () => {
    const originalRandom = Math.random;

    // Test with random = 0 (should return first icon)
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const firstIcon = getRandomStatusIcon();
    expect(firstIcon).toBe(statusIcons[0]);

    // Test with random = 1 (should return last icon due to Math.round)
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const lastIcon = getRandomStatusIcon();
    expect(lastIcon).toBe(statusIcons[statusIcons.length - 1]);

    // Restore original Math.random
    Math.random = originalRandom;
  });

  it('should potentially return different icons on multiple calls', () => {
    const originalRandom = Math.random;

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const icon1 = getRandomStatusIcon();

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const icon2 = getRandomStatusIcon();

    expect(statusIcons).toContain(icon1);
    expect(statusIcons).toContain(icon2);

    // Restore original Math.random
    Math.random = originalRandom;
  });

  it('should work with actual random values', () => {
    // Test multiple calls to ensure they don't throw errors
    const generatedIcons = new Set();

    for (let i = 0; i < 20; i++) {
      const icon = getRandomStatusIcon();
      expect(statusIcons).toContain(icon);
      generatedIcons.add(icon);
    }

    // With 20 calls, we should have gotten at least some variety
    // (this is probabilistic, but very likely to pass)
    expect(generatedIcons.size).toBeGreaterThan(1);
  });

  it('should maintain consistent array bounds', () => {
    // Mock multiple edge cases
    const originalRandom = Math.random;
    const testValues = [0, 0.1, 0.5, 0.9, 0.99, 1];

    testValues.forEach((randomValue) => {
      vi.spyOn(Math, 'random').mockReturnValue(randomValue);
      const icon = getRandomStatusIcon();
      expect(statusIcons).toContain(icon);
    });

    Math.random = originalRandom;
  });

  it('should return all possible icons given enough calls with mocked random', () => {
    const originalRandom = Math.random;
    const returnedIcons = new Set();

    // Mock Math.random to return values that will hit each index
    statusIcons.forEach((_, index) => {
      const randomValue = index / (statusIcons.length - 1);
      vi.spyOn(Math, 'random').mockReturnValue(randomValue);
      const icon = getRandomStatusIcon();
      returnedIcons.add(icon);
    });

    expect(returnedIcons.size).toBe(statusIcons.length);
    statusIcons.forEach((icon) => {
      expect(returnedIcons.has(icon)).toBe(true);
    });

    Math.random = originalRandom;
  });
});
