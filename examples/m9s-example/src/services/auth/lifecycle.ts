// SPDX-License-Identifier: Apache-2.0
/**
 * Auth Service Lifecycle — Wave 10.A demo, hardened Wave 12.E-fix-2.
 *
 * Wave 12.E-fix-2 (PRD-039 FR-001 / EVID-053 CRIT-1 / CWE-613): rotation
 * store now DI'd from the composition root via `infrastructure.rotationStore`.
 * Pre-fix, the auth actions static-imported a module-level Map facade so
 * `REDIS_URL`-driven `RedisRotationStore` selection in
 * `composition/infrastructure.ts` was wired but never consumed —
 * multi-instance prod deploys silently dropped reuse-detection state
 * across nodes and process restarts cleared the in-memory map. The
 * lifecycle now stashes the composition-root `IRotationStore` on
 * `ctx.service.rotationStore` (mirroring the ingest/search lifecycle
 * pattern) and the actions consume it via `service.rotationStore` —
 * in-memory and Redis modes both wired through composition.
 *
 * Background pruner is now started by `buildInfrastructure()`
 * (`rotationStore.startPruner()`) so the lifecycle no longer needs to
 * call it itself — eliminating the duplicate kick of the in-memory
 * timer and ensuring the Redis path (where `startPruner` is a no-op)
 * stays uniform.
 *
 * The HS256 secret + sign/verify helpers live in `src/jwt.ts` and are
 * consumed directly by each action; only the rotation store is wired
 * onto `ctx.service` here today (Phase 2+ will move `userRepo` through
 * DI as well).
 */
import { resolveExampleController } from '../../lib/example-controller';
import { infrastructure } from '../../composition/infrastructure';
import type { AuthServiceContext } from './types';

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth');

// REST routes are prefixed by the api-gateway route (`/api/v1`); use '/'
// to avoid the `v1/auth/v1/auth/...` duplication.
controller.setRestBasePath('/');

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.auth] starting...');
  // Soft warning when running with the placeholder secret. We intentionally
  // do NOT throw — the demo MUST run out of the box.
  if (!process.env.JWT_SECRET) {
    ctx.logger?.warn(
      '[v1.auth] JWT_SECRET not set — using DEMO secret. Set JWT_SECRET to a high-entropy value before any deployment.',
    );
  }

  // Wave 12.E-fix-2 (EVID-053 CRIT-1): wire the composition-root rotation
  // store onto the service context so action handlers consume the
  // env-selected impl (InMemoryRotationStore by default,
  // RedisRotationStore when REDIS_URL is set). The pruner is already
  // started by `buildInfrastructure()`; calling it again here would be a
  // benign idempotent no-op but we skip it so there is exactly ONE
  // ownership site for the timer.
  ctx.service.rotationStore = infrastructure.rotationStore;

  ctx.logger?.info(
    `[v1.auth] ready (rotationStore=${infrastructure.rotationStore.constructor.name})`,
  );
});

controller.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.auth] stopped.');
});

export { controller };
