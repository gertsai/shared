/**
 * Ingest Service — actions & queues re-exports.
 *
 * Aggregates the action and queue modules. Side-effect imports inside
 * `actions/` register the actions with the global ApiController registry;
 * importing this file (transitively from `services/ingest/index.ts`) is
 * what makes them discoverable at broker boot.
 */

// Actions (REST endpoints)
export * from './actions';

// Queues (BullMQ workers + handle types)
export * from './queues';
