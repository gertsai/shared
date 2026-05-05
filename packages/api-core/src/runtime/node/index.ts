// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/runtime/node
 *
 * Node.js-specific factories. Opt-in side effects (только при явном вызове).
 *
 * - loadConfig — env-vars overlay для config object (uses process.env).
 * - createGcpLoggerStream — bunyan stream для @google-cloud/logging.
 *
 * Peer deps: dotenv (consumer-side), @google-cloud/logging-bunyan.
 *
 * NOTE: Sprint 2 Phase A — barrel reexport (per I-12 amendment, no physical move).
 * Physical move в src/runtime/node/{config,logger}.ts отложен на Sprint 3 если нужно.
 */
export { loadConfig } from '../../project-config';
export { createGcpLoggerStream } from '../../moleculer/moleculerConfig.template';
