/**
 * Internal symbol-based data accessor to avoid exposing raw storage publicly.
 * Mixins and core internals should use this to access underlying Map.
 */

export const INTERNAL_DATA = Symbol('@@orchlab/collection/internal-data@@');

export interface HasInternalData<K, V> {
  [INTERNAL_DATA](): Map<K, V>;
}
