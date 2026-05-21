// SPDX-License-Identifier: Apache-2.0
/**
 * establishAuthSession (Stage 6) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-3 AC — ≥5 cases per SPEC-021 §Stage 6):
 *   1. auth='required' + user_uuid absent → throws APIError(NOT_AUTHORIZED) + logs error
 *   2. auth='required' + user_uuid + user_type → session created via sessionFactory
 *   3. auth='optional' + user_uuid + user_type → session created via sessionFactory
 *   4. auth='optional' + user_uuid absent → session stays undefined, no error
 *   5. auth='none' (or absent) → session stays undefined regardless of meta
 *   6. SPEC-021 I-6: unauthorized request never reaches sessionFactory (fail-fast)
 *   7. auth='required' + user_uuid present but user_type absent → session NOT created
 * Wave 32.E (EVID-083 HIGH-11):
 *   8. auth='required' + credentials present + sessionFactory undefined → throws plain Error
 *   9. auth='optional' + credentials present + sessionFactory undefined → throws plain Error
 */

import { describe, it, expect, vi } from 'vitest';
import { establishAuthSession } from '../establish-auth-session';
import { APIError } from '../../../../error';
import { ResponseCode } from '../../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../../types';
import type { OrchestraSession } from '@gertsai/core';
import type { UserType } from '@gertsai/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(): OrchestraSession {
  return { $destroy: vi.fn() } as unknown as OrchestraSession;
}

function makeDeps(overrides?: Partial<PipelineDeps>): PipelineDeps {
  const sessionFactory = vi.fn((_uuid: string, _type: UserType) => makeSession());
  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {
        auth: 'required',
      },
    } as unknown as PipelineDeps['action'],
    service: {} as PipelineDeps['service'],
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
    sessionFactory,
    ...overrides,
  };
}

