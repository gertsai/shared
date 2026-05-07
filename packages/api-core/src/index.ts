// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core
 *
 * Legacy root export — backward compat для v0.1.x consumers.
 *
 * NEW CODE: импортируйте из subpaths:
 *   - @gertsai/api-core/contracts    — pure types (APIError, ResponseCode, envelope, openapi)
 *   - @gertsai/api-core/moleculer    — Moleculer runtime (ApiController, queues, channels, workflows)
 *   - @gertsai/api-core/runtime/node — Node side-effects (loadConfig, createGcpLoggerStream)
 *
 * @deprecated Root export will warn в v0.3.x и будет removed в v1.0.0. Use subpaths.
 */
export * from './contracts';
export * from './moleculer';
// Note: runtime/node НЕ reexport'нут из root (eager dotenv/gcp side effects unwanted).
