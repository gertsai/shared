-- SPDX-License-Identifier: Apache-2.0
-- Sprint 3.11 W-3-11-2: rollback for 001_init_documents_chunks.up.sql.
-- DROP order respects FK: chunks → documents.

DROP INDEX IF EXISTS idx_chunks_vector_hnsw;
DROP INDEX IF EXISTS idx_chunks_tenant;
DROP INDEX IF EXISTS idx_chunks_document;
DROP TABLE IF EXISTS chunks;

DROP INDEX IF EXISTS idx_documents_tenant_owner;
DROP TABLE IF EXISTS documents;

-- pg_migrations is intentionally NOT dropped — it tracks the rollback row
-- removal that scripts/migrate.ts performs separately.