function makeCtx(metaOverrides?: Partial<{ user_uuid: string; user_type: string }>): PipelineContext {
  return {
    ctx: {
      meta: {
        user_uuid: metaOverrides?.user_uuid,
        user_type: metaOverrides?.user_type,
      },
    } as unknown as PipelineContext['ctx'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('establishAuthSession (Stage 6)', () => {
  // Case 1: auth='required' + user_uuid absent → throws APIError(NOT_AUTHORIZED) + logs error
  it("auth='required' + no user_uuid in meta → throws APIError(NOT_AUTHORIZED) and logs error", async () => {
    const deps = makeDeps({
      action: {
        name: 'secure.action',
        rest: undefined,
        path: 'secure.action',
        options: { auth: 'required' },
      } as unknown as PipelineDeps['action'],
    });
    const ctx = makeCtx({ user_uuid: undefined, user_type: undefined });

    await expect(establishAuthSession(ctx, deps)).rejects.toThrow(APIError);

    let caught: APIError | undefined;
    try {
      await establishAuthSession(ctx, deps);
    } catch (err) {
      caught = err as APIError;
    }
    expect(caught?.code).toBe(ResponseCode.NOT_AUTHORIZED);
    expect(deps.logger?.error).toHaveBeenCalled();
  });

  // Case 2: auth='required' + user_uuid + user_type → session created
  it("auth='required' + user_uuid + user_type present → session created and stored in ctx", async () => {
    const deps = makeDeps({
      action: {
        name: 'secure.action',
        rest: undefined,
        path: 'secure.action',
        options: { auth: 'required' },
      } as unknown as PipelineDeps['action'],
    });
    const ctx = makeCtx({ user_uuid: 'user-1', user_type: 'admin' });

    const result = await establishAuthSession(ctx, deps);

    expect(deps.sessionFactory).toHaveBeenCalledWith('user-1', 'admin');
    expect(result.session).toBeDefined();
  });

  // Case 3: auth='optional' + user_uuid + user_type → session created
  it("auth='optional' + user_uuid + user_type present → session created", async () => {
    const deps = makeDeps({
      action: {
        name: 'optional.action',
        rest: undefined,
        path: 'optional.action',
        options: { auth: 'optional' },
      } as unknown as PipelineDeps['action'],
    });
    const ctx = makeCtx({ user_uuid: 'user-2', user_type: 'bot' });

    const result = await establishAuthSession(ctx, deps);

    expect(deps.sessionFactory).toHaveBeenCalledWith('user-2', 'bot');
    expect(result.session).toBeDefined();
  });

  // Case 4: auth='optional' + user_uuid absent → session stays undefined, no error
  it("auth='optional' + user_uuid absent → session is undefined, no error thrown", async () => {
    const deps = makeDeps({
      action: {
        name: 'optional.action',
        rest: undefined,
        path: 'optional.action',
        options: { auth: 'optional' },
      } as unknown as PipelineDeps['action'],
    });
    const ctx = makeCtx({ user_uuid: undefined, user_type: undefined });

    const result = await establishAuthSession(ctx, deps);

    expect(result.session).toBeUndefined();
    expect(deps.sessionFactory).not.toHaveBeenCalled();
  });

  // Case 5: auth='none' → session stays undefined regardless of meta
  it("auth='none' → session stays undefined even if user_uuid is present in meta", async () => {
    const deps = makeDeps({
      action: {
        name: 'public.action',
        rest: undefined,
        path: 'public.action',
        options: { auth: 'none' },
      } as unknown as PipelineDeps['action'],
    });
    const ctx = makeCtx({ user_uuid: 'user-3', user_type: 'admin' });

    const result = await establishAuthSession(ctx, deps);

    expect(result.session).toBeUndefined();
    expect(deps.sessionFactory).not.toHaveBeenCalled();
  });

  // Case 6: SPEC-021 I-6 — fail-fast: sessionFactory never called on unauthorized request
  it("auth='required' + no user_uuid → sessionFactory is never called (fail-fast per SPEC-021 I-6)", async () => {
    const deps = makeDeps({
      action: {
        name: 'secure.action',
        rest: undefined,
        path: 'secure.action',
        options: { auth: 'required' },
      } as unknown as PipelineDeps['action'],
    });
    const ctx = makeCtx({ user_uuid: undefined });

    await expect(establishAuthSession(ctx, deps)).rejects.toThrow(APIError);
    expect(deps.sessionFactory).not.toHaveBeenCalled();
  });

  // Case 7: auth='required' + user_uuid present but user_type absent → session NOT created
  it("auth='required' + user_uuid present but user_type absent → session not created, ctx returned unchanged", async () => {
    const deps = makeDeps({
      action: {
        name: 'secure.action',
        rest: undefined,
        path: 'secure.action',
        options: { auth: 'required' },
      } as unknown as PipelineDeps['action'],
    });
    // user_uuid present but user_type absent — passes the required check but not the factory check
    const ctx = makeCtx({ user_uuid: 'user-4', user_type: undefined });

    const result = await establishAuthSession(ctx, deps);

    expect(result.session).toBeUndefined();
    expect(deps.sessionFactory).not.toHaveBeenCalled();
  });

  // Case 8 — Wave 32.E (EVID-083 HIGH-11)
  // Phase C (Wave 32.C) made sessionFactory optional on PipelineDeps and added a
  // runtime guard inside the stage. When auth='required' AND both user_uuid + user_type
  // are present (i.e. the factory WOULD be called), a missing sessionFactory must
  // throw a descriptive plain Error — not silently skip session creation, which
  // would allow an authenticated request to proceed without a session.
  it("auth='required' + credentials present + sessionFactory undefined → throws plain Error (Wave 32.E / EVID-083 HIGH-11)", async () => {
    const deps = makeDeps({
      action: {
        name: 'secure.action',
        rest: undefined,
        path: 'secure.action',
        options: { auth: 'required' },
      } as unknown as PipelineDeps['action'],
      sessionFactory: undefined,
    });
    const ctx = makeCtx({ user_uuid: 'u1', user_type: 'web' });

    await expect(establishAuthSession(ctx, deps)).rejects.toThrow(
      /sessionFactory is required/i,
    );
  });

  // Case 9 — Wave 32.E (EVID-083 HIGH-11)
  // Same guard applies for auth='optional' when credentials ARE present.
  // The 'optional' flag controls whether ANONYMOUS requests are accepted,
  // not whether sessionFactory is required when a user presents credentials.
  it("auth='optional' + credentials present + sessionFactory undefined → throws plain Error (Wave 32.E / EVID-083 HIGH-11)", async () => {
    const deps = makeDeps({
      action: {
        name: 'optional.action',
        rest: undefined,
        path: 'optional.action',
        options: { auth: 'optional' },
      } as unknown as PipelineDeps['action'],
      sessionFactory: undefined,
    });
    const ctx = makeCtx({ user_uuid: 'u1', user_type: 'web' });

    await expect(establishAuthSession(ctx, deps)).rejects.toThrow(
      /sessionFactory is required/i,
    );
  });
});
