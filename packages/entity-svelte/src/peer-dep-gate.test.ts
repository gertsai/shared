// SPDX-License-Identifier: Apache-2.0
/**
 * Peer-dep gate: when `svelte` is not installed, calling
 * `svelteReactiveAdapter.reactive(...)` throws a clear, actionable error
 * matching ADR-008 Amendment 1.3.3 wording. Module-resolution stays
 * permissive (peerDependenciesMeta marks svelte as optional).
 *
 * We mock `node:module` so `createRequire(...)('svelte/store')` throws,
 * simulating an environment in which the optional peer is absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: () => () => {
      throw new Error("Cannot find module 'svelte/store'");
    },
  };
});

let svelteReactiveAdapter: typeof import('./adapter').svelteReactiveAdapter;
let __resetWritableCacheForTests: typeof import('./adapter').__resetWritableCacheForTests;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./adapter');
  svelteReactiveAdapter = mod.svelteReactiveAdapter;
  __resetWritableCacheForTests = mod.__resetWritableCacheForTests;
});

afterEach(() => {
  __resetWritableCacheForTests();
});

describe('peer-dep gate — missing svelte', () => {
  it('throws an actionable error with install hint on first reactive() call', () => {
    expect(() => svelteReactiveAdapter.reactive({ x: 1 })).toThrow(
      /@gertsai\/entity-svelte requires "svelte" >=4\.0\.0 as a peer dependency\. Install it with: pnpm add svelte/,
    );
  });

  it('the gate fires deterministically on every call until svelte is resolved', () => {
    expect(() => svelteReactiveAdapter.reactive({ a: 1 })).toThrow(
      /pnpm add svelte/,
    );
    expect(() => svelteReactiveAdapter.reactive({ b: 2 })).toThrow(
      /pnpm add svelte/,
    );
  });
});
