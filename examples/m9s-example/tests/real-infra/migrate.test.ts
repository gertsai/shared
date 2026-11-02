// SPDX-License-Identifier: Apache-2.0
/**
 * Real-infra migration runner tests. Enabled by VITEST_REAL_INFRA=1 or
 * PGVECTOR_E2E=1; enabled runs require POSTGRES_URL and create a unique
 * disposable database per test case on that PostgreSQL server.
 */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const ENABLED =
  process.env['VITEST_REAL_INFRA'] === '1' ||
  process.env['PGVECTOR_E2E'] === '1';
const POSTGRES_URL = process.env.POSTGRES_URL;
const EXAMPLE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

if (ENABLED && !POSTGRES_URL) {
  throw new Error('POSTGRES_URL is required when real-infra verification is enabled.');
}

const describeOrSkip = ENABLED ? describe : describe.skip;
const adminPools: Pool[] = [];

afterAll(async () => {
  await Promise.all(adminPools.map((pool) => pool.end()));
});

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface ChildEnvOptions {
  readonly databaseUrl?: string;
  readonly omitPostgresUrl?: boolean;
}

async function runChild(
  args: ReadonlyArray<string>,
  fixturePath: string,
  options: ChildEnvOptions,
): Promise<RunResult> {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('DOTENV_') && value !== undefined) env[key] = value;
  }
  env['DOTENV_CONFIG_PATH'] = fixturePath;
  env['DOTENV_CONFIG_ENCODING'] = 'utf8';
  if (options.omitPostgresUrl) {
    delete env['POSTGRES_URL'];
  } else if (options.databaseUrl !== undefined) {
    env['POSTGRES_URL'] = options.databaseUrl;
  }

  return await new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: EXAMPLE_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

interface DatabaseContext {
  readonly databaseUrl: string;
  readonly fixturePath: string;
  readonly envFixturePath: string;
  readonly openPool: () => Pool;
  readonly run: (args: ReadonlyArray<string>, options?: {
    readonly dotenvOnly?: boolean;
    readonly omitPostgresUrl?: boolean;
  }) => Promise<RunResult>;
}

async function withDatabase(
  runCase: (context: DatabaseContext) => Promise<void>,
): Promise<void> {
  const baseUrl = new URL(POSTGRES_URL!);
  const databaseName = `wave37_migrate_${randomUUID().split('-').join('')}`;
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const adminPool = new Pool({ connectionString: POSTGRES_URL });
  adminPools.push(adminPool);
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'wave37-migrate-'));
  const fixturePath = path.join(fixtureDir, 'empty.env');
  const envFixturePath = path.join(fixtureDir, 'database.env');
  const databasePools: Pool[] = [];
  let created = false;

  try {
    await writeFile(fixturePath, '', 'utf8');
    await writeFile(
      envFixturePath,
      `POSTGRES_URL=${JSON.stringify(databaseUrl.toString())}\n`,
      'utf8',
    );
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    created = true;

    const context: DatabaseContext = {
      databaseUrl: databaseUrl.toString(),
      fixturePath,
      envFixturePath,
      openPool: () => {
        const pool = new Pool({ connectionString: databaseUrl.toString() });
        databasePools.push(pool);
        return pool;
      },
      run: (args, options = {}) => runChild(args, options.dotenvOnly ? envFixturePath : fixturePath, {
        databaseUrl: options.dotenvOnly ? undefined : databaseUrl.toString(),
        omitPostgresUrl: options.omitPostgresUrl || options.dotenvOnly,
      }),
    };

    await runCase(context);
  } finally {
    await Promise.all(databasePools.map((pool) => pool.end()));
    if (created) {
      await adminPool.query(`DROP DATABASE "${databaseName}"`);
    }
    await adminPool.end();
    const index = adminPools.indexOf(adminPool);
    if (index !== -1) adminPools.splice(index, 1);
    await rm(fixtureDir, { recursive: true, force: true });
  }
}

async function tableNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

async function appliedVersions(pool: Pool): Promise<number[]> {
  const result = await pool.query<{ version: number }>(
    'SELECT version FROM pg_migrations ORDER BY version',
  );
  return result.rows.map((row) => row.version);
}

function successful(result: RunResult): void {
  expect(result.code).toBe(0);
}

function failed(result: RunResult): void {
  expect(result.code).not.toBe(0);
}

const up = ['run', 'migrate:up'] as const;
const down = ['run', 'migrate:down'] as const;
const status = ['run', 'migrate:status'] as const;
const target = (value: string) => [
  'exec', 'ts-node', 'scripts/migrate.ts', `--target-version=${value}`,
];

