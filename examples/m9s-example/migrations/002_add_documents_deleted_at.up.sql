-- SPDX-License-Identifier: Apache-2.0
-- Wave 10.E (PRD-022) — add `deleted_at` column to documents for soft-delete.
--
-- Closes EVID-036 audit finding CI-3 / W-Security-5: PgDocumentRepository
-- previously degraded `IDocumentStore.softDelete` to a hard DELETE because
-- the schema lacked a tombstone column. Wave 10.D shipped a fail-loud
-- HTTP 501 (PgSoftDeleteNotSupportedError); this migration adds the column
-- so the PG adapter can honor the soft-delete contract identically to the
-- in-memory adapter (Liskov).
--
-- Idempotent per ADR-011 I-3 (ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Partial index optimises the common "active document" query path
-- (`WHERE deleted_at IS NULL`). Soft-deleted rows are rare; full-table
-- scans would otherwise dominate listSummaries / count traffic on a real
-- workload.
CREATE INDEX IF NOT EXISTS idx_documents_active
  ON documents (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;
