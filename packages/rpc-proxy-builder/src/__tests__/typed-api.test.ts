// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import {
  createTypedApi,
  invokeTransport,
  parseRestLiteral,
  RestError,
  restTransport,
  type ApiClient,
} from '../typed-api.js';

// Structural stand-ins for ApiControllerRegisteredAction — the typed
// client only reads literal `path`/`rest` + option validators, so the
// same map works for hand-declared contracts (e.g. WS bridges).
interface LoginRequest {
  readonly username: string;
  readonly password: string;
}
interface LoginResponse {
  readonly token: string;
  readonly user: { id: string; name: string };
}
interface CreateCardRequest {
  readonly boardId: string;
  readonly title: string;
}
interface Card {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

const validator = <T>(): ((input: unknown) => T) =>
  ((input: unknown) => input as T) as (input: unknown) => T;

const login = {
  name: 'login',
  path: 'v1.auth.login',
  rest: 'POST /v1/auth/login',
  options: {
    auth: 'none',
    params: validator<LoginRequest>(),
    response: validator<LoginResponse>(),
  },
} as const;

const createCard = {
  name: 'createCard',
  path: 'v1.kanban.createCard',
  rest: 'POST /v1/cards',
  options: {
    auth: 'required',
    params: validator<CreateCardRequest>(),
    response: validator<Card>(),
  },
} as const;

const listCards = {
  name: 'listCards',
  path: 'v1.kanban.listCards',
  rest: 'GET /v1/cards',
  options: {
    auth: 'required',
    params: validator<Record<string, never>>(),
    response: validator<Card[]>(),
  },
} as const;

type Actions = typeof login | typeof createCard | typeof listCards;

describe('ApiClient type mapping', () => {
  it('collapses dotted paths into a nested call surface', () => {
    type Api = ApiClient<Actions>;
    expectTypeOf<Api['v1']['auth']['login']>().toEqualTypeOf<
      (params: LoginRequest, options?: never) => Promise<LoginResponse>
    >();
    expectTypeOf<Api['v1']['kanban']['createCard']>().toEqualTypeOf<
      (params: CreateCardRequest, options?: never) => Promise<Card>
    >();
  });

  it('makes params optional when the params validator is an empty record', () => {
    type Api = ApiClient<Actions>;
    expectTypeOf<Api['v1']['kanban']['listCards']>().toEqualTypeOf<
      (params?: Record<string, never>, options?: never) => Promise<Card[]>
    >();
  });
});

describe('createTypedApi', () => {
  it('dispatches leaf calls to the transport with the full path', async () => {
    const calls: Array<{ path: string; params: unknown }> = [];
    const api = createTypedApi<Actions>(async (path, params) => {
      calls.push({ path, params });
      if (path === 'v1.kanban.createCard') {
        return { id: 'c-1', title: 'T', done: false };
      }
      throw new Error('unhandled');
    });

    const card = await api.v1.kanban.createCard({
      boardId: 'b-1',
      title: 'T',
    });
    expect(card.id).toBe('c-1');
    expect(calls).toEqual([
      {
        path: 'v1.kanban.createCard',
        params: { boardId: 'b-1', title: 'T' },
      },
    ]);
  });

  it('defaults params to {} for parameterless actions', async () => {
    const seen: unknown[] = [];
    const api = createTypedApi<Actions>(async (_path, params) => {
      seen.push(params);
      return [];
    });
    await api.v1.kanban.listCards();
    expect(seen).toEqual([{}]);
  });

  it('rejects paths outside allowedPaths', async () => {
    const api = createTypedApi<Actions>(async () => ({}), {
      allowedPaths: ['v1.kanban.createCard'],
    });
    await expect(api.v1.kanban.createCard({ boardId: 'b', title: 'x' }))
      .resolves.toEqual({});
    await expect(
      (api.v1.auth.login as (p: unknown) => Promise<unknown>)({
        username: 'u',
        password: 'p',
      }),
    ).rejects.toThrow('Unknown or not served action: v1.auth.login');
  });

  it('intermediate nodes are not thenable (await api.v1 must not hang)', async () => {
    const api = createTypedApi<Actions>(async () => ({}));
    const intermediate = api.v1.auth;
    // Promise.resolve on a thenable would invoke .then — must not exist.
    const awaited = await Promise.resolve(intermediate);
    expect(typeof awaited).toBe('function');
  });
});

describe('invokeTransport', () => {
  it('maps contract path to wire name and forwards options', async () => {
    const invoke = vi.fn(async (name: string) => `ok:${name}`);
    const api = createTypedApi<Actions>(
      invokeTransport({
        invoke,
        mapPath: (p) => p.replace(/^v\d+\./, 'flx.'),
      }),
    );
    await api.v1.kanban.createCard({ boardId: 'b', title: 'x' });
    expect(invoke).toHaveBeenCalledWith(
      'flx.kanban.createCard',
      { boardId: 'b', title: 'x' },
      undefined,
    );
  });
});

describe('parseRestLiteral', () => {
  it('parses method and path', () => {
    expect(parseRestLiteral('POST /v1/auth/login')).toEqual({
      method: 'POST',
      path: '/v1/auth/login',
    });
    expect(parseRestLiteral('GET /v1/cards')).toEqual({
      method: 'GET',
      path: '/v1/cards',
    });
  });

  it('returns undefined for malformed literals', () => {
    expect(parseRestLiteral('POST')).toBeUndefined();
    expect(parseRestLiteral('')).toBeUndefined();
  });
});

describe('restTransport', () => {
  it('dispatches GET with query params and unwraps the envelope', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/v1/cards?boardId=b-1');
      return new Response(
        JSON.stringify({ success: true, data: [{ id: 'c1' }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const api = createTypedApi<Actions>(
      restTransport(
        { 'v1.kanban.listCards': 'GET /v1/cards' },
        { baseUrl: '/api', fetch: fetchMock },
      ),
    );
    // Params flow through the untyped transport channel — the test
    // bypasses the empty-record leaf signature on purpose.
    const cards = await (
      api.v1.kanban.listCards as (p: unknown) => Promise<Card[]>
    )({ boardId: 'b-1' });
    expect(cards).toEqual([{ id: 'c1' }]);
  });

  it('dispatches POST with JSON body', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/v1/auth/login');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({
        username: 'u',
        password: 'p',
      });
      return new Response(
        JSON.stringify({
          success: true,
          data: { token: 't', user: { id: 'u1', name: 'u' } },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const api = createTypedApi<Actions>(
      restTransport(
        { 'v1.auth.login': 'POST /v1/auth/login' },
        { baseUrl: '/api', fetch: fetchMock },
      ),
    );
    const res = await api.v1.auth.login({ username: 'u', password: 'p' });
    expect(res.token).toBe('t');
  });

  it('throws a descriptive error on envelope failure', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ success: false, message: 'bad credentials' }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    const api = createTypedApi<Actions>(
      restTransport(
        { 'v1.auth.login': 'POST /v1/auth/login' },
        { baseUrl: '/api', fetch: fetchMock },
      ),
    );
    await expect(
      api.v1.auth.login({ username: 'u', password: 'p' }),
    ).rejects.toThrow('bad credentials');
    try {
      await api.v1.auth.login({ username: 'u', password: 'p' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RestError);
      expect((e as RestError).status).toBe(401);
    }
  });

  it('substitutes :param segments and sends leftovers in the body', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/v1/boards/b%201/members');
      expect(JSON.parse(init?.body as string)).toEqual({
        userId: 'u-9',
        role: 'editor',
      });
      return new Response(
        JSON.stringify({ success: true, data: {} }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const transport = restTransport(
      { 'v1.kanban.addBoardMember': 'POST /v1/boards/:boardId/members' },
      { baseUrl: '/api', fetch: fetchMock },
    );
    await transport('v1.kanban.addBoardMember', {
      boardId: 'b 1',
      userId: 'u-9',
      role: 'editor',
    });
  });

  it('throws when a :param is absent', async () => {
    const transport = restTransport(
      { 'v1.kanban.deleteCard': 'DELETE /v1/cards/:cardId' },
      { baseUrl: '/api', fetch: vi.fn() as unknown as typeof fetch },
    );
    await expect(
      transport('v1.kanban.deleteCard', {}),
    ).rejects.toThrow("Missing path param 'cardId'");
  });

  it('throws when the action has no REST route', async () => {
    const api = createTypedApi<Actions>(
      restTransport({}, { baseUrl: '/api', fetch: vi.fn() as unknown as typeof fetch }),
    );
    await expect(
      api.v1.kanban.createCard({ boardId: 'b', title: 'x' }),
    ).rejects.toThrow('No REST route for action: v1.kanban.createCard');
  });
});
