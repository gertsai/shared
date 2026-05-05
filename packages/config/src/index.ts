// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/config — configuration loading shim.
 *
 * Re-exports the canonical `loadConfig` and related Node runtime helpers from
 * `@gertsai/api-core/runtime/node`. This package exists per PRD-001 FR-016 +
 * ADR-004 to provide a named extraction point so consumers may depend on
 * `@gertsai/config` directly without coupling to the wider `api-core` surface.
 *
 * Long-term, the canonical location is the `@gertsai/api-core/runtime/node`
 * subpath. This shim is stable but intentionally thin — it adds no behaviour
 * of its own.
 *
 * Currently re-exports:
 *   - `loadConfig`            — env-vars overlay for a typed config object.
 *   - `createGcpLoggerStream` — bunyan stream for `@google-cloud/logging`.
 *
 * @see {@link ../../api-core/src/runtime/node/index.ts} for the canonical surface.
 */

export { loadConfig, createGcpLoggerStream } from '@gertsai/api-core/runtime/node';
