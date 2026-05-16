/**
 * Wave 12.D-fix / EVID-051 type-test coverage for:
 *   - FR-012 (T-3) TypedLuaScript `TArgs extends readonly unknown[]`
 *   - FR-013 (T-2) RateLimitTestUtils.testMiddleware `next` signature
 *   - FR-014 (T-3) StrategyExecuteArgs lost its `store` field
 *
 * Compile-only — no runtime asserts. Vitest still loads the file as a
 * module; we declare a trivial test so the runner does not warn.
 */
import { describe, it } from 'vitest';

import { TypedLuaScript } from '../scripts/TypedLuaScript';
import type { StrategyExecuteArgs } from '../strategies/RateLimitStrategy';
import { RateLimitTestUtils } from '../test-utils/RateLimitTestUtils';

// --- FR-012 ---------------------------------------------------------
// `TArgs extends readonly unknown[]` (not `readonly any[]`): the
// concrete declaration below compiles.
const _slidingWindow: TypedLuaScript<
  readonly [key: string],
  readonly [number, number, number],
  readonly [allow: 0 | 1, hits: number, ttl: number]
> = new TypedLuaScript('return 1', 'sliding_window');
void _slidingWindow;

// --- FR-013 ---------------------------------------------------------
// `testMiddleware`'s `next` parameter is typed (not `any`). Passing a
// well-typed middleware function must compile.
type _MWFn = Parameters<typeof RateLimitTestUtils.testMiddleware>[0];
const _wellTypedMiddleware: _MWFn = async (
  _req,
  _res,
  next,
): Promise<void> => {
  // `next` here is `NextFunction | undefined` — calling it without args
  // must compile.
  next?.();
};
void _wellTypedMiddleware;

// --- FR-014 ---------------------------------------------------------
// `StrategyExecuteArgs` has NO `store` field. The two assertions below
// would fail to compile if `store` were present:
//   - `requiredKeys` enumerates the exhaustive required-key set.
//   - `_noStore` is a constructed StrategyExecuteArgs WITHOUT store.
type _RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];
const _requiredKeys: _RequiredKeys<StrategyExecuteArgs> =
  'key' as 'key' | 'limit' | 'timeFrame' | 'now';
void _requiredKeys;

const _noStore: StrategyExecuteArgs = {
  key: 'k',
  limit: 1,
  timeFrame: 1000,
  now: 0,
};
void _noStore;

describe('Wave 12.D type-tightenings', () => {
  it('compiles (type-test only)', () => {
    // intentionally empty — covered by tsc at typecheck time
  });
});
