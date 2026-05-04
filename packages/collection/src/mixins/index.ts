/**
 * Mixins for extending collection functionality.
 *
 * Design:
 * - Each mixin is a thin wrapper attaching pure methods onto the collection instance
 * - Methods are non-enumerable and preserve `this` binding
 * - This entrypoint enables subpath imports (`@gertsai/collection/mixins/*`) and tree-shaking
 */

// Extended operations (random, sweep, tap, partition, etc.)
export { withExtendedOps, type ExtendedOps } from './ExtendedOps';

// Batch operations (withMutations, groupBy, flip, unique, etc.)
export { withBatchOps, type BatchOps } from './BatchOps';

// Deep operations (getIn, setIn, updateIn, mergeDeep, etc.)
export { withDeepOps, type DeepOps } from './DeepOps';

// Positional access operations (first, last, at, keyAt, etc.)
export { withPositionalAccess, type PositionalAccessOps } from './PositionalAccess';
