// SPDX-License-Identifier: Apache-2.0
/**
 * `createTypedApi` — nested typed client over an action registry.
 *
 * Orchestra's `Celesta<ApiEndpoints>` equivalent (RFC-024, gap 4): an
 * action map built from `controller.register(...)` typings collapses
 * into a nested call surface — `api.v1.kanban.createCard(params)` —
 * dispatching through a transport the app supplies.
 *
 * The contract is STRUCTURAL: any object type carrying literal
 * `path`/`rest` fields plus `options.params`/`options.response`
 * validators qualifies — `ApiControllerRegisteredAction` included, and
 * hand-declared contract objects for surfaces without a live
 * registration (e.g. WS invoke bridges).
 *
 * ```ts
 * const api = createTypedApi<DemoHubApi>(invokeTransport({
 *   invoke: (name, params) => client.invoke(name, params),
 *   mapPath: (path) => `flx${path.slice(2)}`,   // v1.* → flx.*
 * }));
 * await api.v1.kanban.createCard({ boardId, listId, title });
 * ```
 */

import type { RpcCallOptions } from './proxy.js';

/**
 * Unwrap one validator RESULT to the validated type. A typia
 * `IValidation<T>` is a discriminated union — the `success: true`
 * member carries `data: T`, the `success: false` member contributes
 * `never`, so the union collapses to `T`. A plain `(input) => T`
 * contract falls through unchanged. (A params type that literally IS
 * `{ success: true; data: T }` would read as an envelope — none of the
 * contracts here are; the shape is typia's discriminator by design.)
 */
type UnwrapResult<R> = R extends { success: true; data: infer T }
  ? T
  : R extends { success: false }
    ? never
    : R;

/** Unwrap a params/response validator to its validated type. */
type UnwrapValidator<V> = V extends (input: unknown) => infer R
  ? UnwrapResult<R>
  : V extends { validate: (input: unknown) => infer R }
    ? UnwrapResult<R>
    : never;

/** Structural action contract — literal path + option validators. */
interface ContractLike {
  readonly path: string;
  readonly options: {
    readonly params: unknown;
    readonly response: unknown;
  };
}

type ParamsOf<A> = A extends {
  options: { params: infer V };
}
  ? UnwrapValidator<V>
  : never;

type ResponseOf<A> = A extends {
  options: { response: infer V };
}
  ? UnwrapValidator<V>
  : never;

/** Leaf signature for one action. */
type CallFn<A> = ParamsOf<A> extends infer P
  ? P extends Record<string, never>
    ? (params?: P, options?: RpcCallOptions) => Promise<ResponseOf<A>>
    : (params: P, options?: RpcCallOptions) => Promise<ResponseOf<A>>
  : never;

/** `"a.b.c" → {a: {b: {c: Leaf}}}` recursive tree. */
type TreeFor<P extends string, Leaf> = P extends `${infer H}.${infer T}`
  ? { [K in H]: TreeFor<T, Leaf> }
  : { [K in P]: Leaf };

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

/**
 * Collapse a union of registered-action types into the nested call
 * surface. `"v1.kanban.createCard"` becomes
 * `api.v1.kanban.createCard(params)` typed by that action's validators.
 */
export type ApiClient<Actions extends ContractLike> =
  UnionToIntersection<
    Actions extends infer A
      ? A extends { path: infer P extends string }
        ? TreeFor<P, CallFn<A>>
        : never
      : never
  >;

/**
 * Transport the app binds: action path → params → response. Every
 * dispatch is already typed at the leaf; the transport sees the raw
 * contract path (`"v1.kanban.createCard"`) and may route it anywhere —
 * WS invoke, HTTP, an in-process broker.
 */
export type ApiTransport = (
  actionPath: string,
  params: unknown,
  options?: RpcCallOptions,
) => Promise<unknown>;

export interface TypedApiOptions {
  /**
   * Optional runtime allowlist of dispatchable action paths. When set,
   * calling a path outside the list throws — catches typos and
   * actions that exist in the type map but are not served by this
   * transport (e.g. a REST-only action invoked over WS).
   */
  readonly allowedPaths?: readonly string[];
}

function buildLevel(
  prefix: string,
  call: ApiTransport,
  allowed: ReadonlySet<string> | undefined,
): unknown {
  return new Proxy(
    // A function target so every node is both nestable AND callable —
    // the proxy needs no leaf detection: `api.v1.auth` is an object
    // for property access and `api.v1.auth.login(...)` applies at the
    // leaf with the accumulated path.
    () => {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol') return undefined;
        // Non-thenable: `await api.v1` must not treat the proxy as a promise.
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined;
        }
        const next = prefix === '' ? prop : `${prefix}.${prop}`;
        return buildLevel(next, call, allowed);
      },
      apply(_target, _thisArg, args) {
        const [params, options] = args as [
          params?: unknown,
          options?: RpcCallOptions,
        ];
        if (allowed !== undefined && !allowed.has(prefix)) {
          return Promise.reject(
            new Error(`Unknown or not served action: ${prefix}`),
          );
        }
        return call(prefix, params ?? {}, options);
      },
    },
  );
}

/**
 * Build the nested typed client. The returned proxy traverses action
 * path segments (`v1.kanban.createCard`) and applies at the leaf.
 *
 * @param call - Transport dispatch fn receiving the full action path.
 * @param options - Optional `allowedPaths` runtime guard.
 */
