// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// ===========================================================================
// 1. PORT — src/domain/ports/IThingStore.ts
//    Outbound port. Async surface. Domain/application import ONLY this type.
// ===========================================================================
import type { Thing } from '../thing';

export interface IThingStore {
  // TODO: keep methods narrow (ISP) — split read/write/delete into separate
  // interfaces if different callers need different subsets.
  save(thing: Thing): Promise<void>;
  findById(id: string): Promise<Thing | null>;
}

// ===========================================================================
// 2a. ADAPTER STRATEGY A — abstract IStorageProvider stack (jsonb-blob shape,
//     free audit stamping). src/infrastructure/thing.repository.ts
// ===========================================================================
import {
  BaseEntityStorageService,
  type IStorageProvider,
} from '@gertsai/entity-storage';
import type { Session } from '@gertsai/session';
import { timestampToMillis, type MutationMarks, type EntityBasicStatus } from '@gertsai/entity-audit';
import type { StorageCapabilities, StorageMetadata } from '@gertsai/storage-core';

interface ThingWriteShape { readonly name: string }
interface ThingReadShape extends ThingWriteShape, MutationMarks {
  readonly _uid: string;
  readonly status: EntityBasicStatus;
}
// Indexed fields are the only ones a future query DSL can filter on.
type ThingMeta = StorageMetadata<ThingReadShape, ThingWriteShape, '_uid' | 'status'>;
export type { ThingMeta };

export class ThingRepository
  extends BaseEntityStorageService<ThingMeta>
  implements IThingStore
{
  private readonly _capabilities: StorageCapabilities;
  constructor(provider: IStorageProvider<ThingMeta>, session: Session) {
    super({ provider, session, path: 'things' });
    // Freeze the capability object once (avoid per-read allocation).
    this._capabilities = Object.freeze({
      ...super.capabilities,
      upsert: Object.freeze({ supported: true, preservesCreatorAudit: true }),
    });
  }
  override get capabilities(): StorageCapabilities { return this._capabilities; }

  async save(thing: Thing): Promise<void> {
    const existing = await this.get(thing.id);
    if (existing) { await this.update(thing.id, { name: thing.name }); return; }
    await this.set({ _uid: thing.id, name: thing.name }); // stamps created_* audit
  }
  async findById(id: string): Promise<Thing | null> {
    const stored = await this.get(id);
    if (!stored) return null;
    return { id: stored._uid, name: stored.name }; // strip audit envelope
  }
}

// ===========================================================================
// 2b. ADAPTER STRATEGY B — direct PgClient raw SQL (normalised schema with
//     tenant_id/owner columns). src/infrastructure/pg-thing.repository.ts
// ===========================================================================
import type { PgClient } from '@gertsai/pg-client';
import { defineQueryConstraints } from '@gertsai/query-dsl';
import { compileToSql } from '@gertsai/query-dsl/sql';
import type { StorageMetadata as SM } from '@gertsai/storage-core';
import type { TenantId } from '@gertsai/tenant';

type ThingQueryMeta = SM<unknown, unknown, 'id' | 'tenant_id'>;
const q = defineQueryConstraints<ThingQueryMeta>();

export interface PgThingRepositoryOptions {
  readonly client: PgClient;          // typically PgClientAdapter in prod, mockPgClient in tests
  readonly tenantId: TenantId;        // branded — every SQL is filtered by this (security invariant)
  readonly ownerUuid: string;
}

