// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/moleculer
 *
 * Moleculer-specific runtime: ApiController, service factories, gateway/openapi templates,
 * OAuth mixin, log level, workflows (experimental stub).
 * Lazy-init; zero module-load side effects.
 *
 * Peer deps: moleculer, moleculer-web, ioredis, nats, optional @google-cloud/pubsub.
 */
export * from '../lib/controller';
// Wave 16.A — legacy OAuth module removed. The `MX()` mixin and the
// `OAuth` class are gone; consumers wanting OAuth mount their own
// middleware in `settings.use`. The throw-on-import stub at
// `lib/oauth/index.ts` is intentionally NOT re-exported from this
// subpath so that importing `@gertsai/api-core/moleculer` stays safe.
// Wave 11.B (PRD-024) — typed action-export wrapper retiring `: any`
// annotations at every controller.register call site. See define-action.ts
// for migration guidance.
export * from '../lib/define-action';
export * from './apiGateService.template';
export * from './openapiService.template';
export * from './moleculerConfig.template';
export * from './types';
export * from './workflow';