export function createTypedApi<Actions extends ContractLike>(
  call: ApiTransport,
  options?: TypedApiOptions,
): ApiClient<Actions> {
  const allowed =
    options?.allowedPaths !== undefined
      ? new Set(options.allowedPaths)
      : undefined;
  return buildLevel('', call, allowed) as ApiClient<Actions>;
}

// ─── Transports ────────────────────────────────────────────────────────────

export interface InvokeTransportOptions {
  /** The underlying invoke fn (`FluxisClient.invoke`, `ctx.call`, …). */
  readonly invoke: (
    name: string,
    params: unknown,
    options?: RpcCallOptions,
  ) => Promise<unknown>;
  /**
   * Contract path → wire name. Example: demo-hub exposes WS actions as
   * `flx.<service>.<action>` while the contract path is
   * `v1.<service>.<action>` — `mapPath = (p) => p.replace(/^v\d+\./, 'flx.')`.
   */
  readonly mapPath?: (actionPath: string) => string;
}

/** Adapter: contract-path dispatch → a named invoke transport. */
export function invokeTransport(opts: InvokeTransportOptions): ApiTransport {
  return (actionPath, params, options) =>
    opts.invoke(opts.mapPath?.(actionPath) ?? actionPath, params, options);
}

export interface RestTransportOptions {
  /** URL prefix the gateway serves, e.g. `/api` → `/api/v1/auth/login`. */
  readonly baseUrl: string;
  /** fetch impl — injectable for tests; defaults to globalThis.fetch. */
  readonly fetch?: typeof fetch;
  /** Extra headers (e.g. auth token getter evaluated per call). */
  readonly headers?: () => Record<string, string>;
}

/** `"POST /v1/auth/login"` → `{method, path}` — the rest-literal parser. */
export function parseRestLiteral(
  rest: string,
): { method: string; path: string } | undefined {
  const idx = rest.indexOf(' ');
  if (idx <= 0) return undefined;
  return {
    method: rest.slice(0, idx).toUpperCase(),
    path: rest.slice(idx + 1),
  };
}

/**
 * Substitute `:name` path segments from params. Returns the resolved
 * path plus the params NOT consumed by the template (those ride as
 * query or body).
 */
function substitutePathParams(
  path: string,
  params: Record<string, unknown>,
): { path: string; remaining: Record<string, unknown> } {
  const consumed = new Set<string>();
  const resolved = path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (seg, name: string) => {
    const value = params[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing path param '${name}' for route ${path}`);
    }
    consumed.add(name);
    return encodeURIComponent(String(value));
  });
  const remaining: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!consumed.has(k)) remaining[k] = v;
  }
  return { path: resolved, remaining };
}

/**
 * Adapter: contract-path dispatch → HTTP fetch against the action's
 * `rest` literal. The app supplies the literal map — it IS part of the
 * registered type but erased at runtime, so it must be redeclared as a
 * value (a codegen step can produce it from the server registry).
 *
 * `:param` segments substitute from params (URI-encoded); leftover
 * params ride as query string for GET/HEAD/DELETE and JSON body for
 * the rest. Responses unwrap the Orchestra `{success, data}` envelope.
 */
export function restTransport(
  restMap: Readonly<Record<string, string>>,
  opts: RestTransportOptions,
): ApiTransport {
  const doFetch = opts.fetch ?? fetch;
  return async (actionPath, params, options) => {
    const literal = restMap[actionPath];
    if (literal === undefined) {
      throw new Error(`No REST route for action: ${actionPath}`);
    }
    const parsed = parseRestLiteral(literal);
    if (parsed === undefined) {
      throw new Error(`Malformed REST literal for ${actionPath}: ${literal}`);
    }
    const paramObj =
      params !== null && typeof params === 'object'
        ? (params as Record<string, unknown>)
        : {};
    const { path, remaining } = substitutePathParams(parsed.path, paramObj);
    const url = `${opts.baseUrl}${path}`;
    const method = parsed.method;
    const headers: Record<string, string> = {
      ...(opts.headers?.() ?? {}),
    };
    let fetchUrl = url;
    let body: string | undefined;
    if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
      // Convention: GET/HEAD/DELETE params ride as query string.
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(remaining)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      if (qs.size > 0) fetchUrl = `${url}?${qs.toString()}`;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(remaining);
    }
    const res = await doFetch(fetchUrl, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 30_000),
    });
    return unwrapRest(res);
  };
}

/**
 * Error thrown by {@link restTransport} on non-2xx or failed envelopes.
 * Carries the HTTP status so callers can branch on `401` vs network
 * failure without parsing messages.
 */
export class RestError extends Error {
  /** HTTP status code of the failed response. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RestError';
    this.status = status;
  }
}

/** Unwrap the Orchestra `{success, code, message, data}` envelope. */
async function unwrapRest(res: Response): Promise<unknown> {
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    error?: string;
    data?: unknown;
  } | null;
  if (!res.ok || body?.success === false) {
    const detail = body?.message ?? body?.error ?? `HTTP ${res.status}`;
    throw new RestError(detail, res.status);
  }
  return body !== null && 'data' in body ? body.data : body;
}
