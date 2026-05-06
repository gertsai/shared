// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import {
  InMemoryStorageProvider,
  STORAGE_EVENTS,
} from '@gertsai/entity-storage';
import { Session, type AbstractDialog } from '@gertsai/session';

import {
  DocumentRepository,
  type DocumentMeta,
} from '../src/infrastructure/document.repository';

/**
 * Sprint 3.5.2 (SPEC-010 W-S2-7) — Wave 4 audit propagation through the
 * DocumentRepository adapter.
 *
 * Verifies that:
 *   1. Wave 4's `buildDataForSet` stamps `creator_uuid` from the wired
 *      Session on first save.
 *   2. Re-saving an existing id refreshes the `updated_*` triplet via
 *      `buildDataForUpdate` without re-stamping `created_*` (upsert
 *      semantic preserved by DocumentRepository.save).
 *   3. STORAGE_EVENTS.ENTITY_CREATED fires post-save with the expected
 *      payload shape.
 *   4. `findById` strips the audit envelope back to the plain Document
 *      shape so callers never observe Wave 4 internals.
 */

const noopDialog: AbstractDialog = {
  confirm: async () => true,
  alert: () => {},
  error: (_e: unknown) => {},
};

function createSession(operatorUuid = 'test-operator'): Session {
  return new Session({
    operatorUuid,
    operatorType: 'test',
    tokenGetter: async () => '',
    dialog: noopDialog,
    clientPlatform: 'test',
    clientVersion: '0.0.0-test',
  });
}

describe('DocumentRepository — Wave 4 audit propagation', () => {
  it('stamps creator_uuid from session on first save', async () => {
    const provider = new InMemoryStorageProvider<DocumentMeta>();
    const session = createSession('alice');
    const repo = new DocumentRepository(provider, session);

    await repo.save({ id: 'd1', text: 'hello world.' });

    const stored = await provider.getDoc('documents', 'd1');
    expect(stored).not.toBeNull();
    expect(stored).toMatchObject({
      _uid: 'd1',
      text: 'hello world.',
      creator_uuid: 'alice',
      status: expect.any(String),
    });
    expect((stored as any).created_at).toBeDefined();
    expect((stored as any).updated_at).toBeDefined();
  });

  it('preserves created_at on re-save (upsert via update)', async () => {
    const provider = new InMemoryStorageProvider<DocumentMeta>();
    const session = createSession('bob');
    const repo = new DocumentRepository(provider, session);

    await repo.save({ id: 'd2', text: 'first version.' });
    const after1 = (await provider.getDoc('documents', 'd2')) as any;
    const createdAt1 = after1.created_at;
    const updatedAt1 = after1.updated_at;

    await new Promise((r) => setTimeout(r, 5));

    await repo.save({ id: 'd2', text: 'second version.' });
    const after2 = (await provider.getDoc('documents', 'd2')) as any;

    expect(after2.text).toBe('second version.');
    expect(after2.created_at).toEqual(createdAt1);
    expect(after2.creator_uuid).toBe(after1.creator_uuid);
    expect(after2.updated_at).toBeDefined();
    expect(after2.updated_at).not.toEqual(updatedAt1);
  });

  it('emits STORAGE_EVENTS.ENTITY_CREATED with correct payload shape', async () => {
    const provider = new InMemoryStorageProvider<DocumentMeta>();
    const session = createSession('carol');
    const repo = new DocumentRepository(provider, session);

    const handler = vi.fn();
    repo.on(STORAGE_EVENTS.ENTITY_CREATED, handler);

    await repo.save({ id: 'd3', text: 'eventful.' });

    expect(handler).toHaveBeenCalledTimes(1);
    const [payload] = handler.mock.calls[0];
    expect(payload).toMatchObject({
      event: 'entity-created',
      path: 'documents',
      id: 'd3',
    });
    expect(payload.data).toBeDefined();
  });

  it('findById strips audit envelope to plain Document', async () => {
    const provider = new InMemoryStorageProvider<DocumentMeta>();
    const session = createSession('dave');
    const repo = new DocumentRepository(provider, session);

    await repo.save({
      id: 'd4',
      text: 'wrapped doc.',
      metadata: { author: 'dave' },
    });

    const found = await repo.findById('d4');
    expect(found).toEqual({
      id: 'd4',
      text: 'wrapped doc.',
      metadata: { author: 'dave' },
    });
    expect(found).not.toHaveProperty('creator_uuid');
    expect(found).not.toHaveProperty('_uid');
    expect(found).not.toHaveProperty('created_at');
  });
});
