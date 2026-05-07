-- SPDX-License-Identifier: Apache-2.0
-- Sprint 3.11 W-3-11-1: documents + chunks normalised schema for m9s-example.
-- Idempotent per ADR-011 I-3 (every CREATE uses IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id           uuid        PRIMARY KEY,
  tenant_id    text        NOT NULL,
  owner_uuid   text        NOT NULL,
  text         text        NOT NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_owner
  ON documents (tenant_id, owner_uuid);

CREATE TABLE IF NOT EXISTS chunks (
  id           uuid        PRIMARY KEY,
  document_id  uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal      int         NOT NULL,
  text         text        NOT NULL,
  vector       vector(768) NOT NULL,
  tenant_id    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant   ON chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_vector_hnsw
  ON chunks USING hnsw (vector vector_cosine_ops);

CREATE TABLE IF NOT EXISTS pg_migrations (
  version      int         PRIMARY KEY,
  name         text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now()
);
