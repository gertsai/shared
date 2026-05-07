// SPDX-License-Identifier: Apache-2.0
/**
 * PgVectorStore — `IChunkStore` implementation backed by `pgvector` via
 * `PgClient` raw SQL (Sprint 3.11 W-3-11-5).
 *
 * Direct `PgClient` use here mirrors `PgDocumentRepository` (per ADR-011
 * Decision A revised by Amendment 2 §A2.5) — the schema in
 * `migrations/001_init_documents_chunks.up.sql` is normalised, vector
 * operations live outside the IStorageProvider abstraction by design, and
 * `PgStorageProvider` can only model jsonb-blob shapes.
 *
 * Critical invariant — Sprint 3.11 ADR-011 I-13:
 *   Every SQL on `chunks` issued by m9s-example MUST include
 *   `WHERE tenant_id = $1` (or the equivalent INSERT column for writes).
 *   This is the LAST line of defence against cross-tenant leakage when
 *   the OpenFGA gate is misconfigured. Adversarial test in
 *   `tests/real-infra/pg-vector.test.ts` verifies this invariant against
 *   live Postgres.
 */
import { randomUUID } from 'node:crypto';

import type { PgClient } from '@gertsai/pg-client';

import type { Chunk, ChunkSearchHit } from '../domain/chunk';
import type { IChunkStore } from '../domain/ports/IChunkStore';

export interface PgVectorStoreOptions {
  /** PgClient instance — typically `PgClientAdapter` in production. */
  readonly client: PgClient;
  /**
   * Tenant id whose chunks this store reads + writes. Mandatory: every
   * SQL is filtered by this value (I-13). m9s-example runs one tenant
   * per process.
   */
  readonly tenantId: string;
  /**
   * Embedding dimensionality. pgvector type is fixed at column-creation
   * time (`vector(768)` in the migration); this option lets tests swap
   * dimensions when running against a custom schema.
   */
  readonly dimensions?: number;
}

interface ChunkRow {
  readonly id: string;
  readonly document_id: string;
  readonly ordinal: number;
  readonly text: string;
  readonly vector: string;
  readonly tenant_id: string;
  readonly created_at: Date;
  readonly score: number;
}

export class PgVectorStore implements IChunkStore {
  private readonly client: PgClient;
  private readonly tenantId: string;
  private readonly dimensions: number;

  constructor(opts: PgVectorStoreOptions) {
    this.client = opts.client;
    this.tenantId = opts.tenantId;
    this.dimensions = opts.dimensions ?? 768;
  }

  async addChunks(chunks: ReadonlyArray<Chunk>): Promise<void> {
    for (const chunk of chunks) {
      this.assertVector(chunk.vector, chunk.docId, chunk.idx);

      const id = randomUUID();
      const vectorLiteral = toPgVectorLiteral(chunk.vector);

      await this.client.$executeRaw`
        INSERT INTO chunks (id, document_id, ordinal, text, vector, tenant_id)
        VALUES (
          ${id},
          ${chunk.docId},
          ${chunk.idx},
          ${chunk.text},
          ${vectorLiteral}::vector,
          ${this.tenantId}
        )
      `;
    }
  }

  async search(
    vector: ReadonlyArray<number>,
    topK: number,
  ): Promise<ChunkSearchHit[]> {
    this.assertVector(vector, '<query>', -1);
    const k = Math.max(1, topK | 0);
    const vectorLiteral = toPgVectorLiteral(vector);

    // I-13: WHERE tenant_id = ${this.tenantId} is mandatory.
    // Cosine distance: 1 - (vector <=> query). pgvector's <=> operator
    // returns cosine DISTANCE in [0, 2]; we invert for similarity in
    // [-1, 1] to match the in-memory store's contract.
    const rows = await this.client.$queryRaw<ChunkRow>`
      SELECT
        id,
        document_id,
        ordinal,
        text,
        vector,
        tenant_id,
        created_at,
        1 - (vector <=> ${vectorLiteral}::vector) AS score
      FROM chunks
      WHERE tenant_id = ${this.tenantId}
      ORDER BY vector <=> ${vectorLiteral}::vector ASC
      LIMIT ${k}
    `;

    return rows.map((row) => ({
      docId: row.document_id,
      chunkIdx: row.ordinal,
      text: row.text,
      score: Number(row.score),
    }));
  }

  /** Test/diag helper. Always tenant-scoped per I-13. */
  async size(): Promise<number> {
    const rows = await this.client.$queryRaw<{ count: string }>`
      SELECT COUNT(*)::text AS count FROM chunks WHERE tenant_id = ${this.tenantId}
    `;
    return rows.length === 0 ? 0 : Number.parseInt(rows[0].count, 10);
  }

  private assertVector(
    vector: ReadonlyArray<number>,
    docId: string,
    idx: number,
  ): void {
    if (vector.length !== this.dimensions) {
      throw new Error(
        `PgVectorStore: vector for doc '${docId}' chunk ${idx} has length ${vector.length}; expected ${this.dimensions}.`,
      );
    }
  }
}

/**
 * Render a JS number array as a pgvector literal string `[v1,v2,...]`.
 * pgvector accepts both `'[1,2,3]'::vector` and `ARRAY[1,2,3]::vector`,
 * but the bracket form roundtrips cleanly with the values pgvector
 * itself prints when SELECTing the column.
 */
function toPgVectorLiteral(vector: ReadonlyArray<number>): string {
  return `[${vector.join(',')}]`;
}