describeOrSkip('real-infra :: migration runner', () => {
  it('applies all migrations, records versions, and preserves applied_at on repeat', async () => {
    await withDatabase(async ({ openPool, run }) => {
      successful(await run(up));
      const pool = openPool();
      const initial = await pool.query<{ version: number; applied_at: Date }>(
        'SELECT version, applied_at FROM pg_migrations ORDER BY version',
      );
      expect(initial.rows.map((row) => row.version)).toEqual([1, 2]);
      const column = await pool.query<{ formatted_type: string }>(
        `SELECT format_type(atttypid, atttypmod) AS formatted_type
           FROM pg_attribute
          WHERE attrelid = 'chunks'::regclass AND attname = 'vector'`,
      );
      expect(column.rows[0]?.formatted_type).toBe('vector(768)');

      await pool.query(
        `INSERT INTO documents (id, tenant_id, owner_uuid, text)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), 'tenant-wave37', 'owner-wave37', 'repeat migration row'],
      );
      successful(await run(up));
      successful(await run(status));
      const repeated = await pool.query<{ version: number; applied_at: Date }>(
        'SELECT version, applied_at FROM pg_migrations ORDER BY version',
      );
      expect(repeated.rows.map((row) => row.version)).toEqual([1, 2]);
      expect(repeated.rows.map((row) => row.applied_at.getTime())).toEqual(
        initial.rows.map((row) => row.applied_at.getTime()),
      );
      const documents = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM documents WHERE text = $1`,
        ['repeat migration row'],
      );
      expect(documents.rows[0]?.count).toBe('1');
    });
  });

  it('targets version 1 then restores version 2', async () => {
    await withDatabase(async ({ openPool, run }) => {
      successful(await run(target('1')));
      const pool = openPool();
      expect(await appliedVersions(pool)).toEqual([1]);
      const beforeVersionTwo = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'documents'
            AND column_name = 'deleted_at'`,
      );
      expect(beforeVersionTwo.rows[0]?.count).toBe('0');

      successful(await run(target('2')));
      expect(await appliedVersions(pool)).toEqual([1, 2]);
      const afterVersionTwo = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'documents'
            AND column_name = 'deleted_at'`,
      );
      expect(afterVersionTwo.rows[0]?.count).toBe('1');
    });
  });

  it('rolls down twice and leaves a subsequent down as a no-op', async () => {
    await withDatabase(async ({ openPool, run }) => {
      successful(await run(up));
      const pool = openPool();
      successful(await run(down));
      expect(await appliedVersions(pool)).toEqual([1]);
      expect(await tableNames(pool)).toContain('documents');
      expect(await tableNames(pool)).toContain('chunks');
      const deletedAtAfterFirstDown = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'documents'
            AND column_name = 'deleted_at'`,
      );
      expect(deletedAtAfterFirstDown.rows[0]?.count).toBe('0');

      successful(await run(down));
      expect(await appliedVersions(pool)).toEqual([]);
      expect(await tableNames(pool)).not.toContain('chunks');
      expect(await tableNames(pool)).not.toContain('documents');
      successful(await run(down));
      expect(await appliedVersions(pool)).toEqual([]);
      expect(await tableNames(pool)).not.toContain('documents');
    });
  });

  it('rejects missing URL and unknown mode without changing the database', async () => {
    await withDatabase(async ({ openPool, run }) => {
      failed(await run(up, { omitPostgresUrl: true }));
      const pool = openPool();
      expect(await tableNames(pool)).toEqual([]);

      failed(await run(['exec', 'ts-node', 'scripts/migrate.ts', '--unknown-mode']));
      expect(await tableNames(pool)).toEqual([]);
    });
  });

  it('loads POSTGRES_URL only from its test-owned dotenv fixture', async () => {
    await withDatabase(async ({ openPool, run }) => {
      successful(await run(up, { dotenvOnly: true }));
      expect(await appliedVersions(openPool())).toEqual([1, 2]);
    });
  });

  it.each(['abc', '', '1junk', '1.5', '-1', '3'])(
    'rejects target version %j without changing applied migrations or documents',
    async (invalidTarget) => {
      await withDatabase(async ({ openPool, run }) => {
        successful(await run(up));
        const pool = openPool();
        await pool.query(
          `INSERT INTO documents (id, tenant_id, owner_uuid, text)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), 'tenant-wave37', 'owner-wave37', 'preserve on invalid target'],
        );
        const initial = await pool.query<{
          version: number;
          name: string;
          applied_at: Date;
        }>('SELECT version, name, applied_at FROM pg_migrations ORDER BY version');

        failed(await run(target(invalidTarget)));
        const unchanged = await pool.query<{
          version: number;
          name: string;
          applied_at: Date;
        }>('SELECT version, name, applied_at FROM pg_migrations ORDER BY version');
        expect(unchanged.rows).toEqual(initial.rows);
        const documents = await pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM documents
            WHERE text = $1`,
          ['preserve on invalid target'],
        );
        expect(documents.rows[0]?.count).toBe('1');
      });
    },
  );
});
