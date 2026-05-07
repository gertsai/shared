// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import type { Context } from 'moleculer';

import {
  REQUEST_CONTEXT_LOCALS_KEY,
  getRequestContext,
  sessionMiddleware,
} from '../moleculer/index.js';
import { ContextFrozenError } from '../errors.js';
import { RequestContext } from '../request-context.js';
import { makeSession } from './_session-fixture.js';

function makeCtx(meta: Record<string, unknown> = {}): Context {
  return { meta, locals: {} } as unknown as Context;
}

describe('sessionMiddleware', () => {
  it('attaches a frozen RequestContext on ctx.locals.requestContext', async () => {
    const mw = sessionMiddleware();
    const next = vi.fn().mockResolvedValue('ok');
    const handler = mw.localAction(next, undefined);

    const ctx = makeCtx({ tenantId: 't-99', correlationId: 'c-x' });
    const result = await handler(ctx);

    expect(result).toBe('ok');
    expect(next).toHaveBeenCalledWith(ctx);

    const rc = (ctx as unknown as { locals: Record<string, unknown> }).locals[
      REQUEST_CONTEXT_LOCALS_KEY
    ];
    expect(rc).toBeInstanceOf(RequestContext);
    const reqCtx = rc as RequestContext;
    expect(reqCtx.tenantId).toBe('t-99');
    expect(reqCtx.correlationId).toBe('c-x');
    expect(reqCtx.frozen).toBe(true);
  });

  it('honours sessionFactory and locale from ctx.meta', async () => {
    const session = makeSession({ operatorUuid: 'op-mw' });
    const mw = sessionMiddleware({ sessionFactory: () => session });
    const handler = mw.localAction(async () => undefined, undefined);
    const ctx = makeCtx({ locale: 'ru' });
    await handler(ctx);
    const rc = getRequestContext(ctx);
    expect(rc.session).toBe(session);
    expect(rc.locale).toBe('ru');
  });

  it('lazily generates correlationId when ctx.meta has none', async () => {
    const mw = sessionMiddleware();
    const handler = mw.localAction(async () => undefined, undefined);
    const ctx = makeCtx({ tenantId: 't-1' });
    await handler(ctx);
    const rc = getRequestContext(ctx);
    expect(rc.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses resolver to fill tenantId when not present in meta', async () => {
    const resolver = {
      name: 'fixture',
      resolve: vi.fn().mockResolvedValue({
        tenantId: 't-from-resolver',
        strategyName: 'fixture',
      }),
    };
    const mw = sessionMiddleware({ resolver });
    const handler = mw.localAction(async () => undefined, undefined);
    const ctx = makeCtx({});
    await handler(ctx);
    expect(resolver.resolve).toHaveBeenCalledWith(ctx);
    const rc = getRequestContext(ctx);
    expect(rc.tenantId).toBe('t-from-resolver');
  });

  it('does not invoke resolver when tenantId already in meta', async () => {
    const resolver = {
      name: 'fixture',
      resolve: vi.fn().mockResolvedValue(null),
    };
    const mw = sessionMiddleware({ resolver });
    const handler = mw.localAction(async () => undefined, undefined);
    const ctx = makeCtx({ tenantId: 't-meta' });
    await handler(ctx);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('auto-$freeze() — post-handler mutation throws ContextFrozenError (I-16)', async () => {
    let captured: RequestContext | undefined;
    const mw = sessionMiddleware();
    const next = vi.fn().mockImplementation(async (ctx: Context) => {
      captured = getRequestContext(ctx);
    });
    const handler = mw.localAction(next, undefined);
    await handler(makeCtx({ tenantId: 't-1' }));
    expect(captured).toBeDefined();
    expect(captured!.frozen).toBe(true);
    expect(() => captured!.$setTenantId('hijack')).toThrow(ContextFrozenError);
  });

  it('throws on non-Moleculer ctx (defensive runtime check)', () => {
    const mw = sessionMiddleware();
    const handler = mw.localAction(async () => undefined, undefined);
    return expect(handler(null as unknown as Context)).rejects.toThrow(
      /requires `moleculer`/,
    );
  });
});

describe('getRequestContext', () => {
  it('throws when middleware not registered', () => {
    const ctx = makeCtx({});
    expect(() => getRequestContext(ctx)).toThrow(/sessionMiddleware/);
  });
});
