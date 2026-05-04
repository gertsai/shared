/**
 * Ingest Service — domain entry point.
 *
 * Mirrors `apps/pipeline/src/services/ingest/index.ts`:
 *
 *   - `import './lifecycle'` MUST run first — it registers the controller
 *     in `ApiController._controllers` and attaches its started/stopped
 *     handlers.
 *   - Re-export the actions + queues so OpenAPI generators or consumers
 *     can introspect their typia validators.
 *   - Re-export the public types (request/response shapes, ServiceContext).
 */

// Lifecycle MUST be imported first — registers controller + handlers.
import './lifecycle';

// Actions + queues
export * from './src';

// Types
export * from './types';
