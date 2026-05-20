// SPDX-License-Identifier: Apache-2.0
/**
 * Peer-dependency gate test — when `@vue/runtime-core` is not installed, the
 * adapter must throw a clear error pointing the user to the install command.
 *
 * Patches Node's `Module._load` so that `require('@vue/runtime-core')` throws
 * `MODULE_NOT_FOUND`, simulating a consumer who omitted the optional peer dep.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import Module from 'node:module';

describe('vueReactiveAdapter — peer-dep gate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // Wave 19 / EVID-074 M-V1 — test seam parity with svelte/solid.
  it('__resetVueCacheForTests clears cached references so loadVue re-resolves', async () => {
    const mod = await import('../index');
    // Force lazy load (warm cache).
    mod.vueReactiveAdapter.reactive({ a: 1 });
    // Reset clears the cached references — no throw, no return value.
    expect(() => mod.__resetVueCacheForTests()).not.toThrow();
    // After reset the adapter still works (re-resolves on demand).
    expect(() => mod.vueReactiveAdapter.reactive({ b: 2 })).not.toThrow();
  });

  it('throws a clear error containing the install hint when @vue/runtime-core is missing', async () => {
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
      const { vueReactiveAdapter } = await import('../index');
      expect(() => vueReactiveAdapter.reactive({})).toThrow(
        /requires "@vue\/runtime-core" >=3\.0\.0 as a peer dependency/,
      );
    } finally {
      M._load = originalLoad;
    }
  });

  it('install hint mentions pnpm add @vue/runtime-core', async () => {
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
      const { vueReactiveAdapter } = await import('../index');
      expect(() => vueReactiveAdapter.markRaw({})).toThrow(
        /pnpm add @vue\/runtime-core/,
      );
    } finally {
      M._load = originalLoad;
    }
  });

  it('all three contract methods surface the same install-hint error when peer dep missing', async () => {
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
      const { vueReactiveAdapter } = await import('../index');
      expect(() => vueReactiveAdapter.reactive({})).toThrow(/@gertsai\/entity-vue/);
      expect(() => vueReactiveAdapter.markRaw({})).toThrow(/@gertsai\/entity-vue/);
      expect(() => vueReactiveAdapter.isReactive({})).toThrow(/@gertsai\/entity-vue/);
    } finally {
      M._load = originalLoad;
    }
  });
});
