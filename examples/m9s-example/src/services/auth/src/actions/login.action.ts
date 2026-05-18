// SPDX-License-Identifier: Apache-2.0
// Wave 12.E-fix-2 (PRD-039 FR-001 / EVID-053 CRIT-1 / CWE-613): rotation
// store now DI'd; in-memory and Redis modes both wired through composition.
/**
 * Login Action — `v1.auth.login` — Wave 11.A real-auth replacement.
 *
 * Wave 11.A (PRD-023, FR-001) — the historical
 * "accept-any-credentials" demo path (gated by `M9S_DEMO_AUTH=true`) is
 * GONE. Login now:
 *
 *   1. resolves a `DemoUserRecord` via `IUserRepo.findByEmail(email)`;
 *   2. verifies the supplied password with `bcrypt.compare` against the
 *      stored hash (cost factor 10);
 *   3. returns the same generic 401 message on BOTH "unknown email" and
 *      "wrong password" — anti-enumeration (CWE-204);
 *   4. always runs a bcrypt compare even when the email is unknown
 *      (against a fixed dummy hash) so response timing does not leak
 *      whether the email is registered (CWE-208).
 *
 * Refresh-token rotation (PRD-022 / Wave 10.E) is unchanged. Wave 12.E-fix-2
 * (EVID-053 CRIT-1) routes the freshly-issued jti registration through the
 * DI'd `service.rotationStore` instead of a module-level Map facade so
 * multi-instance prod deploys share state across nodes via Redis when
 * `REDIS_URL` is set.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import bcrypt from 'bcryptjs';
import typia from 'typia';

import { defineAction } from '@gertsai/api-core/moleculer';
import { resolveExampleController } from '../../../../lib/example-controller';
import { signAccessToken, signRefreshToken } from '../jwt';
import {
  InMemoryUserRepo,
  seedDemoUsers,
  type IUserRepo,
} from '../user-repo';
import type {
  AuthServiceContext,
  LoginRequest,
  LoginResponse,
} from '../../types';

const REFRESH_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// User repo — module-level singleton
// ---------------------------------------------------------------------------
//
// TODO(team-lead): inject via composition root in Wave 11.B. For Wave 11.A
// the action lazily seeds an `InMemoryUserRepo` on the first request so
// boot stays synchronous and the integration tests do not need to wire a
// container. Once the composition root grows a real auth service this
// singleton should be replaced by `ctx.service.userRepo`.

let cachedRepo: IUserRepo | null = null;
let repoPromise: Promise<IUserRepo> | null = null;

async function getUserRepo(): Promise<IUserRepo> {
  if (cachedRepo !== null) return cachedRepo;
  if (repoPromise === null) {
    repoPromise = seedDemoUsers().then((seed) => {
      cachedRepo = new InMemoryUserRepo(seed);
      return cachedRepo;
    });
  }
  return repoPromise;
}

// ---------------------------------------------------------------------------
// Anti-enumeration dummy hash
// ---------------------------------------------------------------------------
//
// When `findByEmail` returns `null` we still run a bcrypt.compare against
// this fixed hash so the response time does not depend on whether the
// email exists. The hash is for the literal string "never-matches-this"
// — bcrypt compare will always return false. The cost factor matches the
// seed hashes (10) so timing is comparable.

const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8b6f7T8c0jL9F1d.lQNJq3D7nO7m1u';

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth');

export const login = defineAction(controller.register('login', {
  auth: 'none',

  rest: 'POST /auth/login',

  params: typia.createValidate<LoginRequest>(),
  response: typia.createValidate<LoginResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Login successful',

  async handler({ params, service, logger, respond }) {
    const { email, password } = params;

    if (!email || !password) {
      throw new APIError(
        ResponseCode.BAD_REQUEST__INVALID_PARAMS,
        undefined,
        'email and password are required',
      );
    }

    const repo = await getUserRepo();
    const record = await repo.findByEmail(email);

    // Constant-time anti-enumeration: ALWAYS run a bcrypt compare so the
    // response time is independent of whether the email is registered.
    // When the email is unknown we compare against a fixed dummy hash;
    // the boolean is then discarded. When the email is known but the
    // password is wrong, bcrypt.compare returns false naturally.
    let passwordMatches: boolean;
    if (record) {
      passwordMatches = await bcrypt.compare(password, record.passwordHash);
    } else {
      // Discard the result — we already know auth will fail. The await is
      // there purely to spend the bcrypt CPU budget so timing matches.
      await bcrypt.compare(password, DUMMY_HASH);
      passwordMatches = false;
    }

    if (!record || !passwordMatches) {
      throw new APIError(
        ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS,
        undefined,
        'Invalid email or password',
      );
    }

    const user = { id: record.id, email: record.email, tenantId: record.tenantId };
    const { token, expiresAt } = signAccessToken(user);
    // Wave 10.E (PRD-022): refresh token carries a jti registered in the
    // rotation store so the refresh action can detect reuse.
    //
    // Wave 12.E-fix-2 (EVID-053 CRIT-1 / CWE-613): the store is now
    // DI'd via `service.rotationStore` so the env-driven
    // InMemory/Redis selection in `composition/infrastructure.ts`
    // is actually honoured.
    const { token: refreshToken, jti } = signRefreshToken(user);
    await service.rotationStore.registerJti(
      jti,
      user.id,
      Math.floor(Date.now() / 1_000) + REFRESH_TTL_SECONDS,
    );

    // EVID-036 audit fix (P2 / W-Security-7, CWE-532): log userId + tenantId
    // only — email is PII and the user record is recoverable from the userId
    // in any audit trail.
    logger.info('[v1.auth.login] issued token', {
      userId: user.id,
      tenantId: user.tenantId,
    });

    const response: LoginResponse = { token, refreshToken, user, expiresAt };
    return respond(response, 'Login successful');
  },
}));
