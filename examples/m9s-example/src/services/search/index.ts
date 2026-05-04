/**
 * Search Service — domain entry point.
 *
 * See `services/ingest/index.ts` for the rationale on lifecycle-first import.
 */

// Lifecycle MUST be imported first — registers controller + handlers.
import './lifecycle';

// Actions
export * from './src';

// Types
export * from './types';
