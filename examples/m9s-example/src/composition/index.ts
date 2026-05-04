/**
 * Re-export inbound adapter actions so that downstream tools (OpenAPI
 * generators, type-safe `broker.call` helpers, etc.) can introspect them.
 *
 * Mirrors the pattern in apps/pipeline/src/services/index.ts where each
 * domain folder re-exports its registered actions for consumption by
 * `generateOpenAPISchema(typia.json.schema<...>())`.
 */
export { ingestAction } from '../adapters/inbound/moleculer-ingest.adapter';
export { searchAction } from '../adapters/inbound/moleculer-search.adapter';

export { registerServices } from './services';
export { createBrokerConfig } from './broker';
