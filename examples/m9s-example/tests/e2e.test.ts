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
