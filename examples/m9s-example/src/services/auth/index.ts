// SPDX-License-Identifier: Apache-2.0
/**
 * Auth Service — domain entry point (Wave 10.A).
 *
 * See `services/ingest/index.ts` for the rationale on lifecycle-first
 * import ordering.
 */

// Lifecycle MUST be imported first — registers controller + handlers.
import './lifecycle';

// Actions
export * from './src';

// Types
export * from './types';
