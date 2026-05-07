// SPDX-License-Identifier: Apache-2.0
/**
 * OpenFGA bootstrap script — Sprint 3.11 m9s-example.
 *
 * Idempotently:
 *   1. Connects to OpenFGA at `FGA_API_URL` (default http://localhost:8080).
 *   2. Locates an existing store named "m9s-example" or creates one.
 *   3. Writes the canonical authorization model (matches `openfga/model.fga`).
 *   4. Writes bootstrap tuples from `openfga/bootstrap-tuples.yaml`.
 *
 * Output:
 *   Echoes `FGA_STORE_ID=<uuid>` to stdout (parseable by shell scripts).
 *   Subsequent runs report "store already exists" and "model already current"
 *   without writing duplicates.
 *
 * Usage:
 *   pnpm --filter @gertsai-examples/m9s-example exec tsx scripts/openfga-bootstrap.ts
 *   FGA_API_URL=http://localhost:8080 node dist/scripts/openfga-bootstrap.js
 *
 * Wave 6 §OpenFGA-model-drift-CI:
 *   `AUTHORIZATION_MODEL` below is exported and asserted by
 *   `tests/openfga-model.test.ts` to deep-equal the parsed `openfga/model.fga`
 *   via `@openfga/syntax-transformer`. The transformer is a devDependency
 *   used ONLY by the test — bootstrap runtime stays parser-free, so a future
 *   transformer regression cannot break production rollout. Drift between
 *   the inline JSON and the DSL fails the test in CI.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// Lazy-loaded `@openfga/sdk` — re-exported by `@gertsai/auth-openfga` so
// m9s-example doesn't carry a direct dependency. The module is fully typed
// once loaded; we type-erase the import call to avoid a top-level ESM-only
// `import` resolution at TypeScript compile time (this script is built as
// CommonJS via tspc + tsconfig.module=CommonJS).
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OpenFgaClient } = require('@openfga/sdk') as typeof import('@openfga/sdk');
type OpenFgaClient = InstanceType<typeof OpenFgaClient>;

interface BootstrapTupleFile {
  readonly tuples: ReadonlyArray<{
    readonly user: string;
    readonly relation: string;
    readonly object: string;
  }>;
}

const STORE_NAME = 'm9s-example';

/**
 * JSON form of `openfga/model.fga` — kept in sync with the DSL by the
 * `tests/openfga-model.test.ts` drift guard (Wave 6 §OpenFGA-model-drift-CI).
 * Exported so the test can deep-equal it against the parsed DSL.
 *
 * The shape exactly matches the canonical output of
 * `@openfga/syntax-transformer.transformer.transformDSLToJSONObject` on
 * the current `model.fga` — including parser-default fields like
 * `metadata: null` for typeless types and `directly_related_user_types: []`
 * for derived (tupleToUserset) relations. To regenerate after editing the
 * DSL: re-run the drift-guard test, copy the parser output into this
 * constant, and re-run the test until green. The DSL is canonical to
 * humans; this constant is canonical to OpenFGA at write time.
 *
 * Conforms to OpenFGA schema 1.1.
 */
export const AUTHORIZATION_MODEL = {
  schema_version: '1.1',
  type_definitions: [
    {
      type: 'user',
      relations: {},
      metadata: null,
    },
    {
      type: 'tenant',
      relations: {
        member: { this: {} },
      },
      metadata: {
        relations: {
          member: { directly_related_user_types: [{ type: 'user' }] },
        },
      },
    },
    {
      type: 'document',
      relations: {
        tenant: { this: {} },
        can_view: {
          tupleToUserset: {
            computedUserset: { relation: 'member' },
            tupleset: { relation: 'tenant' },
          },
        },
        can_edit: {
          tupleToUserset: {
            computedUserset: { relation: 'member' },
            tupleset: { relation: 'tenant' },
          },
        },
      },
      metadata: {
        relations: {
          tenant: { directly_related_user_types: [{ type: 'tenant' }] },
          can_view: { directly_related_user_types: [] },
          can_edit: { directly_related_user_types: [] },
        },
      },
    },
  ],
} as const;

function getOpenFgaApiUrl(): string {
  // Read FGA_API_URL preferentially (m9s-example convention per ADR-011 §A2.7).
  // Fall back to OPENFGA_API_URL (the @gertsai/auth-openfga package convention)
  // for shells that exported it instead. Final fallback: localhost:8080.
  return (
    process.env.FGA_API_URL ?? process.env.OPENFGA_API_URL ?? 'http://localhost:8080'
  );
}

async function readBootstrapTuples(): Promise<BootstrapTupleFile> {
  // CommonJS: `__dirname` is the directory of THIS module after compilation.
  // Resolve openfga/ relative to scripts/ — same when running from src/ or dist/.
  const candidate = path.resolve(__dirname, '..', 'openfga', 'bootstrap-tuples.yaml');
  const buf = await fs.readFile(candidate, 'utf8');
  return parseBootstrapYaml(buf);
}

/**
 * Minimal YAML subset parser — bootstrap-tuples.yaml uses a fixed shape:
 *   tuples:
 *     - user: ...
 *       relation: ...
 *       object: ...
 *
 * Keeping a single-purpose parser avoids pulling `js-yaml` into m9s-example
 * just for one file. Comments (`#`) and blank lines are skipped.
 */
