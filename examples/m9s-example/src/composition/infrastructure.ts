/**
 * Composition Root — m9s-example.
 *
 * Builds the outbound-adapter graph ONCE at module-load time and exports a
 * single `infrastructure` object that BOTH services (`ingest`, `search`)
 * import. This is the only place in the codebase that knows the full set
 * of concrete adapters; everywhere else depends on ports.
 *
 * Why a shared root instead of per-service construction?
 *
 *   The previous shape (each `lifecycle.ts` calling `new MemoryVectorStore()`
 *   itself) was self-contained per service but produced TWO independent
 *   in-memory stores in the same Node.js process. Search would always return
 *   `0 results` because it never saw what ingest had written. A real
 *   deployment papers over this with a shared vector DB; for an in-memory
 *   demo we paper over it with a singleton.
 *
 * Why module-load time and not in `started()`?
 *
 *   The lifecycle handlers run in dependency order — ingest's handler may
 *   fire before search's, but they both must observe the SAME instance. By
 *   resolving the singleton at import time we guarantee identity.
 *
 * Adapter selection mirrors `apps/pipeline/src/composition/*` style:
 * factory functions read `project.config` and pick an implementation by env
 * (`EMBEDDER_PROVIDER` = `'mock' | 'ollama' | 'openai'`).
 */
import config from '../../project.config';

import { MemoryDocumentStore } from '../infrastructure/memory-document.store';
import { MemoryVectorStore } from '../infrastructure/memory-vector.store';
import { MockEmbedder } from '../infrastructure/mock-embedder';
import { OllamaEmbedder } from '../infrastructure/ollama-embedder';
import { OpenAIEmbedder } from '../infrastructure/openai-embedder';
import { AllowAllPermissionGate } from '../infrastructure/allow-all-permission.gate';

import type { IDocumentStore } from '../domain/ports/IDocumentStore';
import type { IChunkStore } from '../domain/ports/IChunkStore';
import type { IEmbedder } from '../domain/ports/IEmbedder';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';

/**
 * The bundle of outbound adapters wired into both use cases.
 *
 * Stays minimal: anything domain-level that depends on transport (logger,
 * tracer, …) gets injected via the per-service `ServiceContextBase` rather
 * than this shared bag.
 */
export interface SharedInfrastructure {
  readonly docStore: IDocumentStore;
  readonly chunkStore: IChunkStore;
  readonly embedder: IEmbedder;
  readonly gate: IPermissionGate;
}

/**
 * Build the shared adapter graph. Called exactly once via the module-level
 * `export const infrastructure = buildInfrastructure()` at the bottom of
 * this file — exported separately so tests can construct an isolated
 * instance if they need to.
 */
export function buildInfrastructure(): SharedInfrastructure {
  const docStore = new MemoryDocumentStore();
  const chunkStore = new MemoryVectorStore();
  const embedder = pickEmbedder();
  const gate = new AllowAllPermissionGate(console);

  return { docStore, chunkStore, embedder, gate };
}

/**
 * Choose an embedder based on `EMBEDDER_PROVIDER`. Falls back to the
 * deterministic mock so the example boots with zero env vars.
 */
function pickEmbedder(): IEmbedder {
  switch (config.EMBEDDER_PROVIDER) {
    case 'ollama':
      return new OllamaEmbedder({
        url: config.EMBEDDER_URL,
        model: config.EMBEDDER_MODEL,
      });

    case 'openai': {
      if (!config.EMBEDDER_API_KEY || config.EMBEDDER_API_KEY.trim().length === 0) {
        throw new Error(
          "EMBEDDER_PROVIDER='openai' requires EMBEDDER_API_KEY to be set.",
        );
      }
      return new OpenAIEmbedder({
        apiKey: config.EMBEDDER_API_KEY,
        // OpenAI's smallest current generation. Override via EMBEDDER_MODEL.
        model: config.EMBEDDER_MODEL || 'text-embedding-3-small',
      });
    }

    case 'mock':
    default:
      return new MockEmbedder(384);
  }
}

/**
 * Module-level singleton. Imported by:
 *   - `services/ingest/lifecycle.ts`
 *   - `services/search/lifecycle.ts`
 *
 * Both services see the same `docStore` / `chunkStore` so an ingest in one
 * service is visible to a query in the other.
 */
export const infrastructure: SharedInfrastructure = buildInfrastructure();
