/**
 * Specialized collection types
 * Export all specialized collections from a single entry point
 */

// Bidirectional map
export { BiMap } from './BiMap';

// Multi-value map
export { MultiMap, type MultiMapOptions } from './MultiMap';

// Ordered map with predictable iteration
export { OrderedMap } from './OrderedMap';

// Weak reference collections
export {
  WeakCollection,
  WeakBiMap,
  WeakValueMap,
  type IWeakCollection,
} from './WeakCollection';
