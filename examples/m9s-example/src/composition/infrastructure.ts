/**
 * Composition Root — m9s-example.
 *
 * Builds the outbound-adapter graph ONCE at module-load time and exports a
 * single `infrastructure` object that BOTH services (`ingest`, `search`)
 * import. This is the only place in the codebase that knows the full set
 * of concrete adapters; everywhere else depends on ports.
 *
 * Sprint 3.11 (W-3-11-6): adds env-driven `STORAGE_PROVIDER` switch — when
 * set to `'postgres'` the document + chunk stores are backed by Postgres
 * via `@gertsai/pg-client` (per ADR-011 Decision A revised by Amendment 2
 * §A2.5/A2.6). The original in-process `MemoryVectorStore` +
 * `DocumentRepository` path remains the default so memory-mode tests
 * continue to pass.
 *
 * Pre-existing notes (preserved):
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
 */
import config from '../../project.config';

import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { Session } from '@gertsai/session';

import { DocumentRepository } from '../infrastructure/document.repository';
import type { DocumentMeta as MemoryDocumentMeta } from '../infrastructure/document.repository';
import { MemoryVectorStore } from '../infrastructure/memory-vector.store';
import { MockEmbedder } from '../infrastructure/mock-embedder';
import { OllamaEmbedder } from '../infrastructure/ollama-embedder';
import { OpenAIEmbedder } from '../infrastructure/openai-embedder';
import { AllowAllPermissionGate } from '../infrastructure/allow-all-permission.gate';
import { OpenFgaPermissionGate } from '../infrastructure/openfga-permission.gate';
import { PgClientAdapter } from '../infrastructure/pg-client.adapter';
import { PgDocumentRepository } from '../infrastructure/pg-document.repository';
import { PgVectorStore } from '../infrastructure/pg-vector.store';

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
  const { docStore, chunkStore } = pickStores();
  const embedder = pickEmbedder();
  const gate = pickGate();

  return { docStore, chunkStore, embedder, gate };
}

/**
 * Choose the permission gate based on `AUTH_GATE`.
 *
 * 'allow-all' (default): demo path; allows all checks. Per ADR-011 I-12
 *   this is REFUSED at boot when `NODE_ENV='production'` — fail-closed.
 *
 * 'openfga': production-shaped path via `OpenFgaPermissionGate`. Requires a
 *   running OpenFGA + an existing store id (provisioned by
 *   `scripts/openfga-bootstrap.ts`).
 */
function pickGate(): IPermissionGate {
  switch (config.AUTH_GATE) {
    case 'openfga': {
      if (!config.FGA_STORE_ID || config.FGA_STORE_ID.trim().length === 0) {
        throw new Error(
          "AUTH_GATE='openfga' requires FGA_STORE_ID to be set (run scripts/openfga-bootstrap.ts).",
        );
      }
      // Wave 6.2 (RFC-003 Edge 2): apiToken is now plumbed end-to-end
      // through `@gertsai/auth-openfga` to the SDK bearer credentials.
      // Under EOPT we conditionally spread `apiToken` so unset env vars
      // omit the key entirely (keeps OpenFGA anonymous, NFR-2 back-compat).
      const fgaApiToken = config.FGA_API_TOKEN || undefined;
      return new OpenFgaPermissionGate({
        client: {
          apiUrl: config.FGA_API_URL,
          storeId: config.FGA_STORE_ID,
          ...(fgaApiToken !== undefined && { apiToken: fgaApiToken }),
        },
        logger: console,
      });
    }
    case 'allow-all':
    default: {
      if (config.NODE_ENV === 'production') {
        throw new Error(
          "AUTH_GATE='allow-all' is refused under NODE_ENV='production' (ADR-011 I-12 fail-closed). Set AUTH_GATE='openfga'.",
        );
      }
      return new AllowAllPermissionGate(console);
    }
  }
}

/**
 * Choose the document + chunk stores based on `STORAGE_PROVIDER`.
 *
 * 'memory' (default): the Sprint 3.4 in-process pair —
 *   `DocumentRepository extends BaseEntityStorageService` over
 *   `InMemoryStorageProvider`, plus the array-backed `MemoryVectorStore`.
 *
 * 'postgres': Sprint 3.11 path — `PgDocumentRepository` + `PgVectorStore`
 *   over a single `PgClientAdapter` (`pg@^8.13` pool). Requires a running
 *   Postgres with `pgvector` extension and the migrations in
 *   `examples/m9s-example/migrations/` applied.
 */
function pickStores(): {
  readonly docStore: IDocumentStore;
  readonly chunkStore: IChunkStore;
} {
  switch (config.STORAGE_PROVIDER) {
    case 'postgres': {
      if (!config.POSTGRES_URL || config.POSTGRES_URL.trim().length === 0) {
        throw new Error(
          "STORAGE_PROVIDER='postgres' requires POSTGRES_URL to be set.",
        );
      }
      const pgClient = new PgClientAdapter({ connectionString: config.POSTGRES_URL });
      const docStore = new PgDocumentRepository({
        client: pgClient,
        tenantId: config.TENANT_ID,
        ownerUuid: config.DEFAULT_OWNER_UUID,
        // OpenFGA tuple writes require a configured FGA store; default-on in
        // production but tests can flip via composition seam (see m9s
        // tests/real-infra/pg-vector.test.ts).
        writeFgaTuples: true,
        logger: console,
      });
      const chunkStore = new PgVectorStore({
        client: pgClient,
        tenantId: config.TENANT_ID,
      });
      return { docStore, chunkStore };
    }

    case 'memory':
    default: {
      const documentProvider = new InMemoryStorageProvider<MemoryDocumentMeta>();
      const systemSession = createSystemSession();
      const docStore = new DocumentRepository(documentProvider, systemSession);
      const chunkStore = new MemoryVectorStore();
      return { docStore, chunkStore };
    }
  }
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
 * System-level session for the example's composition root.
 *
 * Sprint 3.5.2: m9s-example uses one session for ALL writes via the shared
 * DocumentRepository singleton. Audit fields (creator_uuid, created_*) come
 * from this session. A production deployment would scope sessions per-
 * request — see Phase 5+ follow-up notes in the README.
 *
 * Only the 'memory' branch of `pickStores()` consumes this; the 'postgres'
 * branch does its own audit stamping at the SQL layer.
 */
function createSystemSession(): Session {
  return new Session({
    operatorUuid: 'system',
    operatorType: 'system',
    tokenGetter: async () => '',
    dialog: {
      confirm: async () => true,
      alert: () => {},
      error: () => {},
    },
    clientPlatform: 'system',
    clientVersion: config.APP_VERSION,
  });
}

// TODO queue-worker: env-driven RedisCacheDriver vs MemoryCacheDriver swap
//   (Track 3). Today the m9s-cache wiring lives in `moleculer.config.ts`
//   gated on `if (config.REDIS_URL)`; the queue-worker patch will surface
//   that decision here so the composition root remains the single source
//   of truth for backend selection.

/**
 * Module-level singleton. Imported by:
 *   - `services/ingest/lifecycle.ts`
 *   - `services/search/lifecycle.ts`
 *
 * Both services see the same `docStore` / `chunkStore` so an ingest in one
 * service is visible to a query in the other.
 */
export const infrastructure: SharedInfrastructure = buildInfrastructure();
