// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { MoleculerCtxStrategy, tenantMiddleware } from '../moleculer/index.js';

const fakeCtx = (meta: Record<string, unknown>) =>
  ({ meta }) as unknown as Parameters<MoleculerCtxStrategy['resolve']>[0];

describe('MoleculerCtxStrategy', () => {
  it('reads ctx.meta.tenantId when present', async () => {
    const s = new MoleculerCtxStrategy();
    await expect(s.resolve(fakeCtx({ tenantId: 'tA' }))).resolves.toEqual({
      tenantId: 'tA',
      strategyName: 'moleculer-ctx',
    });
  });

  it('trims whitespace from tenantId', async () => {
    const s = new MoleculerCtxStrategy();
    await expect(s.resolve(fakeCtx({ tenantId: '  tB  ' }))).resolves.toEqual({
      tenantId: 'tB',
      strategyName: 'moleculer-ctx',
    });
  });

  it('returns null when meta has no tenantId', async () => {
    const s = new MoleculerCtxStrategy();
    await expect(s.resolve(fakeCtx({}))).resolves.toBeNull();
  });

  it('returns null when tenantId is empty / whitespace-only', async () => {
    const s = new MoleculerCtxStrategy();
    await expect(s.resolve(fakeCtx({ tenantId: '' }))).resolves.toBeNull();
    await expect(s.resolve(fakeCtx({ tenantId: '   ' }))).resolves.toBeNull();
  });

  it('returns null when tenantId is non-string', async () => {
    const s = new MoleculerCtxStrategy();
    await expect(s.resolve(fakeCtx({ tenantId: 42 }))).resolves.toBeNull();
  });

  it('throws when ctx is not a Moleculer-shaped context', async () => {
    const s = new MoleculerCtxStrategy();
    await expect(
      s.resolve(null as unknown as Parameters<MoleculerCtxStrategy['resolve']>[0]),
    ).rejects.toThrow(/moleculer/);
  });
});

describe('tenantMiddleware', () => {
  it('writes resolution to ctx.meta and forwards to next', async () => {
    const middleware = tenantMiddleware(new MoleculerCtxStrategy());
    const action = { name: 'foo' };
    let received: { meta: Record<string, unknown> } | null = null;
    const next = async (c: { meta: Record<string, unknown> }) => {
      received = c;
      return 'ok';
    };
    const wrapped = middleware.localAction(
      next as unknown as (ctx: Parameters<typeof next>[0]) => Promise<unknown>,
      action,
    );
    const ctx = { meta: { tenantId: 'tX' } } as unknown as Parameters<typeof wrapped>[0];
    const result = await wrapped(ctx);
    expect(result).toBe('ok');
    expect(received).not.toBeNull();
    const meta = (received as unknown as { meta: Record<string, unknown> }).meta;
    expect(meta).toMatchObject({
      tenantId: 'tX',
      tenantResolution: { tenantId: 'tX', strategyName: 'moleculer-ctx' },
    });
  });

  it('respects custom metaKey option', async () => {
    const middleware = tenantMiddleware(new MoleculerCtxStrategy(), {
      metaKey: 'gertsResolution',
    });
    const next = async () => 'ok';
    const wrapped = middleware.localAction(
      next as unknown as (ctx: { meta: Record<string, unknown> }) => Promise<unknown>,
      {},
    );
    const ctx = { meta: { tenantId: 'tY' } } as unknown as Parameters<typeof wrapped>[0];
    await wrapped(ctx);
    const meta = (ctx as unknown as { meta: Record<string, unknown> }).meta;
    expect(meta['gertsResolution']).toEqual({
      tenantId: 'tY',
      strategyName: 'moleculer-ctx',
    });
  });

  it('does not throw when chain resolves null in optional mode', async () => {
    const noopStrategy = {
      name: 'noop',
      async resolve() {
        return null;
      },
    };
    const middleware = tenantMiddleware(noopStrategy);
    const next = async () => 'next-called';
    const wrapped = middleware.localAction(
      next as unknown as (ctx: { meta: Record<string, unknown> }) => Promise<unknown>,
      {},
    );
    const ctx = { meta: {} } as unknown as Parameters<typeof wrapped>[0];
    await expect(wrapped(ctx)).resolves.toBe('next-called');
  });
});
