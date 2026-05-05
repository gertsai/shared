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
export * from '../lib/oauth';
export * from './apiGateService.template';
export * from './openapiService.template';
export * from './moleculerConfig.template';
export * from './oauth.mixin';
export * from './types';
export * from './workflow';
