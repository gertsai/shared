// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { DefaultFeatureContext } from '../feature-context.js';

describe('DefaultFeatureContext', () => {
  it('isEnabled returns true for explicit Set members', () => {
    const ctx = new DefaultFeatureContext({
      enabled: new Set(['a', 'b']),
    });
    expect(ctx.isEnabled('a')).toBe(true);
    expect(ctx.isEnabled('b')).toBe(true);
    expect(ctx.isEnabled('c')).toBe(false);
  });

  it('flagProvider consulted on Set miss', () => {
    const provider = vi.fn().mockReturnValue(true);
    const ctx = new DefaultFeatureContext({
      enabled: new Set(['a']),
      flagProvider: provider,
    });
    expect(ctx.isEnabled('a')).toBe(true);
    expect(provider).not.toHaveBeenCalled();
    expect(ctx.isEnabled('z')).toBe(true);
    expect(provider).toHaveBeenCalledWith('z');
  });

  it('flagProvider exception → false (default-deny per ADR-007 P2-3)', () => {
    const ctx = new DefaultFeatureContext({
      flagProvider: () => {
        throw new Error('boom');
      },
    });
    expect(ctx.isEnabled('any')).toBe(false);
  });

  it('flagProvider returning non-true treated as false', () => {
    const ctx = new DefaultFeatureContext({
      flagProvider: () => false as unknown as boolean,
    });
    expect(ctx.isEnabled('any')).toBe(false);
  });

  it('enabledFlags lists only explicit Set entries (provider-driven flags excluded)', () => {
    const ctx = new DefaultFeatureContext({
      enabled: new Set(['a', 'b']),
      flagProvider: () => true,
    });
    expect([...ctx.enabledFlags()].sort()).toEqual(['a', 'b']);
  });

  it('empty init reports nothing enabled', () => {
    const ctx = new DefaultFeatureContext({});
    expect(ctx.enabledFlags()).toEqual([]);
    expect(ctx.isEnabled('whatever')).toBe(false);
  });
});
