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

  const totalHits = results[offset] > 0 ? toInt(results[offset]) : 0;
  const remainingHits = results[offset + 1] > 0 ? toInt(results[offset + 1]) : 0;
  const expiryTime = results[offset + 2] > 0 ? toInt(results[offset + 2]) : 0;

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
