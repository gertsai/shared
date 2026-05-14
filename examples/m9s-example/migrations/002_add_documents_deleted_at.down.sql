-- SPDX-License-Identifier: Apache-2.0
-- Wave 10.E (PRD-022) — revert 002_add_documents_deleted_at.up.sql.
--
-- Dropping the partial index is a no-op if it was never created.
-- Dropping the column DROPS ALL TOMBSTONES — any soft-deleted rows will
-- be reanimated as visible documents. Run with care.

DROP INDEX IF EXISTS idx_documents_active;
ALTER TABLE documents
  DROP COLUMN IF EXISTS deleted_at;
