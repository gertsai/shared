// SPDX-License-Identifier: Apache-2.0
/**
 * Auth service action exports.
 *
 * Side-effect imports register `controller.register(...)` calls at module
 * load. Mirrors the ingest/search barrel pattern.
 */
export * from './login.action';
export * from './logout.action';
export * from './refresh.action';
