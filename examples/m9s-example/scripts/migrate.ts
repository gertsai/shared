// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/migrate.ts — E1 raw SQL migration runner (Sprint 3.11 W-3-11-3).
 *
 * Per ADR-011 Decision E LOCKED + I-15:
 *   - `pg_advisory_xact_lock(<key>)` prevents concurrent runs (CWE-362).
 *   - CLI args restricted to `--up | --down | --status | --target-version=<int>`,
 *     validated via `typia.assert<MigrateCommand>` (m9s already has typia).
 *   - Migrations directory hard-coded `path.resolve(__dirname, '../migrations')`
 *     — NO `--file` / `--dir` overrides (CWE-22 path traversal).
 *
 * Idempotent per ADR-011 I-3 — `pg_migrations` tracks applied versions; a
 * second run is a no-op. Runner uses `pg.Pool` directly (not `PgClient`)
 * because (a) we need to execute multi-statement .sql files which the
 * tagged-template `$queryRaw` shape cannot express, and (b) we need
 * fine-grained transaction control around the advisory lock.
 *
 * Filename convention: `<3-digit-version>_<snake_case_name>.<up|down>.sql`,
 * e.g. `001_init_documents_chunks.up.sql`.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { Pool, type PoolClient } from 'pg';
import typia from 'typia';

interface MigrateUp { readonly mode: 'up'; }
interface MigrateDown { readonly mode: 'down'; }
interface MigrateStatus { readonly mode: 'status'; }
interface MigrateTarget { readonly mode: 'target'; readonly version: number; }

type MigrateCommand = MigrateUp | MigrateDown | MigrateStatus | MigrateTarget;

const ADVISORY_LOCK_KEY = 9_311_001;
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
const MIGRATION_FILE_RE = /^(\d{3})_([a-z0-9_]+)\.(up|down)\.sql$/;

interface DiscoveredMigration {
  readonly version: number;
  readonly name: string;
  readonly upPath: string;
  readonly downPath: string;
}

interface AppliedRow {
  readonly version: number;
  readonly name: string;
  readonly applied_at: Date;
}

async function main(): Promise<void> {
  const command = parseArgv(process.argv.slice(2));
  const url = process.env.POSTGRES_URL;
  if (!url || url.trim().length === 0) {
    throw new Error('POSTGRES_URL is required to run migrations.');
  }

  const dbPool = new Pool({ connectionString: url });
  try {
    await ensureMigrationsTable(dbPool);
    const discovered = await discoverMigrations();

    switch (command.mode) {
      case 'status':
        await statusReport(dbPool, discovered);
        return;
      case 'up':
        await runWithLock(dbPool, async (client) => {
          await applyUp(client, discovered, Infinity);
        });
        return;
      case 'down':
        await runWithLock(dbPool, async (client) => {
          await applyDown(client, discovered, 1);
        });
        return;
      case 'target':
        await runWithLock(dbPool, async (client) => {
          await applyToTarget(client, discovered, command.version);
        });
        return;
    }
  } finally {
    await dbPool.end();
  }
}

function parseArgv(argv: ReadonlyArray<string>): MigrateCommand {
  const targetArg = argv.find((a) => a.startsWith('--target-version='));
  let raw: unknown;
  if (argv.includes('--up')) {
    raw = { mode: 'up' };
  } else if (argv.includes('--down')) {
    raw = { mode: 'down' };
  } else if (argv.includes('--status')) {
    raw = { mode: 'status' };
  } else if (targetArg) {
    const versionStr = targetArg.slice('--target-version='.length);
    const version = Number.parseInt(versionStr, 10);
    raw = { mode: 'target', version };
  } else {
    throw new Error(
      'Usage: migrate --up | --down | --status | --target-version=<int>',
    );
  }
  return typia.assert<MigrateCommand>(raw);
}

