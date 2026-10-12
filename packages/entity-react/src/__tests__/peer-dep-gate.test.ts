// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

describe('useEntity — peer-dep gate (no React installed)', () => {
  it('throws a clear error message when react cannot be resolved', async () => {
    vi.resetModules();

    // Simulate a bundler/browser runtime: no node builtins reachable.
    vi.stubGlobal('process', { getBuiltinModule: undefined });

    const mod = await import('../use-entity.js');
    mod.__setUseSyncExternalStoreForTests(undefined);

    const fakeEntity = { $data: { x: 1 } } as unknown as Parameters<
      typeof mod.useEntity
    >[0];

    expect(() => mod.useEntity(fakeEntity)).toThrow(
      /@gertsai\/entity-react requires "react" >=18\.0\.0 as a peer dependency/,
    );

    vi.unstubAllGlobals();
    vi.resetModules();
  });
});
