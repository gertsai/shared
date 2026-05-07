import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  formatFileSizeParts,
} from './fileSize';

describe('formatFileSize', () => {
  it('should return "0B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0B');
  });

  it('should format bytes correctly', () => {
    expect(formatFileSize(1023)).toBe('1KB');
  });

  it('should format kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1KB');
    expect(formatFileSize(1536)).toBe('1.5KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatFileSize(1048576)).toBe('1MB');
    expect(formatFileSize(1572864)).toBe('1.5MB');
  });

  it('should format gigabytes correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1GB');
    expect(formatFileSize(1610612736)).toBe('1.5GB');
  });
});

describe('formatFileSizeParts', () => {
  it('should format file size parts correctly', () => {
    const result = formatFileSizeParts([512, 1024]);
    expect(result).toBe('0.5/1KB');
  });

  it('should handle exact unit matches', () => {
    const result = formatFileSizeParts([1024, 2048]);
    expect(result).toBe('1/2KB');
  });

  it('should handle larger sizes', () => {
    const result = formatFileSizeParts([1024 * 1024, 2 * 1024 * 1024]);
    expect(result).toBe('1/2MB');
  });

  it('should handle decimal formatting', () => {
    const result = formatFileSizeParts([1536, 3072]); // 1.5KB each
    expect(result).toBe('1.5/3KB');
  });
});
