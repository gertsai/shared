// SPDX-License-Identifier: Apache-2.0
/**
 * `svelteReactiveAdapter` — `ReactiveAdapter` contract conformance tests.
 *
 * Covers the 3 base SPI assertions every Wave 5 Phase 3 adapter is
 * required to ship (ADR-008 Decision F §4 + I-1) plus svelte-specific
 * Proxy / Writable interaction checks. Mocks `svelte/store.writable`
 * so the suite is independent of the optional `svelte` peer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockWritable } from './test-helpers/mock-svelte-store';

vi.mock('svelte/store', () => ({
  writable: <T>(initial: T) => createMockWritable(initial),
}));

let svelteReactiveAdapter: typeof import('./adapter').svelteReactiveAdapter;
let getStore: typeof import('./adapter').getStore;
let __resetWritableCacheForTests: typeof import('./adapter').__resetWritableCacheForTests;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./adapter');
  svelteReactiveAdapter = mod.svelteReactiveAdapter;
  getStore = mod.getStore;
  __resetWritableCacheForTests = mod.__resetWritableCacheForTests;
});

afterEach(() => {
  __resetWritableCacheForTests();
});

describe('svelteReactiveAdapter — ReactiveAdapter contract', () => {
  it('reactive() preserves identity for primitives and null', () => {
    expect(svelteReactiveAdapter.reactive(null as unknown as object)).toBe(
      null,
    );
    expect(
      svelteReactiveAdapter.reactive(
        undefined as unknown as object,
      ),
    ).toBe(undefined);
    expect(svelteReactiveAdapter.reactive(42 as unknown as object)).toBe(42);
  });

  it('markRaw() sets a non-enumerable side-effect that reactive() respects', () => {
    const target = { x: 1 };
    svelteReactiveAdapter.markRaw(target);
    const result = svelteReactiveAdapter.reactive(target);
    expect(result).toBe(target);
    expect(svelteReactiveAdapter.isReactive(result)).toBe(false);
  });

  it('isReactive() reports truth for adapter-wrapped objects only', () => {
    const target = { x: 1 };
    expect(svelteReactiveAdapter.isReactive(target)).toBe(false);
    const proxy = svelteReactiveAdapter.reactive(target);
    expect(svelteReactiveAdapter.isReactive(proxy)).toBe(true);
    expect(svelteReactiveAdapter.isReactive(null)).toBe(false);
    expect(svelteReactiveAdapter.isReactive(123)).toBe(false);
    expect(svelteReactiveAdapter.isReactive('str')).toBe(false);
  });
});

describe('svelteReactiveAdapter — Proxy notify integration', () => {
  it('mutation triggers writable.set with a fresh shallow copy', () => {
    const target = { name: 'Ada', age: 30 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target);
    expect(store).toBeDefined();
    const seen: object[] = [];
    store!.subscribe((v) => seen.push({ ...v }));
    proxy.name = 'Grace';
    expect(seen.length).toBe(2);
    expect((seen[0] as { name: string }).name).toBe('Ada');
    expect((seen[1] as { name: string }).name).toBe('Grace');
  });

  it('reactive() called twice on the same target returns the original target the second time (idempotent)', () => {
    const target = { x: 1 };
    const first = svelteReactiveAdapter.reactive(target);
    const second = svelteReactiveAdapter.reactive(first);
    expect(second).toBe(first);
  });

  it('markRaw() then reactive() returns the raw value untouched', () => {
    const target = svelteReactiveAdapter.markRaw({ secret: 1 });
    const result = svelteReactiveAdapter.reactive(target);
    expect(result).toBe(target);
  });
});

// Wave 19 / EVID-074 M-R2 (svelte parity) — pin markRaw non-reversibility.
describe('svelteReactiveAdapter — markRaw non-reversibility (Wave 19)', () => {
  it('markRaw() installs a non-configurable, non-writable brand (one-way)', () => {
    const value = { secret: 1 };
    svelteReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(raw)',
    );
    expect(rawSym).toBeDefined();
    const desc = Object.getOwnPropertyDescriptor(value, rawSym!);
    expect(desc?.configurable).toBe(false);
    expect(desc?.writable).toBe(false);
    expect(desc?.enumerable).toBe(false);
    expect(desc?.value).toBe(true);
  });

  it('markRaw() brand cannot be overwritten via Object.defineProperty', () => {
    const value = { secret: 1 };
    svelteReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(raw)',
    );
    expect(() =>
      Object.defineProperty(value, rawSym!, {
        value: false,
        configurable: true,
      }),
    ).toThrow();
  });

  it('markRaw() brand cannot be deleted (strict-mode delete throws)', () => {
    const value: Record<symbol, unknown> = { secret: 1 } as unknown as Record<
      symbol,
      unknown
    >;
    svelteReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(raw)',
    );
    expect(() => {
      // @ts-expect-error — deleting a symbol-keyed own property
      delete value[rawSym!];
    }).toThrow();
  });
});
