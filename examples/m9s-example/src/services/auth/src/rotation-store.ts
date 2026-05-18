// SPDX-License-Identifier: Apache-2.0
// Wave 12.E-fix-2 (PRD-039 FR-001 / EVID-053 CRIT-1 / CWE-613): rotation
// store now DI'd; in-memory and Redis modes both wired through composition.
/**
 * Refresh-token rotation + reuse-detection — INTENTIONALLY EMPTY.
 *
 * Wave 12.E-fix-2 (PRD-039 FR-001 / EVID-053 CRIT-1 / CWE-613) closed the
 * gap where this file hosted a module-level `Map<jti, JtiRecord>` facade
 * that was static-imported by `login.action.ts` and `refresh.action.ts`
 * — bypassing the composition root's `IRotationStore` selection. Because
 * the actions never reached the DI'd `infrastructure.rotationStore`, the
 * env-driven `RedisRotationStore` (selected when `REDIS_URL` is set) was
 * wired but never consumed:
 *
 *   - multi-instance prod deploys failed reuse-detection across nodes;
 *   - process restarts wiped the in-memory map and treated previously
 *     issued refresh tokens as `unknown` (silent re-login storm);
 *   - the Redis impl had zero call sites despite RFC-016 promising it.
 *
 * Fix: both auth actions now reach `service.rotationStore` (wired by
 * `services/auth/lifecycle.ts` from `composition/infrastructure.ts`), and
 * the legacy module-level functions + Map have been removed. The
 * `InMemoryRotationStore` class (in
 * `src/infrastructure/in-memory-rotation.store.ts`) remains the canonical
 * in-memory impl; the periodic pruner is started exactly once in
 * `buildInfrastructure()`.
 *
 * This file is kept (rather than deleted outright) so legacy `dist/`
 * artifacts and external grep references resolve to a single source of
 * truth that explains the migration.
 *
 * @deprecated Use `service.rotationStore` (typed as `IRotationStore` from
 *   `src/domain/ports/IRotationStore.ts`) inside action handlers. The
 *   composition root in `src/composition/infrastructure.ts` selects the
 *   concrete impl based on `REDIS_URL`. For tests, instantiate
 *   `InMemoryRotationStore` directly.
 */
export {};