async function ensureMigrationsTable(dbPool: Pool): Promise<void> {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS pg_migrations (
      version    int         PRIMARY KEY,
      name       text        NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function discoverMigrations(): Promise<DiscoveredMigration[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const map = new Map<number, { name: string; up?: string; down?: string }>();

  for (const entry of entries) {
    const match = MIGRATION_FILE_RE.exec(entry);
    if (!match) continue;
    const version = Number.parseInt(match[1], 10);
    const name = match[2];
    const direction = match[3] as 'up' | 'down';
    const slot = map.get(version) ?? { name };
    if (slot.name !== name) {
      throw new Error(
        `Migration version ${version} has inconsistent names: '${slot.name}' vs '${name}'.`,
      );
    }
    if (direction === 'up') slot.up = path.join(MIGRATIONS_DIR, entry);
    else slot.down = path.join(MIGRATIONS_DIR, entry);
    map.set(version, slot);
  }

  const out: DiscoveredMigration[] = [];
  for (const [version, slot] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    if (!slot.up || !slot.down) {
      throw new Error(
        `Migration version ${version} ('${slot.name}') is missing its up or down file.`,
      );
    }
    out.push({ version, name: slot.name, upPath: slot.up, downPath: slot.down });
  }
  return out;
}

async function listApplied(client: PoolClient | Pool): Promise<AppliedRow[]> {
  const res = await client.query<AppliedRow>(
    'SELECT version, name, applied_at FROM pg_migrations ORDER BY version ASC',
  );
  return res.rows;
}

async function statusReport(
  dbPool: Pool,
  discovered: ReadonlyArray<DiscoveredMigration>,
): Promise<void> {
  const applied = await listApplied(dbPool);
  const appliedSet = new Set(applied.map((r) => r.version));
  const lines: string[] = ['version  status   name'];
  for (const m of discovered) {
    const status = appliedSet.has(m.version) ? 'applied' : 'pending';
    lines.push(`${String(m.version).padStart(7, ' ')}  ${status.padEnd(7, ' ')}  ${m.name}`);
  }
  for (const row of applied) {
    if (!discovered.some((m) => m.version === row.version)) {
      lines.push(`${String(row.version).padStart(7, ' ')}  orphan   ${row.name}`);
    }
  }
  console.log(lines.join('\n'));
}

async function runWithLock(
  dbPool: Pool,
  fn: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);
    await fn(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function applyUp(
  client: PoolClient,
  discovered: ReadonlyArray<DiscoveredMigration>,
  limit: number,
): Promise<void> {
  const applied = await listApplied(client);
  const appliedSet = new Set(applied.map((r) => r.version));
  let count = 0;
  for (const m of discovered) {
    if (appliedSet.has(m.version)) continue;
    if (count >= limit) break;
    const sql = await readFile(m.upPath, 'utf8');
    console.log(`[migrate] applying ${m.version} ${m.name} (up)...`);
    await client.query(sql);
    await client.query(
      'INSERT INTO pg_migrations (version, name) VALUES ($1, $2)',
      [m.version, m.name],
    );
    count += 1;
  }
  if (count === 0) {
    console.log('[migrate] up: nothing to apply.');
  } else {
    console.log(`[migrate] up: applied ${count} migration(s).`);
  }
}

async function applyDown(
  client: PoolClient,
  discovered: ReadonlyArray<DiscoveredMigration>,
  limit: number,
): Promise<void> {
  const applied = await listApplied(client);
  if (applied.length === 0) {
    console.log('[migrate] down: nothing to roll back.');
    return;
  }
  const reversed = [...applied].reverse();
  const byVersion = new Map(discovered.map((m) => [m.version, m]));
  let count = 0;
  for (const row of reversed) {
    if (count >= limit) break;
    const m = byVersion.get(row.version);
    if (!m) {
      throw new Error(
        `Cannot roll back migration ${row.version} '${row.name}': no down file present.`,
      );
    }
    const sql = await readFile(m.downPath, 'utf8');
    console.log(`[migrate] rolling back ${m.version} ${m.name} (down)...`);
    await client.query(sql);
    await client.query('DELETE FROM pg_migrations WHERE version = $1', [m.version]);
    count += 1;
  }
  console.log(`[migrate] down: rolled back ${count} migration(s).`);
}

async function applyToTarget(
  client: PoolClient,
  discovered: ReadonlyArray<DiscoveredMigration>,
  targetVersion: number,
): Promise<void> {
  const applied = await listApplied(client);
  const currentTop = applied.length === 0 ? 0 : applied[applied.length - 1].version;

  if (targetVersion === currentTop) {
    console.log(`[migrate] target=${targetVersion}: already at this version.`);
    return;
  }
  if (targetVersion > currentTop) {
    const remaining = discovered.filter(
      (m) => m.version > currentTop && m.version <= targetVersion,
    );
    await applyUp(client, remaining, Infinity);
    return;
  }
  const stepsBack = applied.filter((r) => r.version > targetVersion).length;
  await applyDown(client, discovered, stepsBack);
}

main().catch((err) => {
  console.error('[migrate] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
