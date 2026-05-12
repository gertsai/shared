// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 8.1 / PRD-013 G-1 + FR-1 — DocumentRepository capability declaration.
 *
 * Verifies that the example's storage adapter explicitly advertises native
 * audit-preserving upsert per ADR-013 §Decision-A1:
 *
 *   capabilities.upsert = { supported: true, preservesCreatorAudit: true }
 *
 * Both shipped providers (`InMemoryStorageProvider` in mock mode and the
 * `PgStorageProvider` jsonb-merge path in real-infra mode) honour the
 * tri-state contract, so declaring the flags at the repository level is a
 * correctness guarantee — it lets `BaseEntityStorageService.upsert()` take
 * the 1-RTT fast path without dropping back to the 2-RTT compatibility
 * branch.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { Session, type AbstractDialog } from '@gertsai/session';

import {
  DocumentRepository,
  type DocumentMeta,
} from '../src/infrastructure/document.repository';

const noopDialog: AbstractDialog = {
  confirm: async () => true,
  alert: () => {},
  error: (_e: unknown) => {},
};

function createSession(operatorUuid = 'cap-test-operator'): Session {
  return new Session({
    operatorUuid,
    operatorType: 'test',
    tokenGetter: async () => '',
    dialog: noopDialog,
    clientPlatform: 'test',
    clientVersion: '0.0.0-test',
  });
}

function createRepo(): DocumentRepository {
  const provider = new InMemoryStorageProvider<DocumentMeta>();
  const session = createSession();
  return new DocumentRepository(provider, session);
}

describe('DocumentRepository — capability declaration (PRD-013 G-1 / FR-1)', () => {
  it('declares upsert capability with both audit-preserving flags set', () => {
    const repo = createRepo();
    const caps = repo.capabilities;

    expect(caps.upsert).toBeDefined();
    expect(caps.upsert?.supported).toBe(true);
    expect(caps.upsert?.preservesCreatorAudit).toBe(true);
  });

  it('returns a stable capability shape across repeated reads', () => {
    const repo = createRepo();
    const first = repo.capabilities;
    const second = repo.capabilities;

    // Idempotent getter: both reads agree on the structural shape, and
    // both flags remain true on every access (no lazy mutation, no
    // first-read-only side effect).
    expect(second.upsert?.supported).toBe(first.upsert?.supported);
    expect(second.upsert?.preservesCreatorAudit).toBe(
      first.upsert?.preservesCreatorAudit,
    );
    expect(second.upsert?.supported).toBe(true);
    expect(second.upsert?.preservesCreatorAudit).toBe(true);
  });
});
