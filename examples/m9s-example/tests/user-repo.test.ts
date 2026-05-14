// SPDX-License-Identifier: Apache-2.0
/**
 * User-repo tests — Wave 11.A (PRD-023, FR-001).
 *
 * Covers:
 *   1. `seedDemoUsers()` returns the two expected demo records with
 *      bcrypt-hashed passwords (no plaintext).
 *   2. `findByEmail(known)` returns the seeded record.
 *   3. `findByEmail(unknown)` returns `null` — the login action must
 *      handle that without distinguishing it from a wrong password.
 *   4. `bcrypt.compare(correctPassword, hash)` succeeds.
 *   5. `bcrypt.compare(wrongPassword, hash)` fails.
 */
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';

import {
  InMemoryUserRepo,
  seedDemoUsers,
} from '../src/services/auth/src/user-repo';

describe('user-repo (Wave 11.A FR-001)', () => {
  it('seedDemoUsers returns two records with bcrypt-shaped hashes', async () => {
    const seeded = await seedDemoUsers();
    expect(seeded).toHaveLength(2);
    const emails = seeded.map((r) => r.email).sort();
    expect(emails).toEqual(['admin@m9s.example', 'user@m9s.example']);
    for (const rec of seeded) {
      // bcryptjs hashes start with $2a$ / $2b$ / $2y$ — the prefix is the
      // canonical "is this a bcrypt hash" smoke check.
      expect(rec.passwordHash).toMatch(/^\$2[aby]\$/);
      // Defensive: ensure plaintext NEVER leaked into the record.
      expect(rec.passwordHash).not.toContain('admin123');
      expect(rec.passwordHash).not.toContain('user123');
    }
  });

  it('findByEmail returns the seeded record for a known email', async () => {
    const seeded = await seedDemoUsers();
    const repo = new InMemoryUserRepo(seeded);
    const found = await repo.findByEmail('admin@m9s.example');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('user-admin');
    expect(found?.tenantId).toBe('tenant-acme');
  });

  it('findByEmail returns null for an unknown email (no enumeration leak)', async () => {
    const seeded = await seedDemoUsers();
    const repo = new InMemoryUserRepo(seeded);
    const found = await repo.findByEmail('ghost@nowhere.example');
    expect(found).toBeNull();
  });

  it('bcrypt.compare succeeds against the correct password', async () => {
    const seeded = await seedDemoUsers();
    const admin = seeded.find((r) => r.email === 'admin@m9s.example');
    expect(admin).toBeDefined();
    const ok = await bcrypt.compare('admin123', admin!.passwordHash);
    expect(ok).toBe(true);
  });

  it('bcrypt.compare fails against a wrong password', async () => {
    const seeded = await seedDemoUsers();
    const admin = seeded.find((r) => r.email === 'admin@m9s.example');
    expect(admin).toBeDefined();
    const ok = await bcrypt.compare('not-the-password', admin!.passwordHash);
    expect(ok).toBe(false);
  });
});
