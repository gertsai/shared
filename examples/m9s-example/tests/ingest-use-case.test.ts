import { describe, it, expect, vi } from 'vitest';

import {
  IngestDocumentUseCase,
  splitIntoChunks,
} from '../src/application/IngestDocumentUseCase';
import { ForbiddenError } from '../src/shared/errors.js';
import type { IDocumentStore } from '../src/domain/ports/IDocumentStore';
import type { IChunkStore } from '../src/domain/ports/IChunkStore';
import type { IEmbedder } from '../src/domain/ports/IEmbedder';
import type { IPermissionGate } from '../src/domain/ports/IPermissionGate';

/**
 * Build a fresh set of mock ports for each test. Vitest's `vi.fn()` gives
 * every method a Jest-compatible spy interface so we can assert calls.
 */
function makeDeps() {
  const docStore: IDocumentStore = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
  };
  const chunkStore: IChunkStore = {
    addChunks: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
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
  return { docStore, chunkStore, embedder, gate };
}

describe('splitIntoChunks', () => {
  it('splits on sentence boundaries', () => {
    const out = splitIntoChunks('Hello world. This is fine! Right?');
    expect(out).toEqual(['Hello world.', 'This is fine!', 'Right?']);
  });

  it('splits on newlines', () => {
    const out = splitIntoChunks('line one\nline two\n\nline three');
    expect(out).toEqual(['line one', 'line two', 'line three']);
  });

  it('returns single chunk for terminator-less text', () => {
    const out = splitIntoChunks('this is one chunk no period');
    expect(out).toEqual(['this is one chunk no period']);
  });
});

describe('IngestDocumentUseCase', () => {
  it('orchestrates gate -> embed -> persist on the happy path', async () => {
    const deps = makeDeps();
    const useCase = new IngestDocumentUseCase(deps);

    const result = await useCase.execute({
      userId: 'u1',
      docId: 'd1',
      text: 'First sentence. Second sentence.',
    });

    // 1. Permission was checked with the right tuple
    expect(deps.gate.can).toHaveBeenCalledWith('u1', 'ingest', 'd1');

    // 2. Embedder received exactly the chunked texts
    expect(deps.embedder.embed).toHaveBeenCalledTimes(1);
    expect(deps.embedder.embed).toHaveBeenCalledWith(['First sentence.', 'Second sentence.']);

    // 3. Document persisted with original metadata
    expect(deps.docStore.save).toHaveBeenCalledTimes(1);
    expect(deps.docStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'd1', text: 'First sentence. Second sentence.' }),
    );

    // 4. Chunk store received aligned chunks
    expect(deps.chunkStore.addChunks).toHaveBeenCalledTimes(1);
    const passed = (deps.chunkStore.addChunks as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passed).toHaveLength(2);
    expect(passed[0]).toMatchObject({ docId: 'd1', idx: 0, text: 'First sentence.' });
    expect(passed[1]).toMatchObject({ docId: 'd1', idx: 1, text: 'Second sentence.' });

    expect(result).toEqual({ docId: 'd1', chunkCount: 2 });
  });

  it('throws ForbiddenError when gate denies', async () => {
    const deps = makeDeps();
    (deps.gate.can as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const useCase = new IngestDocumentUseCase(deps);

    await expect(
      useCase.execute({ userId: 'u1', docId: 'd1', text: 'hello.' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(deps.embedder.embed).not.toHaveBeenCalled();
    expect(deps.docStore.save).not.toHaveBeenCalled();
    expect(deps.chunkStore.addChunks).not.toHaveBeenCalled();
  });

  it('rejects empty text via domain invariant', async () => {
    const deps = makeDeps();
    const useCase = new IngestDocumentUseCase(deps);

    await expect(
      useCase.execute({ userId: 'u1', docId: 'd1', text: '   ' }),
    ).rejects.toThrow(/non-empty/i);
  });

  it('detects embedder/chunk count mismatch defensively', async () => {
    const deps = makeDeps();
    (deps.embedder.embed as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      [0.1, 0.2, 0.3, 0.4],
    ]); // returns 1 vector but text has 2 chunks
    const useCase = new IngestDocumentUseCase(deps);

    await expect(
      useCase.execute({ userId: 'u1', docId: 'd1', text: 'one. two.' }),
    ).rejects.toThrow(/Embedder returned/);
  });
});
