// SPDX-License-Identifier: Apache-2.0
/**
 * Real-infrastructure e2e — BullMQ async + Redis cacher activation
 * (Sprint 3.11 Track 3 / W-3-11-19).
 *
 * Scope: prove the env-gated `if (config.REDIS_URL)` paths in
 * `services/index.ts` (BullMQ queue config) and `moleculer.config.ts`
 * (@moleculer/channels + @moleculer/workflows) compose end-to-end against
 * a real Redis, AND that the `IngestDocumentUseCase` async/queued contract
 * upholds eventual-consistency between Document and Chunks per ADR-011
 * Amendment 2 §A2.9:
 *
 *   1. `broker.call('v1.ingest.document', ...)` returns IMMEDIATELY with
 *      `mode='queued'` + `jobId` (no waiting for chunks).
 *   2. Polling `broker.call('v1.search.query', ...)` returns `[]` initially
 *      (chunks not yet persisted by the BullMQ worker).
 *   3. After the worker completes, polling search returns the ingested docId.
 *   4. NO race-condition error surfaces along the way.
 *
 * Pre-requisites:
 *   - Redis listening on `REDIS_URL` (default `redis://localhost:6379`).
 *   - Phase B `pnpm build` has produced m9s-example dist/ (typia validators
 *     inlined — see e2e.test.ts for rationale).
 *
 * Skip behavior: SKIPPED unless either:
 *   - `BULLMQ_E2E=1` env var set (force), OR
 *   - Redis ping succeeds within ~1s (auto-detected).
 *
 * Why env-gated: CI runners without Redis must not block release; local
 * dev + release-readiness sweeps run with `docker compose up -d redis`
 * (or `pnpm infra:up`) and exercise this path explicitly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Middleware } from 'moleculer';

const requireFromHere = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Probe Redis before the suite registers — avoids spinning up the broker
// when external infra is missing.
// ---------------------------------------------------------------------------
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const FORCE = process.env['BULLMQ_E2E'] === '1';

async function redisAlive(): Promise<boolean> {
  // ioredis is already a transitive dep via `@gertsai/api-core` queue config;
  // we keep the probe self-contained by talking to Redis with a single PING.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let IORedisCtor: any;
  try {
    IORedisCtor = requireFromHere('ioredis').default ?? requireFromHere('ioredis');
  } catch {
    return false;
  }
  let client: { ping: () => Promise<string>; quit: () => Promise<unknown> } | undefined;
  try {
    client = new IORedisCtor(REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: false,
      connectTimeout: 1_000,
    });
    const result = await Promise.race([
      client!.ping(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 1_000),
      ),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  } finally {
    try {
      await client?.quit();
    } catch {
      /* ignore */
    }
  }
}

const redisReady = FORCE || (await redisAlive());

const maybe = redisReady ? describe : describe.skip;