export class PgThingRepository implements IThingStore {
  private readonly client: PgClient;
  private readonly tenantId: TenantId;
  private readonly ownerUuid: string;
  constructor(opts: PgThingRepositoryOptions) {
    this.client = opts.client;
    this.tenantId = opts.tenantId;
    this.ownerUuid = opts.ownerUuid;
  }
  async save(thing: Thing): Promise<void> {
    // SELECT-by-id via query-dsl (compileToSql v0.1 emits only `SELECT * FROM <t>`).
    const compiled = compileToSql(
      [q.where('id', '==', thing.id), q.where('tenant_id', '==', this.tenantId), q.limit(1)] as const,
      'things',
    );
    const existing = await rawQuery<{ id: string }>(this.client, compiled.sql, compiled.params);
    if (existing.length > 0) {
      // INSERT/UPDATE not modelled by compileToSql — raw SQL escape hatch. KEEP tenant_id filter.
      await this.client.$executeRaw`UPDATE things SET name = ${thing.name} WHERE id = ${thing.id} AND tenant_id = ${this.tenantId}`;
      return;
    }
    await this.client.$executeRaw`INSERT INTO things (id, tenant_id, owner_uuid, name) VALUES (${thing.id}, ${this.tenantId}, ${this.ownerUuid}, ${thing.name})`;
    // TODO: side-effects (e.g. lazy-import @gertsai/auth-openfga writeTuples) go here, fail-closed + swallowed.
  }
  async findById(id: string): Promise<Thing | null> {
    const rows = await this.client.$queryRaw<{ id: string; name: string }>`
      SELECT id, name FROM things WHERE id = ${id} AND tenant_id = ${this.tenantId} LIMIT 1`;
    if (rows.length === 0) return null;
    return { id: rows[0]!.id, name: rows[0]!.name };
  }
}
// Bridge compileToSql's positional (sql, params) to PgClient's tagged-template shape.
// Mirrors @gertsai/pg-client/src/storage-provider.ts — fragment carries NO user input.
function rawQuery<T = unknown>(client: PgClient, sql: string, params: ReadonlyArray<unknown>): Promise<T[]> {
  const parts = sql.split(/\$\d+/g);
  const template = Object.assign(parts, { raw: parts }) as unknown as TemplateStringsArray;
  return client.$queryRaw<T>(template, ...params);
}

// ===========================================================================
// 3. DRIVER ADAPTER — src/infrastructure/pg-client.adapter.ts
//    Thin pg.Pool wrapper conforming to PgClient. Factory keeps `pg` out of tests.
// ===========================================================================
import { Pool, type PoolConfig } from 'pg';
export interface PgClientAdapterOptions {
  readonly connectionString: string;
  readonly poolOpts?: Omit<PoolConfig, 'connectionString'>;
}
function rebuildSql(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce<string>((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '');
}
export class PgClientAdapter implements PgClient {
  readonly pool: Pool;
  constructor(opts: PgClientAdapterOptions) {
    this.pool = new Pool({ connectionString: opts.connectionString, ...opts.poolOpts });
  }
  async $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
    return (await this.pool.query(rebuildSql(strings, values), values)).rows as T[];
  }
  async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    return (await this.pool.query(rebuildSql(strings, values), values)).rowCount ?? 0;
  }
  async $disconnect(): Promise<void> { await this.pool.end(); }
}
export function createPgClient(opts: PgClientAdapterOptions): PgClient { return new PgClientAdapter(opts); }

// ===========================================================================
// 4. COMPOSITION ROOT — src/composition/infrastructure.ts
//    The ONLY place concrete adapters are constructed. Env-driven swap.
// ===========================================================================
import config from '../../project.config';
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { Session } from '@gertsai/session';
import { asTenantId } from '@gertsai/tenant';

export interface SharedInfrastructure { readonly thingStore: IThingStore }

function pickThingStore(): IThingStore {
  switch (config.STORAGE_PROVIDER) {
    case 'postgres': {
      if (!config.POSTGRES_URL) throw new Error("STORAGE_PROVIDER='postgres' requires POSTGRES_URL.");
      const client = new PgClientAdapter({ connectionString: config.POSTGRES_URL });
      const tenantId = asTenantId(config.TENANT_ID); // brand once at the boundary (throws on empty)
      return new PgThingRepository({ client, tenantId, ownerUuid: config.DEFAULT_OWNER_UUID });
    }
    case 'memory':
    default: {
      const provider = new InMemoryStorageProvider<ThingMeta>();
      const session = new Session({ /* TODO operatorUuid/operatorType/tokenGetter/dialog */ } as never);
      return new ThingRepository(provider, session);
    }
  }
}
export function buildInfrastructure(): SharedInfrastructure {
  return { thingStore: pickThingStore() };
}
// Module-level singleton — guarantees every importer sees the same instance.
export const infrastructure: SharedInfrastructure = buildInfrastructure();
