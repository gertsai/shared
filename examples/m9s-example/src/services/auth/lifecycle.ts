// SPDX-License-Identifier: Apache-2.0
/**
 * Auth Service Lifecycle — Wave 10.A demo.
 *
 * Stateless service: no shared infrastructure, no use case, no queues.
 * Existence of this file mirrors the ingest/search shape so api-core
 * sees a registered controller with proper `started/stopped` handlers.
 *
 * The HS256 secret + sign/verify helpers live in `src/jwt.ts` and are
 * consumed directly by each action — there's nothing to wire onto
 * `ctx.service` here.
 */
import { resolveExampleController } from '../../lib/example-controller';
import { startRotationPruner } from './src/rotation-store';
import type { AuthServiceContext } from './types';

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth');

// REST routes are prefixed by the api-gateway route (`/api/v1`); use '/'
// to avoid the `v1/auth/v1/auth/...` duplication.
controller.setRestBasePath('/');

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.auth] starting (demo — accepts any credentials)...');
  // Soft warning when running with the placeholder secret. We intentionally
  // do NOT throw — the demo MUST run out of the box.
  if (!process.env.JWT_SECRET) {
    ctx.logger?.warn(
      '[v1.auth] JWT_SECRET not set — using DEMO secret. Set JWT_SECRET to a high-entropy value before any deployment.',
    );
  }
  // EVID-039 P2 / W-Security-1: start the rotation-store pruner so the
  // jti map doesn't grow unbounded under brute-force login traffic.
  startRotationPruner();
  ctx.logger?.info('[v1.auth] ready');
});

controller.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.auth] stopped.');
});

export { controller };