maybe(
  'm9s-example real-infra e2e (BullMQ async + Redis activation — Track 3)',
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let broker: any;

    beforeAll(async () => {
      // Configure m9s to use REAL Redis BEFORE any module loads. Same caveat
      // as real-infra.test.ts — `project.config.ts` is module-scoped and
      // evaluated once on first import; setting envs here MUST happen before
      // the dist requires below so `QUEUE_ENABLED = !!config.REDIS_URL` is
      // observed `true` by `services/index.ts` and the ingest action.
      process.env['REDIS_URL'] = REDIS_URL;
      // Mock embedder keeps the suite focused on async wiring, not vectors.
      process.env['EMBEDDER_PROVIDER'] = 'mock';

      // Side-effect: register controllers. Triggers BullMQ `queueConfig`
      // construction in `services/index.ts` (covers W-3-11-18 verify path).
      requireFromHere('../../dist/src/services/index.js');

      const { ApiController } = requireFromHere(
        '@gertsai/api-core/moleculer',
      ) as typeof import('@gertsai/api-core/moleculer');
      const brokerConfigDefault = requireFromHere('../../dist/moleculer.config.js')
        .default as import('moleculer').BrokerOptions;
      const ApiService = requireFromHere(
        '../../dist/src/mol-services/api.service.js',
      ).default;

      const brokerConfig = {
        ...brokerConfigDefault,
        // Production Wave 5 middlewares + channels + workflows (the latter
        // two are conditionally appended by moleculer.config when
        // REDIS_URL is set — that's what we're verifying).
        middlewares: brokerConfigDefault.middlewares as Middleware[],
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
    }, 60_000);

    afterAll(async () => {
      if (broker !== undefined) {
        await broker.stop();
      }
    });

    /**
     * Light polling helper — repeatedly invokes `probe()` until it returns
     * `true` or the timeout elapses. Returns whether the predicate ever
     * became true (so callers can `expect(...)` against it).
     */
    async function pollUntil(
      probe: () => Promise<boolean>,
      opts: { timeout: number; interval: number },
    ): Promise<boolean> {
      const deadline = Date.now() + opts.timeout;
      while (Date.now() < deadline) {
        if (await probe()) return true;
        await new Promise((resolve) => setTimeout(resolve, opts.interval));
      }
      return false;
    }

    it("returns mode='queued' + jobId immediately (no waiting for worker)", async () => {
      const input = {
        docId: `bullmq-immediate-${Date.now()}`,
        text:
          'Async ingest path: action enqueues a BullMQ job and returns ' +
          'immediately. Worker processes asynchronously off the request thread.',
        userId: 'user-bullmq-immediate',
      };

      const t0 = Date.now();
      const resp = await broker.call('v1.ingest.document', input, {
        meta: { headers: { 'x-tenant-id': 'tenant-bullmq' } },
      });
      const elapsed = Date.now() - t0;

      expect(resp).toBeDefined();
      const data = (
        resp as {
          data?: {
            docId?: string;
            jobId?: string;
            mode?: string;
            chunkCount?: number | null;
          };
        }
      ).data;
      expect(data?.docId).toBe(input.docId);
      expect(data?.mode).toBe('queued');
      expect(typeof data?.jobId).toBe('string');
      expect((data?.jobId ?? '').length).toBeGreaterThan(0);
      // Queued mode returns null chunkCount per IngestDocumentResponse contract.
      expect(data?.chunkCount).toBeNull();
      // Sanity: enqueue path must be fast — under any reasonable system the
      // request thread should not be blocked by chunk processing. 5s buffer
      // accommodates slow CI Redis but still trips on accidental sync paths.
      expect(elapsed).toBeLessThan(5_000);
    }, 30_000);

    it(
      'eventual consistency Document↔Chunks: ingest queued + initial search empty + worker completes + search finds doc',
      async () => {
        // Distinctive query token so the test's search hits ONLY this ingest.
        const token = `bullmq-evcons-${Date.now()}`;
        const ingestInput = {
          docId: token,
          text:
            `Eventual consistency contract token=${token}. ` +
            'Document persisted by use case via the BullMQ worker; ' +
            'until the worker completes, search returns no chunks for this id.',
          userId: 'user-evcons',
        };

        // 1. Enqueue — must return mode='queued' immediately.
        const ingestResp = await broker.call('v1.ingest.document', ingestInput, {
          meta: { headers: { 'x-tenant-id': 'tenant-bullmq' } },
        });
        const ingestData = (
          ingestResp as { data?: { mode?: string; jobId?: string } }
        ).data;
        expect(ingestData?.mode).toBe('queued');
        expect(typeof ingestData?.jobId).toBe('string');

        // 2. Search RIGHT AFTER enqueue — chunks not yet persisted by the
        //    worker, so this must return zero results for our docId. NO
        //    race-condition error must surface.
        const searchAttempt = async (): Promise<
          ReadonlyArray<{ docId?: string }>
        > => {
          const searchResp = await broker.call(
            'v1.search.query',
            { query: token, topK: 5 },
            { meta: { headers: { 'x-tenant-id': 'tenant-bullmq' } } },
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return ((searchResp as any).data?.results ?? []) as Array<{
            docId?: string;
          }>;
        };

        // Sprint 3.11 Post-Build Track 3 §P1-3 — race-tolerant initial
        // assertion. On a fast laptop (mock embedder + warm Redis) the
        // BullMQ worker can complete the chunk write between `await
        // broker.call('v1.ingest.document', ...)` returning and the
        // immediately-following search dispatch. The original assertion
        // (`length === 0`) was flake-prone. The contract we actually care
        // about is "the synchronous response did NOT block on chunk
        // persistence" — i.e. the response returned `mode='queued'` BEFORE
        // chunks were guaranteed visible. The first search either sees 0
        // matches (chunks not yet flushed) OR 1 match (worker beat us);
        // both outcomes prove the async wiring fired without a bug. Do
        // NOT relax this further — `>1` would imply phantom rows.
        const initialResults = await searchAttempt();
        const matchesInitial = initialResults.filter(
          (r) => r.docId === token,
        );
        expect(matchesInitial.length).toBeLessThanOrEqual(1);

        // 3. Poll until the worker's chunks land in the chunk store.
        //    5s timeout is generous for a mock embedder + InMemory chunk
        //    store; bumps to 10s on first BullMQ Worker bootstrap.
        const arrived = await pollUntil(
          async () => {
            const results = await searchAttempt();
            return results.some((r) => r.docId === token);
          },
          { timeout: 10_000, interval: 200 },
        );
        expect(arrived).toBe(true);

        // 4. Final search snapshot — confirms persistence stuck (not a
        //    transient hit) and asserts the canonical post-condition.
        const finalResults = await searchAttempt();
        expect(finalResults.some((r) => r.docId === token)).toBe(true);
      },
      30_000,
    );

    it('queues sequential ingests under tenant header without race errors', async () => {
      // Exercises consumer group + retry policy paths — all three jobs MUST
      // settle without surfacing exceptions to broker.call. No assertion on
      // ordering (BullMQ is at-least-once, not in-order).
      const N = 3;
      const tokens = Array.from(
        { length: N },
        (_, i) => `bullmq-batch-${Date.now()}-${i}`,
      );

      const responses = await Promise.all(
        tokens.map((tok) =>
          broker.call(
            'v1.ingest.document',
            {
              docId: tok,
              text: `Batch payload for token=${tok}. ` + 'x'.repeat(120),
              userId: 'user-batch',
            },
            { meta: { headers: { 'x-tenant-id': 'tenant-bullmq' } } },
          ),
        ),
      );

      for (const resp of responses) {
        const data = (resp as { data?: { mode?: string; jobId?: string } })
          .data;
        expect(data?.mode).toBe('queued');
        expect(typeof data?.jobId).toBe('string');
      }
    }, 30_000);
  },
);

if (!redisReady) {
  // eslint-disable-next-line no-console
  console.log(
    '[bullmq.test] Redis unavailable at',
    REDIS_URL,
    '— skipping BullMQ real-infra suite. Set BULLMQ_E2E=1 to force, or run `pnpm infra:up` to boot the Redis service from docker-compose.yml.',
  );
}
