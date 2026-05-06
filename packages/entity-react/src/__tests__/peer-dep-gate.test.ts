// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

describe('useEntity — peer-dep gate (no React installed)', () => {
  it('throws a clear error message when react cannot be resolved', async () => {
    vi.resetModules();

    vi.doMock('node:module', () => ({
      createRequire: () => () => {
        throw new Error("Cannot find module 'react'");
      },
    }));

    const mod = await import('../use-entity.js');
    mod.__setUseSyncExternalStoreForTests(undefined);

    const fakeEntity = { $data: { x: 1 } } as unknown as Parameters<
      typeof mod.useEntity
    >[0];

    expect(() => mod.useEntity(fakeEntity)).toThrow(
      /@gertsai\/entity-react requires "react" >=18\.0\.0 as a peer dependency/,
    );

    vi.doUnmock('node:module');
    vi.resetModules();
  });
});
