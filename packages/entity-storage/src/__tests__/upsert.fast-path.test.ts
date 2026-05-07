/**
 * Wave 6.5 / PRD-007 — `BaseEntityStorageService.upsert()` fast-path test.
 *
 * Verifies:
 *   1. When `provider.capabilities.upsert === true` AND `provider.upsertDoc`
 *      exists, `upsert()` calls `upsertDoc` exactly ONCE and does NOT call
 *      `getDoc` (1-RTT path).
 *   2. When `provider.capabilities.upsert === false`, `upsert()` falls back
 *      to the Sprint 3.5 2-RTT path (`getDoc` + `set` or `update`).
 *
 * Uses a hand-rolled fake `IStorageProvider` that records every method
 * invocation so we can assert the call shape without needing a live DB.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Session } from '@gertsai/session';

import {
  type IStorageProvider,
  type StorageMetadata,
  type StorageCapabilities,
  type Query,
  ListenersNotSupportedError,
} from '@gertsai/storage-core';

import { BaseEntityStorageService } from '../BaseEntityStorageService.js';

interface DocMeta extends StorageMetadata {
  read: { _uid: string; name: string };
  write: { _uid: string; name: string };
  indexed: 'name';
}

class RecordingProvider implements IStorageProvider<DocMeta> {
  readonly capabilities: StorageCapabilities;
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private readonly store = new Map<string, Map<string, DocMeta['write']>>();

  constructor(capUpsert: boolean) {
    this.capabilities = {
      listeners: false,
      transactions: false,
      batches: false,
      upsert: capUpsert,
    };
  }

  private _coll(path: string): Map<string, DocMeta['write']> {
    let c = this.store.get(path);
    if (!c) {
      c = new Map();
      this.store.set(path, c);
    }
    return c;
  }

  async set(path: string, id: string, data: DocMeta['write']): Promise<void> {
    this.calls.push({ method: 'set', args: [path, id, data] });
    this._coll(path).set(id, data);
  }

  async getDoc(path: string, id: string): Promise<DocMeta['read'] | null> {
    this.calls.push({ method: 'getDoc', args: [path, id] });
    return this._coll(path).get(id) ?? null;
  }

  async getDocs(path: string, _q?: Query<DocMeta>): Promise<DocMeta['read'][]> {
    this.calls.push({ method: 'getDocs', args: [path] });
    return [...this._coll(path).values()];
  }

  async count(path: string, _q?: Query<DocMeta>): Promise<number> {
    this.calls.push({ method: 'count', args: [path] });
    return this._coll(path).size;
  }

  async update(
    path: string,
    id: string,
    partial: Partial<DocMeta['write']>,
  ): Promise<void> {
    this.calls.push({ method: 'update', args: [path, id, partial] });
    const existing = this._coll(path).get(id);
    if (existing) {
      this._coll(path).set(id, { ...existing, ...partial });
    }
  }

  async delete(path: string, id: string): Promise<void> {
    this.calls.push({ method: 'delete', args: [path, id] });
    this._coll(path).delete(id);
  }

  async upsertDoc(
    path: string,
    id: string,
    data: DocMeta['write'],
  ): Promise<{ id: string }> {
    this.calls.push({ method: 'upsertDoc', args: [path, id, data] });
    this._coll(path).set(id, data);
    return { id };
  }

  // Listener-related methods — required by the interface but throw because
  // capabilities.listeners=false.
  onDocumentSnapshot(): () => void {
    throw new ListenersNotSupportedError();
  }
  onCollectionSnapshot(): () => void {
    throw new ListenersNotSupportedError();
  }

  async runBatch<R>(_fn: never): Promise<R> {
    throw new Error('runBatch not used');
  }

  async runTransaction<R>(_fn: never): Promise<R> {
    throw new Error('runTransaction not used');
  }
}

class TestService extends BaseEntityStorageService<DocMeta, never> {}

function makeService(provider: IStorageProvider<DocMeta>): TestService {
  const session = new Session({
    operatorUuid: 'test-operator',
    operatorType: 'system',
    tokenGetter: async () => '',
    dialog: {
      confirm: async () => true,
      alert: () => {},
      error: () => {},
    },
    clientPlatform: 'test',
    clientVersion: '0.0.1',
  });
  return new TestService({ provider, session, path: 'docs' });
}

describe('Wave 6.5 — BaseEntityStorageService.upsert() fast-path (PRD-007)', () => {
  describe('when provider.capabilities.upsert === true', () => {
    let provider: RecordingProvider;
    let service: TestService;

    beforeEach(() => {
      provider = new RecordingProvider(true);
      service = makeService(provider);
    });

    it('calls upsertDoc exactly ONCE on insert (1 RTT)', async () => {
      await service.upsert({ _uid: 'doc-1', name: 'Alice' });
      const upsertCalls = provider.calls.filter((c) => c.method === 'upsertDoc');
      const getDocCalls = provider.calls.filter((c) => c.method === 'getDoc');
      expect(upsertCalls.length).toBe(1);
      expect(getDocCalls.length).toBe(0);
    });

    it('calls upsertDoc exactly ONCE on update (1 RTT)', async () => {
      await service.upsert({ _uid: 'doc-1', name: 'Alice' });
      provider.calls.length = 0;
      await service.upsert({ _uid: 'doc-1', name: 'Alice v2' });
      const upsertCalls = provider.calls.filter((c) => c.method === 'upsertDoc');
      const getDocCalls = provider.calls.filter((c) => c.method === 'getDoc');
      expect(upsertCalls.length).toBe(1);
      expect(getDocCalls.length).toBe(0);
    });

    it('returned id matches the input _uid', async () => {
      const result = await service.upsert({ _uid: 'doc-1', name: 'Alice' });
      expect(result.id).toBe('doc-1');
    });
  });

  describe('when provider.capabilities.upsert === false (back-compat 2-RTT)', () => {
    let provider: RecordingProvider;
    let service: TestService;

    beforeEach(() => {
      provider = new RecordingProvider(false);
      service = makeService(provider);
    });

    it('on insert: calls getDoc + set, NOT upsertDoc', async () => {
      await service.upsert({ _uid: 'doc-1', name: 'Alice' });
      expect(provider.calls.find((c) => c.method === 'upsertDoc')).toBeUndefined();
      expect(provider.calls.filter((c) => c.method === 'getDoc').length).toBe(1);
      expect(provider.calls.filter((c) => c.method === 'set').length).toBe(1);
    });

    it('on update: calls getDoc + update, NOT upsertDoc', async () => {
      await service.upsert({ _uid: 'doc-1', name: 'Alice' });
      provider.calls.length = 0;
      await service.upsert({ _uid: 'doc-1', name: 'Alice v2' });
      expect(provider.calls.find((c) => c.method === 'upsertDoc')).toBeUndefined();
      expect(provider.calls.filter((c) => c.method === 'getDoc').length).toBe(1);
      expect(provider.calls.filter((c) => c.method === 'update').length).toBe(1);
    });
  });
});
