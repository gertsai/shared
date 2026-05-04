import type { ReadableCollection } from '../types/interfaces';

/**
 * Structural equality for collections using Object.is for value comparison.
 * Returns true if both collections have the same size and identical key/value pairs.
 */
export function equalsByObjectIs<K, V>(
  a: ReadableCollection<K, V>,
  b: ReadableCollection<K, V>,
): boolean {
  if (a === b) {
    return true;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a.entries()) {
    if (!b.has(key) || !Object.is(b.get(key), value)) {
      return false;
    }
  }
  return true;
}
