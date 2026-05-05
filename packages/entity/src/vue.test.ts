// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

describe('vueReactiveAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('throws a clear error when @vue/runtime-core is not installed', async () => {
    // Patch Module._load so that resolving '@vue/runtime-core' throws —
    // simulating a consumer who omitted the optional peer dep.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const M = Module as any;
    const originalLoad = M._load;
    M._load = function patched(req: string, ...rest: unknown[]) {
      if (req === '@vue/runtime-core') {
        throw new Error("Cannot find module '@vue/runtime-core'");
      }
      // eslint-disable-next-line prefer-rest-params
      return originalLoad.apply(this, [req, ...rest]);
    };

    try {
      vi.resetModules();
      const { vueReactiveAdapter } = await import('./vue');
      expect(() => vueReactiveAdapter.reactive({})).toThrow(
        /missing peer dep '@vue\/runtime-core'/,
      );
    } finally {
      M._load = originalLoad;
    }
  });

  it('delegates to @vue/runtime-core when installed (shallowReactive + markRaw + isReactive)', async () => {
    // Sanity: Vue is in devDependencies so import resolves.
    const req = createRequire(import.meta.url);
    expect(() => req.resolve('@vue/runtime-core')).not.toThrow();

    vi.resetModules();
    const { vueReactiveAdapter } = await import('./vue');
    const target = { a: 1 };
    const reactive = vueReactiveAdapter.reactive(target);
    expect(vueReactiveAdapter.isReactive(reactive)).toBe(true);
    expect(vueReactiveAdapter.isReactive(target)).toBe(false);

    const raw = vueReactiveAdapter.markRaw({ b: 2 });
    // markRaw output should NOT become reactive when wrapped.
    const wrapped = vueReactiveAdapter.reactive(raw);
    expect(vueReactiveAdapter.isReactive(wrapped)).toBe(false);
  });
});
