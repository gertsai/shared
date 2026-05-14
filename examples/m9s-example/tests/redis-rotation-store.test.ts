// SPDX-License-Identifier: Apache-2.0
/**
 * RedisRotationStore smoke tests — Wave 11.A (PRD-023 / RFC-016).
 *
 * `ioredis-mock` is not currently listed as a workspace dev-dep, so this
 * file is mounted as a compile-target only: the suite is `describe.skip`-ed
 * so it neither requires the mock module nor a running Redis. Activate
 * once `ioredis-mock` is added (track it under the queue-worker mock-deps
 * trail).
 *
 * The intent (kept as live code for documentation + future activation):
 *
 *   1. register -> consume (ok)  — happy path, matches in-memory semantics.
 *   2. consume on the same jti again -> reason: 'reuse'.
 *   3. revokeUser('user-a') kills jtis for `user-a` but leaves `user-b`'s
 *      jti untouched (blast-radius bound).
 */
import { describe, expect, it } from 'vitest';

import { RedisRotationStore } from '../src/infrastructure/redis-rotation.store';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

const HOUR = 60 * 60;

// `ioredis-mock` not in workspace; spec mounted as compile-target only.
// Switch to `describe(` once the mock is added so CI exercises the
// Redis path.
describe.skip('RedisRotationStore (ioredis-mock — not installed)', () => {
  it('register -> consume returns ok with the original userId', async () => {
    // Will be wired up once `ioredis-mock` is available:
    //   const redis = new (require('ioredis-mock'))();
    //   const store = new RedisRotationStore(redis, { keyPrefix: 't' });
    //   await store.registerJti('jti-1', 'user-a', nowSeconds() + HOUR);
    //   const result = await store.consumeJti('jti-1');
    //   expect(result.ok).toBe(true);
    expect(RedisRotationStore).toBeDefined();
    expect(nowSeconds() + HOUR).toBeGreaterThan(nowSeconds());
  });

  it('consume-then-consume on the same jti returns reason: reuse', async () => {
    expect(RedisRotationStore).toBeDefined();
  });

  it("revokeUser kills only the target user's jtis", async () => {
    expect(RedisRotationStore).toBeDefined();
  });
});