function parseBootstrapYaml(text: string): BootstrapTupleFile {
  const tuples: Array<{ user: string; relation: string; object: string }> = [];
  let current: Partial<{ user: string; relation: string; object: string }> = {};
  let inTuples = false;

  const flush = () => {
    if (current.user && current.relation && current.object) {
      tuples.push({
        user: current.user,
        relation: current.relation,
        object: current.object,
      });
    }
    current = {};
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed === 'tuples:') {
      inTuples = true;
      continue;
    }
    if (!inTuples) continue;

    if (trimmed.startsWith('- ')) {
      flush();
      const rest = trimmed.slice(2).trim();
      const [k, v] = splitKv(rest);
      if (k && v) (current as Record<string, string>)[k] = v;
    } else {
      const [k, v] = splitKv(trimmed);
      if (k && v) (current as Record<string, string>)[k] = v;
    }
  }
  flush();

  return { tuples };
}

function splitKv(line: string): [string | null, string | null] {
  const idx = line.indexOf(':');
  if (idx < 0) return [null, null];
  const k = line.slice(0, idx).trim();
  const v = line.slice(idx + 1).trim();
  return [k, v];
}

async function findOrCreateStore(client: OpenFgaClient): Promise<string> {
  const list = await client.listStores();
  const existing = list.stores?.find((s: { id?: string; name?: string }) => s.name === STORE_NAME);
  if (existing?.id) {
    console.log(`[openfga-bootstrap] store '${STORE_NAME}' exists (id=${existing.id})`);
    return existing.id;
  }
  const created = await client.createStore({ name: STORE_NAME });
  if (!created.id) {
    throw new Error(`OpenFGA createStore returned no id for '${STORE_NAME}'`);
  }
  console.log(`[openfga-bootstrap] store '${STORE_NAME}' created (id=${created.id})`);
  return created.id;
}

async function ensureAuthorizationModel(
  apiUrl: string,
  storeId: string,
): Promise<string> {
  const scoped = new OpenFgaClient({ apiUrl, storeId });
  const existing = await scoped.readAuthorizationModels();
  // Heuristic: any existing model is treated as up-to-date for idempotency.
  // Schema migrations require a separate procedure (drop+recreate store) —
  // out of scope for Sprint 3.11.
  const top = existing.authorization_models?.[0];
  if (top?.id) {
    console.log(
      `[openfga-bootstrap] authorization model already present (id=${top.id}); skipping write`,
    );
    return top.id;
  }
  const written = await scoped.writeAuthorizationModel(
    AUTHORIZATION_MODEL as unknown as Parameters<typeof scoped.writeAuthorizationModel>[0],
  );
  if (!written.authorization_model_id) {
    throw new Error('OpenFGA writeAuthorizationModel returned no id');
  }
  console.log(
    `[openfga-bootstrap] authorization model written (id=${written.authorization_model_id})`,
  );
  return written.authorization_model_id;
}

async function ensureBootstrapTuples(
  apiUrl: string,
  storeId: string,
  authorizationModelId: string,
): Promise<void> {
  const tuples = (await readBootstrapTuples()).tuples;
  if (tuples.length === 0) {
    console.log('[openfga-bootstrap] no bootstrap tuples to write');
    return;
  }
  const scoped = new OpenFgaClient({ apiUrl, storeId, authorizationModelId });

  // OpenFGA `writeTuples` rejects already-present tuples with HTTP 400. We
  // try and swallow per-tuple errors so re-runs are idempotent.
  for (const t of tuples) {
    try {
      await scoped.writeTuples([t]);
      console.log(
        `[openfga-bootstrap] tuple written (${t.user}, ${t.relation}, ${t.object})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Sprint 3.11 Post-Build Track 2 §P1-4: narrowed to 'already exists'
      // only. `write_failed_due_to_invalid_input` covers schema/type
      // mismatches AND duplicate-tuple cases on some OpenFGA versions —
      // treating both as "already present" can mask a typo'd tenant id as
      // a successful bootstrap. Explicit duplicate-tuple errors are reported.
      if (msg.includes('already exists') || msg.includes('cannot write a tuple which already exists')) {
        console.log(
          `[openfga-bootstrap] tuple already present (${t.user}, ${t.relation}, ${t.object})`,
        );
        continue;
      }
      throw err;
    }
  }
}

async function main(): Promise<void> {
  const apiUrl = getOpenFgaApiUrl();
  console.log(`[openfga-bootstrap] connecting to OpenFGA at ${apiUrl}`);

  const discovery = new OpenFgaClient({ apiUrl });
  const storeId = await findOrCreateStore(discovery);
  const modelId = await ensureAuthorizationModel(apiUrl, storeId);
  await ensureBootstrapTuples(apiUrl, storeId, modelId);

  // Echo to stdout in `KEY=VALUE` form so callers can `eval $(... bootstrap)`
  // or grep with sed.
  console.log(`FGA_STORE_ID=${storeId}`);
  console.log(`FGA_AUTHORIZATION_MODEL_ID=${modelId}`);
}

// Run only when invoked directly (not when imported by tests).
// CommonJS: `require.main === module` is the canonical "is this the entry
// point?" check. Falls back to argv comparison when bundlers strip `require.main`.
const invokedDirectly = (() => {
  try {
    if (typeof require !== 'undefined' && require.main === module) return true;
    return process.argv[1] && __filename === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error('[openfga-bootstrap] FAILED:', err);
    process.exitCode = 1;
  });
}

export { main as bootstrapOpenFga };
