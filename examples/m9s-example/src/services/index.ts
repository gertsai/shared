/**
 * Top-level services barrel.
 *
 * Mirrors `apps/pipeline/src/services/index.ts`:
 *
 *   - Side-effect imports register each domain controller in
 *     `ApiController._controllers` (via `resolveExampleController`) and
 *     attach their lifecycle handlers. Importing this module from
 *     `src/index.ts` is what makes the controllers discoverable when
 *     `ApiController.Start` later calls `controllers => generateServiceSchema()`.
 *
 *   - Namespace re-exports allow downstream tooling (OpenAPI generators,
 *     type-safe `broker.call` helpers) to introspect the registered
 *     actions without duplicating the import list.
 */

// Side-effect imports — register controllers + handlers.
import './ingest';
import './search';

// Namespace re-exports for OpenAPI generators / typed clients.
// oxlint-disable import/no-namespace
export * as ingest from './ingest';
export * as search from './search';
