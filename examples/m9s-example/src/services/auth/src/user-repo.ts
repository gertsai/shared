// SPDX-License-Identifier: Apache-2.0
/**
 * User Repo — service-internal port for `services/auth`.
 *
 * Wave 11.A (PRD-023, FR-001): replaces the pre-existing
 * `demoUserFromEmail(...)` "accept-any-credentials" helper with a real
 * user lookup whose credentials are bcrypt-verified by the login action.
 *
 * Hex layer (ADR-002): `IUserRepo` is service-internal — it is consumed
 * exclusively by the auth service and therefore lives under
 * `services/auth/src/` instead of `domain/ports/`. If a second service
 * ever needs to read demo users this port can be promoted then.
 *
 * The repo is intentionally read-only — no registration / user creation
 * surface is exposed here. The demo is seeded once at boot and never
 * mutated at runtime.
 *
 * Security:
 *   - we never store plaintext passwords — only the bcrypt hash;
 *   - bcrypt cost factor 10 is chosen as the common interactive-login
 *     baseline (~100 ms on modern hardware) — high enough to slow
 *     dictionary attacks, low enough to keep the demo snappy;
 *   - lookups return `null` for unknown emails. The login action MUST
 *     still run a dummy bcrypt compare on `null` to neutralise timing
 *     oracles (see anti-enumeration note in `login.action.ts`).
 */
import bcrypt from 'bcryptjs';

import type { DemoUser } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A persisted demo user — superset of `DemoUser` that carries the
 * bcrypt hash. The hash never leaves this module; the login action calls
 * `bcrypt.compare(plain, record.passwordHash)` directly.
 */
export interface DemoUserRecord extends DemoUser {
  /** bcrypt-hashed password (cost factor 10). */
  passwordHash: string;
}

/**
 * Read-only port for the auth service.
 *
 * Returns `null` for unknown emails. Callers MUST NOT branch on `null`
 * in a way that distinguishes "unknown email" from "wrong password" in
 * the response — that would leak which emails are registered.
 */
export interface IUserRepo {
  findByEmail(email: string): Promise<DemoUserRecord | null>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

/**
 * Demo-grade `IUserRepo` backed by an immutable in-memory list. Suitable
 * for the m9s-example reference application — NOT for production. A real
 * deployment would swap this for a Postgres-backed adapter against the
 * users table.
 */
export class InMemoryUserRepo implements IUserRepo {
  private readonly byEmail: ReadonlyMap<string, DemoUserRecord>;

  constructor(seed: ReadonlyArray<DemoUserRecord>) {
    const map = new Map<string, DemoUserRecord>();
    for (const rec of seed) {
      map.set(rec.email.toLowerCase(), rec);
    }
    this.byEmail = map;
  }

  async findByEmail(email: string): Promise<DemoUserRecord | null> {
    if (typeof email !== 'string' || email.length === 0) return null;
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** bcrypt cost factor — interactive-login baseline. */
const BCRYPT_COST = 10;

/**
 * Seed the two demo users (admin + plain user) with bcrypt-hashed
 * passwords. Passwords come from env vars so a deployer can rotate them
 * without touching code; fallbacks are the historical demo creds.
 *
 * Note: even the env-supplied passwords are HASHED on boot — the
 * plaintext only lives in this function's local variables and is never
 * stored on the record.
 */
export async function seedDemoUsers(): Promise<DemoUserRecord[]> {
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? 'admin123';
  const userPassword = process.env.DEMO_USER_PASSWORD ?? 'user123';

  const [adminHash, userHash] = await Promise.all([
    bcrypt.hash(adminPassword, BCRYPT_COST),
    bcrypt.hash(userPassword, BCRYPT_COST),
  ]);

  return [
    {
      id: 'user-admin',
      email: 'admin@m9s.example',
      tenantId: 'tenant-acme',
      passwordHash: adminHash,
    },
    {
      id: 'user-demo',
      email: 'user@m9s.example',
      tenantId: 'tenant-acme',
      passwordHash: userHash,
    },
  ];
}
