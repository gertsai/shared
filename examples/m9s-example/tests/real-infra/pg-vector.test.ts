// SPDX-License-Identifier: Apache-2.0
/**
 * Real-infra test — PgVectorStore + PgDocumentRepository against a live
 * Postgres + pgvector instance (Sprint 3.11 W-3-11-8).
 *
 * Env-gated per ADR-011 I-5: skipped unless `PGVECTOR_E2E=1` and
 * `POSTGRES_URL` are both set. Locally the docker-compose.yml in this
 * package brings up `pgvector/pgvector:pg16` listening on `:5432`.
 *
 * Coverage:
 *   1. Round-trip: ingest a document + chunks → search returns the chunk
 *      with score above threshold.
 *   2. Tenant isolation (I-13): two tenants share the table, search with
 *      tenant A returns ONLY tenant A rows.
 *   3. Update path: re-saving a document overwrites the row without
 *      duplicating tuples.
 *   4. Cosine ordering: nearer vectors score higher than farther ones.
 *
 * Migrations are assumed applied: the suite errors loudly if `documents`
 * or `chunks` is missing rather than silently creating ad-hoc DDL.
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { PgClientAdapter } from '../../src/infrastructure/pg-client.adapter';
import { PgDocumentRepository } from '../../src/infrastructure/pg-document.repository';
import { PgVectorStore } from '../../src/infrastructure/pg-vector.store';

const SHOULD_RUN = process.env.PGVECTOR_E2E === '1' && Boolean(process.env.POSTGRES_URL);

const describeOrSkip = SHOULD_RUN ? describe : describe.skip;

describeOrSkip('real-infra :: PgVectorStore + PgDocumentRepository', () => {
  const url = process.env.POSTGRES_URL ?? '';
  let pgClient: PgClientAdapter;
  const TENANT_A = 'tenant-test-a';
  const TENANT_B = 'tenant-test-b';

  beforeAll(async () => {
    pgClient = new PgClientAdapter({ connectionString: url });
    const probe = await pgClient.$queryRaw<{ count: string }>`
      SELECT COUNT(*)::text AS count
        FROM information_schema.tables
       WHERE table_name IN ('documents', 'chunks')
    `;
    if (probe.length === 0 || Number.parseInt(probe[0].count, 10) < 2) {
      throw new Error(
        "Migrations missing: run `pnpm --filter @gertsai-examples/m9s-example migrate:up` before this suite.",
      );
    }
  });

  afterAll(async () => {
    if (pgClient) await pgClient.$disconnect();
  });

  beforeEach(async () => {
    // Wipe only the test tenants to keep the suite hermetic.
    await pgClient.$executeRaw`DELETE FROM chunks WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`;
    await pgClient.$executeRaw`DELETE FROM documents WHERE tenant_id IN (${TENANT_A}, ${TENANT_B})`;
  });

  function makeStores(tenantId: string) {
    const docs = new PgDocumentRepository({
      client: pgClient,
      tenantId,
      ownerUuid: 'user:test',
      writeFgaTuples: false,
    });
    const chunks = new PgVectorStore({ client: pgClient, tenantId });
    return { docs, chunks };
  }

  function unitVector(seed: number): number[] {
    // Deterministic-but-distinct vectors per seed; 768-dim matches schema.
    const v = Array.from({ length: 768 }, (_, i) =>
      Math.sin(seed * 0.1 + i * 0.001),
    );
    const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
    return v.map((x) => x / norm);
  }

  it('round-trips a document + chunks and finds them via cosine search', async () => {
    const { docs, chunks } = makeStores(TENANT_A);
    const docId = randomUUID();
    await docs.save({ id: docId, text: 'hello world', metadata: { source: 'test' } });
    const vector = unitVector(1);
    await chunks.addChunks([
      { docId, idx: 0, text: 'hello world', vector },
    ]);

    const hits = await chunks.search(vector, 5);
    expect(hits.length).toBe(1);
    expect(hits[0].docId).toBe(docId);
    expect(hits[0].chunkIdx).toBe(0);
    expect(hits[0].score).toBeGreaterThan(0.99);

    const fetched = await docs.findById(docId);
    expect(fetched?.id).toBe(docId);
    expect(fetched?.text).toBe('hello world');
  });

  it('isolates chunks by tenant_id (I-13 adversarial)', async () => {
    const aStores = makeStores(TENANT_A);
    const bStores = makeStores(TENANT_B);

    const docA = randomUUID();
    const docB = randomUUID();
    await aStores.docs.save({ id: docA, text: 'tenant a private', metadata: {} });
    await bStores.docs.save({ id: docB, text: 'tenant b private', metadata: {} });

    const vA = unitVector(2);
    const vB = unitVector(3);
    await aStores.chunks.addChunks([{ docId: docA, idx: 0, text: 'tenant a private', vector: vA }]);
    await bStores.chunks.addChunks([{ docId: docB, idx: 0, text: 'tenant b private', vector: vB }]);

    const hitsA = await aStores.chunks.search(vA, 10);
    const hitsB = await bStores.chunks.search(vB, 10);

    expect(hitsA.map((h) => h.docId)).toEqual([docA]);
    expect(hitsB.map((h) => h.docId)).toEqual([docB]);
    expect(hitsA.some((h) => h.docId === docB)).toBe(false);
    expect(hitsB.some((h) => h.docId === docA)).toBe(false);

    // Cross-tenant findById refuses leakage.
    expect(await aStores.docs.findById(docB)).toBeNull();
    expect(await bStores.docs.findById(docA)).toBeNull();
  });

  it('re-saves a document idempotently (upsert via UPDATE)', async () => {
    const { docs } = makeStores(TENANT_A);
    const docId = randomUUID();
    await docs.save({ id: docId, text: 'v1', metadata: {} });
    await docs.save({ id: docId, text: 'v2', metadata: { tags: ['retry'] } });

    const fetched = await docs.findById(docId);
    expect(fetched?.text).toBe('v2');
    expect(fetched?.metadata?.tags).toEqual(['retry']);

    const rows = await pgClient.$queryRaw<{ count: string }>`
      SELECT COUNT(*)::text AS count FROM documents WHERE id = ${docId}
    `;
    expect(Number.parseInt(rows[0].count, 10)).toBe(1);
  });

  it('orders results by cosine similarity (nearer first)', async () => {
    const { docs, chunks } = makeStores(TENANT_A);
    const docId = randomUUID();
    await docs.save({ id: docId, text: 'ordering check', metadata: {} });

    const near = unitVector(10);
    const far = unitVector(99);
    await chunks.addChunks([
      { docId, idx: 0, text: 'near', vector: near },
      { docId, idx: 1, text: 'far', vector: far },
    ]);

    const hits = await chunks.search(near, 2);
    expect(hits.length).toBe(2);
    expect(hits[0].chunkIdx).toBe(0);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });
});
