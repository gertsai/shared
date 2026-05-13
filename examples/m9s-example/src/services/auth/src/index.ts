// SPDX-License-Identifier: Apache-2.0
/**
 * Auth service — actions barrel re-export.
 *
 * Importing this file (transitively from `services/auth/index.ts`)
 * registers all three actions (login, logout, refresh) with the
 * global ApiController registry at module-load time.
 */
export * from './actions';
