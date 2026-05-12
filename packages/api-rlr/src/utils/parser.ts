import type { ClientRateLimitInfo } from './types';

export const parseScriptResponse = (results: number[]): ClientRateLimitInfo => {
  if (!Array.isArray(results)) {
    throw new TypeError('Expected result to be array of values');
  }
  if (results.length !== 3 && results.length !== 4) {
    throw new Error(`Expected 3 or 4 replies, got ${results.length}`);
  }

  // If 4 elements, first is allow flag – skip it for metrics parsing
  const offset = results.length === 4 ? 1 : 0;

  const a = results[offset];
  const b = results[offset + 1];
  const c = results[offset + 2];
  const totalHits = a !== undefined && a > 0 ? toInt(a) : 0;
  const remainingHits = b !== undefined && b > 0 ? toInt(b) : 0;
  const expiryTime = c !== undefined && c > 0 ? toInt(c) : 0;

  return {
    totalHits,
    remainingHits,
    expiryTime: Math.ceil(expiryTime / 1000) * 1000,
  };
};

export const toInt = (input: string | number | boolean | undefined): number => {
  if (typeof input === 'number') {
    return input;
  }
  return Number.parseInt((input ?? '').toString(), 10);
};
