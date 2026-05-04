import { describe, expect, it } from 'vitest';
import { convertDateStringToDate } from './convertDateString';

describe('convertDateStringToDate', () => {
  it('should convert a date string to a Date object', () => {
    const date = convertDateStringToDate('5 days');
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + 5);
    expect(date.getDate()).toBe(expectedDate.getDate());
  });

  it('should handle minutes correctly', () => {
    const date = convertDateStringToDate('30 minutes');
    const expectedDate = new Date();
    expectedDate.setMinutes(expectedDate.getMinutes() + 30);
    expect(date.getMinutes()).toBe(expectedDate.getMinutes());
  });

  it('should handle singular forms', () => {
    const dayDate = convertDateStringToDate('1 day');
    const monthDate = convertDateStringToDate('1 month');
    const yearDate = convertDateStringToDate('1 year');
    const minuteDate = convertDateStringToDate('1 minute');

    expect(dayDate).toBeInstanceOf(Date);
    expect(monthDate).toBeInstanceOf(Date);
    expect(yearDate).toBeInstanceOf(Date);
    expect(minuteDate).toBeInstanceOf(Date);
  });

  it('should throw an error for invalid format', () => {
    expect(() => convertDateStringToDate('invalid' as any)).toThrow(
      'Input string must be in format "number unit"',
    );
    expect(() => convertDateStringToDate('5' as any)).toThrow(
      'Input string must be in format "number unit"',
    );
    expect(() => convertDateStringToDate('five days' as any)).toThrow(
      'The first part of the input string must be a number.',
    );
  });

  it('should throw an error for zero or negative numbers', () => {
    expect(() => convertDateStringToDate('0 days' as any)).toThrow(
      'The number must be greater than 0.',
    );
    expect(() => convertDateStringToDate('-1 days' as any)).toThrow(
      'The number must be greater than 0.',
    );
  });

  it('should throw an error for unknown time units', () => {
    expect(() => convertDateStringToDate('5 hours' as any)).toThrow(
      'Unknown time unit: hours. Use "minutes", "days", "months", or "years".',
    );
    expect(() => convertDateStringToDate('10 weeks' as any)).toThrow(
      'Unknown time unit: weeks. Use "minutes", "days", "months", or "years".',
    );
  });
});
