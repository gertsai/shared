// SPDX-License-Identifier: Apache-2.0
/**
 * Real end-to-end (broker.call) — m9s-example.
 *
 * Sprint 3.10 closes the e2e gap from Sprint 3.5.2 lesson (post-Build
 * fidelity audit must include true e2e, not just build verification).
 *
 * What this exercises end-to-end (NOT mocks):
 *   1. Broker boot via `ApiController.Start({ brokerConfig, services, repl })`
 *      — same code path as `pnpm start`.
 *   2. Wave 5 middleware composition through the broker pipeline:
 *      - `tenantMiddleware` reads `X-Tenant-ID` from `ctx.meta.headers` and
 *        writes `ctx.meta.tenantId`.
 *      - `sessionMiddleware` composes a `RequestContext`, attaches it to
 *        `ctx.locals.requestContext`, and `$freeze()`s it before the
 *        downstream action handler runs (per ADR-007 I-16).
 *   3. Real action handlers (`v1.ingest.document` + `v1.search.query`)
 *      executing through the canonical Wave 5 stack.
 *   4. End-to-end inspection of the resolved context via a probe middleware
 *      registered at the tail of the broker pipeline — captures
 *      `ctx.meta.tenantId` + `ctx.locals.requestContext` so tests can
 *      assert the canonical wiring is intact.
 *
 * IMPORTANT — typia transformer requirement: m9s-example actions use
 * `typia.createValidate<T>()` which requires the `tspc` build step to
 * inject the transformed validator. vitest uses esbuild WITHOUT the typia
 * plugin, so source imports throw `NoTransformConfigurationError` at
 * module load. We therefore import the runtime side-effects from
 * `../dist/src/...` (pre-built by Phase B `pnpm build`) so typia validators
 * are already inlined. Test types still come from source where possible.
 *
 * Pre-requisite: `pnpm --filter @gertsai-examples/m9s-example run build`
 * MUST have run before this suite (Phase B does this; CI does too).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Context, Middleware } from 'moleculer';

// REQUEST_CONTEXT_LOCALS_KEY lives on the /moleculer subpath (NOT the root
// surface — root remains transport-agnostic per ADR-007 §2).
import { REQUEST_CONTEXT_LOCALS_KEY } from '@gertsai/runtime-context/moleculer';
import type { RequestContext } from '@gertsai/runtime-context';

// CRITICAL — module identity preservation:
//   m9s-example `dist/` is CommonJS (tsconfig `"module": "CommonJS"`). Its
//   side-effect side `import('../dist/src/services/index.js')` triggers the
//   CJS `require('@gertsai/api-core/moleculer')` which resolves to the
//   package's CJS bundle (`dist/moleculer.cjs`). If the test imports the
//   SAME package via ESM `await import(...)`, Node resolves the ESM bundle
//   instead — yielding a SEPARATE `ApiController` class identity whose
//   static `_controllers` registry is empty. Result: registered services
//   are invisible to the broker the test boots → `ServiceNotFoundError`.
//
// Fix: route the test's ApiController + ApiService imports through
// `createRequire` so they share module identity with the dist side-effect.
const requireFromHere = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Probe middleware — captures the post-Wave-5 ctx state so tests can assert
// the canonical wiring (tenantMiddleware + sessionMiddleware) executed.
// ---------------------------------------------------------------------------
interface ProbeFrame {
  metaTenantId: string | undefined;
  rcTenantId: string | undefined;
  rcFrozen: boolean;
  rcCorrelationId: string | undefined;
}
const probeFrames: Map<string, ProbeFrame> = new Map();

// IMPORTANT — Moleculer middleware order discovery (verified via dual-probe
// experiment Sprint 3.10 e2e bring-up): in `BrokerOptions.middlewares = [m0,
// m1, ..., mN]`, the LAST entry (index N) is the OUTERMOST wrapper and runs
// FIRST chronologically. The FIRST entry (index 0) is the INNERMOST wrapper
// and runs LAST chronologically (closest to the handler). This is the
// opposite of typical "onion" intuition — Moleculer wraps in array order so
// later registrations win the outer position.
//
// To capture POST Wave-5 state, the probe MUST be at index 0 of the array
// (innermost). This is how `wave5-middlewares.ts` itself orders things:
// `[tenantMiddleware, sessionMiddleware]` means sessionMiddleware is closer
// to handler (runs last → composes RC after tenantMiddleware sets
// ctx.meta.tenantId). Both middlewares share the same resolver instance, so
// even when ordering is unintuitive the sessionMiddleware fallback path
// (resolve again if meta.tenantId missing) keeps the canonical wiring
// correct.
function probeMiddleware(): Middleware {
  return {
    localAction(next: (ctx: Context) => Promise<unknown>) {
      return async function probeWrapper(ctx: Context) {
        const meta = (ctx.meta ?? {}) as Record<string, unknown>;
        const locals = (ctx as unknown as { locals?: Record<string, unknown> })
          .locals;
        const rc = locals?.[REQUEST_CONTEXT_LOCALS_KEY] as
          | RequestContext
          | undefined;
        const actionName = ctx.action?.name ?? 'unknown';
        // RequestContext.tenantId throws TenantContextMissingError when not
        // resolved (e.g. anonymous flow under mode='optional'). Capture the
        // throw as `undefined` so the probe stays observation-only.
        let rcTenantId: string | undefined;
        try {
          rcTenantId = rc?.tenantId;
        } catch {
          rcTenantId = undefined;
        }
        let rcCorrelationId: string | undefined;
        try {
          rcCorrelationId = rc?.correlationId;
        } catch {
          rcCorrelationId = undefined;
        }
        probeFrames.set(actionName, {
          metaTenantId:
            typeof meta['tenantId'] === 'string'
              ? (meta['tenantId'] as string)
              : undefined,
          rcTenantId,
          rcFrozen: rc?.frozen === true,
          rcCorrelationId,
        });
        return next(ctx);
      };
    },
  };
}

describe('m9s-example e2e (broker.call) — Sprint 3.10 Wave 5 stack', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let broker: any;

  beforeAll(async () => {
    // Side-effect via CJS require — same module identity as ApiController
    // below. Side-effect registers controllers in ApiController._controllers.
    requireFromHere('../dist/src/services/index.js');

    const { ApiController } = requireFromHere(
      '@gertsai/api-core/moleculer',
    ) as typeof import('@gertsai/api-core/moleculer');
    const brokerConfigDefault = requireFromHere('../dist/moleculer.config.js')
      .default as import('moleculer').BrokerOptions;
    const ApiService = requireFromHere('../dist/src/mol-services/api.service.js')
      .default;

    // Probe at INDEX 0 (innermost) — sees post-Wave-5 ctx state.
    // See block comment on `probeMiddleware()` for Moleculer order rationale.
    const brokerConfig = {
      ...brokerConfigDefault,
      middlewares: [
        probeMiddleware(), // index 0 — innermost wrapper; runs last; sees post Wave 5.
        ...((brokerConfigDefault.middlewares ?? []) as Middleware[]),
      ],
      // Silence broker logs in test output.
      logger: {
        type: 'Console',
        options: { level: 'error' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    };

    broker = await ApiController.Start({
      brokerConfig,
      services: [ApiService],
      repl: false,
    });
  }, 30_000);

  afterAll(async () => {
    if (broker !== undefined) {
      await broker.stop();
    }
    probeFrames.clear();
  });

  it('resolves tenant from X-Tenant-ID header end-to-end and runs ingest action', async () => {
    probeFrames.clear();

    const input = {
      docId: 'doc-e2e-tenant-acme-1',
      text: 'Hexagonal architecture isolates the core from infrastructure. Wave 5 middleware composes RequestContext per request.',
      userId: 'user-e2e-1',
    };

    const resp = await broker.call('v1.ingest.document', input, {
      meta: { headers: { 'x-tenant-id': 'tenant-acme' } },
    });

    expect(resp).toBeDefined();
    const respData = (resp as { data?: { docId?: string } }).data;
    expect(respData?.docId).toBe('doc-e2e-tenant-acme-1');

    // End-to-end Wave 5 wiring assertion: probe (registered AFTER
    // tenantMiddleware + sessionMiddleware) saw the resolved tenantId on
    // ctx.meta and the composed-and-frozen RequestContext on ctx.locals.
    const frame = probeFrames.get('v1.ingest.document');
    expect(frame).toBeDefined();
    expect(frame!.metaTenantId).toBe('tenant-acme');
    expect(frame!.rcTenantId).toBe('tenant-acme');
    expect(frame!.rcFrozen).toBe(true);
    expect(typeof frame!.rcCorrelationId).toBe('string');
    expect(frame!.rcCorrelationId).not.toBe('');
  }, 15_000);

  it('runs ingest action without X-Tenant-ID header (mode=optional resolver)', async () => {
    probeFrames.clear();

    const input = {
      docId: 'doc-e2e-anon-1',
      text: 'Anonymous flow — no tenant header. Wave 5 middleware in optional mode allows this.',
      userId: 'user-anon',
    };

    const resp = await broker.call('v1.ingest.document', input);

    expect(resp).toBeDefined();
    const frame = probeFrames.get('v1.ingest.document');
    expect(frame).toBeDefined();
    // Anonymous: tenantMiddleware optional mode → no tenantId on meta.
    expect(frame!.metaTenantId).toBeUndefined();
    // sessionMiddleware still composed RequestContext, just without tenant.
    expect(frame!.rcTenantId).toBeUndefined();
    expect(frame!.rcFrozen).toBe(true);
  }, 15_000);

  it('exercises ingest → search round-trip with X-Tenant-ID propagated through both calls', async () => {
    probeFrames.clear();

    const ingestInput = {
      docId: 'doc-e2e-search-1',
      text: 'Wave 5 stack reference application demonstrating canonical composition through Moleculer broker.',
      userId: 'user-e2e-search',
    };

    const ingestResp = await broker.call('v1.ingest.document', ingestInput, {
      meta: { headers: { 'x-tenant-id': 'tenant-acme' } },
    });
    expect(ingestResp).toBeDefined();
    const ingestFrame = probeFrames.get('v1.ingest.document');
    expect(ingestFrame!.metaTenantId).toBe('tenant-acme');

    const searchResp = await broker.call(
      'v1.search.query',
      { query: 'wave 5' },
      {
        meta: { headers: { 'x-tenant-id': 'tenant-acme' } },
      },
    );
    expect(searchResp).toBeDefined();

    const searchFrame = probeFrames.get('v1.search.query');
    expect(searchFrame).toBeDefined();
    expect(searchFrame!.metaTenantId).toBe('tenant-acme');
    expect(searchFrame!.rcTenantId).toBe('tenant-acme');
    expect(searchFrame!.rcFrozen).toBe(true);
  }, 30_000);

  it('produces a fresh correlationId per request (sessionMiddleware composes per-call)', async () => {
    probeFrames.clear();

    const callsCorrelationIds: Array<string | undefined> = [];

    for (let i = 0; i < 3; i++) {
      await broker.call(
        'v1.ingest.document',
        { docId: `doc-corr-${i}`, text: 'x'.repeat(20), userId: 'u' },
        { meta: { headers: { 'x-tenant-id': 'tenant-corr' } } },
      );
      const frame = probeFrames.get('v1.ingest.document');
      callsCorrelationIds.push(frame?.rcCorrelationId);
    }

    // All 3 correlationIds set + all distinct (per-request scope).
    expect(callsCorrelationIds.every((id) => typeof id === 'string')).toBe(
      true,
    );
    const unique = new Set(callsCorrelationIds);
    expect(unique.size).toBe(3);
  }, 30_000);
});

// ===========================================================================
// Sprint 3.10 Addendum 2 — broker-level session-guard rejection scenarios
//
// The first describe block above proves Wave 5 middleware composes ctx
// state through the broker pipeline. This second block goes one step
// deeper: it injects an actual `Session` per request via a custom
// `sessionFactory` and verifies that session-guard rejections (destroyed
// session, cross-tenant) propagate from the use case → action handler
// (which maps them to APIError per Sprint 3.10 Addendum 2 wiring) →
// broker.call rejection.
//
// Boots a SECOND broker with a test-only Wave 5 stack so the production
// broker config from the first block stays unchanged. The custom
// sessionFactory reads `ctx.meta.testSession` (a real `Session` object
// passed by the test) and wires it into the per-request RequestContext.
// ===========================================================================
describe('m9s-example e2e (broker.call) — session-guard rejection paths', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let broker: any;

  beforeAll(async () => {
    requireFromHere('../dist/src/services/index.js');

    const { ApiController } = requireFromHere(
      '@gertsai/api-core/moleculer',
    ) as typeof import('@gertsai/api-core/moleculer');
    const brokerConfigDefault = requireFromHere('../dist/moleculer.config.js')
      .default as import('moleculer').BrokerOptions;
    const ApiService = requireFromHere(
      '../dist/src/mol-services/api.service.js',
    ).default;

    // Pull the same Wave 5 primitives the production composition uses, but
    // assemble a custom stack here with a sessionFactory that reads the
    // test fixture session off `ctx.meta.testSession`. Going through
    // requireFromHere keeps module identity aligned with the dist code path
    // (same tenant-resolver / runtime-context instances as actions consume).
    const { tenantMiddleware } = requireFromHere(
      '@gertsai/tenant-resolver/moleculer',
    );
    const {
      sessionMiddleware: sessionMiddlewareFn,
    } = requireFromHere('@gertsai/runtime-context/moleculer');
    const {
      buildTenantResolver,
    } = requireFromHere('../dist/src/composition/wave5-middlewares.js');

    const resolver = buildTenantResolver();
    const customWave5 = [
      tenantMiddleware(resolver),
      sessionMiddlewareFn({
        resolver,
        // Read pre-built Session fixture from meta. Structural typing —
        // session-guard's assertAuthenticated/assertSessionInTenant inspect
        // session.destroyed / session.tenantId properties, not class
        // identity, so the fixture works across module boundaries.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sessionFactory: (ctx: any) => {
          const meta = (ctx.meta ?? {}) as Record<string, unknown>;
          const fixture = meta['testSession'];
          return fixture as unknown as undefined;
        },
      }),
    ];

    // Replace default Wave 5 with custom stack. Keep other broker config
    // (cacher, transporter, etc.) intact.
    const defaultMids = (brokerConfigDefault.middlewares ?? []) as Middleware[];
    // Filter out the production tenant + session middlewares (they used the
    // same hooks, occupy the first 2 slots — see wave5-middlewares.ts).
    const nonWave5 = defaultMids.slice(2);

    const brokerConfig = {
      ...brokerConfigDefault,
      middlewares: [...customWave5, ...nonWave5] as Middleware[],
      logger: {
        type: 'Console',
        options: { level: 'error' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    };

    broker = await ApiController.Start({
      brokerConfig,
      services: [ApiService],
      repl: false,
    });
  }, 30_000);

  afterAll(async () => {
    if (broker !== undefined) {
      await broker.stop();
    }
  });

  /**
   * Construct a Session via require (CJS — same module identity as
   * session-guard's assertAuthenticated/assertSessionInTenant consume
   * inside the broker). The shape comes from `@gertsai/session`.
   */
  function makeSession(opts: {
    tenantId?: string;
    operatorUuid?: string;
    destroyed?: boolean;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Session } = requireFromHere('@gertsai/session');
    const session = new Session({
      operatorUuid: opts.operatorUuid ?? 'user-test-1',
      operatorType: 'web',
      tokenGetter: async () => 'tok',
      dialog: {
        confirm: async () => true,
        alert: () => {},
        error: () => {},
      },
      clientPlatform: 'web',
      clientVersion: '0.0.0-test',
      tenantId: opts.tenantId,
    });
    if (opts.destroyed === true) {
      session.$destroy();
    }
    return session;
  }

  it('rejects ingest with destroyed session — surfaces 401 Authentication required', async () => {
    const destroyed = makeSession({
      tenantId: 'tenant-acme',
      destroyed: true,
    });

    const input = {
      docId: 'doc-rej-destroyed-1',
      text: 'should be rejected before use case body runs',
      userId: 'user-rej-1',
    };

    const result = await broker
      .call('v1.ingest.document', input, {
        meta: {
          headers: { 'x-tenant-id': 'tenant-acme' },
          testSession: destroyed,
        },
      })
      .then(
        () => ({ resolved: true as const }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: any) => ({ resolved: false as const, err }),
      );

    expect(result.resolved).toBe(false);
    if (result.resolved === false) {
      // Action handler maps AuthenticationRequiredError → APIError
      // (UNAUTHORIZED_REQUEST). Moleculer surfaces this as the rejection.
      const errStr = String(result.err?.message ?? result.err);
      expect(errStr).toMatch(/Authentication required|UNAUTHORIZED/i);
    }
  }, 15_000);

  it('rejects ingest with cross-tenant session — surfaces 403 Tenant scope violation', async () => {
    const wrongTenantSession = makeSession({
      tenantId: 'tenant-foo', // session scoped to foo
      operatorUuid: 'user-rej-2',
    });

    const input = {
      docId: 'doc-rej-cross-tenant-1',
      text: 'should be rejected — session.tenant !== expected.tenant',
      userId: 'user-rej-2',
    };

    const result = await broker
      .call('v1.ingest.document', input, {
        meta: {
          // Header (and thus expectedTenantId) is tenant-bar; session is foo.
          headers: { 'x-tenant-id': 'tenant-bar' },
          testSession: wrongTenantSession,
        },
      })
      .then(
        () => ({ resolved: true as const }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: any) => ({ resolved: false as const, err }),
      );

    expect(result.resolved).toBe(false);
    if (result.resolved === false) {
      const errStr = String(result.err?.message ?? result.err);
      expect(errStr).toMatch(/Tenant scope violation|FORBIDDEN/i);
    }
  }, 15_000);

  it('happy path with valid session matching tenant — succeeds', async () => {
    const session = makeSession({
      tenantId: 'tenant-acme',
      operatorUuid: 'user-happy-1',
    });

    const input = {
      docId: 'doc-rej-happy-1',
      text: 'session-guard assertions pass; use case runs to completion',
      userId: 'user-happy-1',
    };

    const resp = await broker.call('v1.ingest.document', input, {
      meta: {
        headers: { 'x-tenant-id': 'tenant-acme' },
        testSession: session,
      },
    });

    expect(resp).toBeDefined();
    const respData = (resp as { data?: { docId?: string } }).data;
    expect(respData?.docId).toBe('doc-rej-happy-1');
  }, 15_000);

  it('rejects search with destroyed session — same code path as ingest', async () => {
    const destroyed = makeSession({
      tenantId: 'tenant-acme',
      destroyed: true,
    });

    const result = await broker
      .call(
        'v1.search.query',
        { query: 'anything' },
        {
          meta: {
            headers: { 'x-tenant-id': 'tenant-acme' },
            testSession: destroyed,
          },
        },
      )
      .then(
        () => ({ resolved: true as const }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: any) => ({ resolved: false as const, err }),
      );

    expect(result.resolved).toBe(false);
    if (result.resolved === false) {
      const errStr = String(result.err?.message ?? result.err);
      expect(errStr).toMatch(/Authentication required|UNAUTHORIZED/i);
    }
  }, 15_000);
});
