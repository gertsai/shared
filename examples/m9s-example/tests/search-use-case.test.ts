import { describe, it, expect, vi } from 'vitest';

import {
  SearchDocumentsUseCase,
  DEFAULT_TOP_K,
  MAX_TOP_K,
} from '../src/application/SearchDocumentsUseCase';
import { PermissionDeniedError } from '../src/application/errors/permission-denied.error';
import type { IChunkStore } from '../src/domain/ports/IChunkStore';
import type { IEmbedder } from '../src/domain/ports/IEmbedder';
import type { IPermissionGate } from '../src/domain/ports/IPermissionGate';

function makeDeps() {
  const chunkStore: IChunkStore = {
    addChunks: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([
      { docId: 'd1', chunkIdx: 0, text: 'first', score: 0.9 },
      { docId: 'd1', chunkIdx: 1, text: 'second', score: 0.5 },
    ]),
  };
  const embedder: IEmbedder = {
    dimensions: 4,
    embed: vi.fn(async (texts: ReadonlyArray<string>) =>
      texts.map(() => [0.1, 0.2, 0.3, 0.4]),
    ),
  };
  const gate: IPermissionGate = {
    can: vi.fn().mockResolvedValue(true),
  };
  return { chunkStore, embedder, gate };
}

describe('SearchDocumentsUseCase', () => {
  it('passes the embedded query to the chunk store with default topK', async () => {
    const deps = makeDeps();
    const useCase = new SearchDocumentsUseCase(deps);

    const result = await useCase.execute({ userId: 'u1', query: 'hexagonal' });

    expect(deps.gate.can).toHaveBeenCalledWith('u1', 'search', '*');
    expect(deps.embedder.embed).toHaveBeenCalledWith(['hexagonal']);
    expect(deps.chunkStore.search).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3, 0.4],
      DEFAULT_TOP_K,
    );
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ docId: 'd1', score: 0.9 });
  });

  it('clamps oversized topK to MAX_TOP_K', async () => {
    const deps = makeDeps();
    const useCase = new SearchDocumentsUseCase(deps);

    await useCase.execute({ userId: 'u1', query: 'x', topK: 10_000 });

    expect(deps.chunkStore.search).toHaveBeenCalledWith(
      expect.any(Array),
      MAX_TOP_K,
    );
  });

  it('falls back to default topK on invalid values', async () => {
    const deps = makeDeps();
    const useCase = new SearchDocumentsUseCase(deps);

    await useCase.execute({ userId: 'u1', query: 'x', topK: -5 });
    expect(deps.chunkStore.search).toHaveBeenCalledWith(
      expect.any(Array),
      DEFAULT_TOP_K,
    );
  });

  it('throws PermissionDeniedError when gate denies', async () => {
    const deps = makeDeps();
    (deps.gate.can as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const useCase = new SearchDocumentsUseCase(deps);

    await expect(
      useCase.execute({ userId: 'u1', query: 'x' }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(deps.embedder.embed).not.toHaveBeenCalled();
    expect(deps.chunkStore.search).not.toHaveBeenCalled();
  });

  it('rejects empty query', async () => {
    const deps = makeDeps();
    const useCase = new SearchDocumentsUseCase(deps);

    await expect(
      useCase.execute({ userId: 'u1', query: '   ' }),
    ).rejects.toThrow(/non-empty/i);
  });
});
