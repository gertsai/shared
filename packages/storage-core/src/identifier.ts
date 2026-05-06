// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * DI token for registering and resolving an {@link IStorageProvider}.
 *
 * Per F-T-5 + ADR-005 Decision A item 5: the registry-side type fixes the
 * provider's metadata generic to `StorageMetadata<unknown, unknown, string>`
 * — a deliberately wide instantiation that matches any concrete adapter.
 * Consumers cast the resolved value to their specific
 * `IStorageProvider<MyMeta>` at the registration boundary.
 *
 * Why widen instead of pushing the generic into the token: the DI
 * container's identifier-to-service map is a single registry shared by
 * all consumers. Token-level generics would force every call site to
 * agree on the same Meta, which defeats the purpose of having one storage
 * provider serving multiple entity shapes (each with its own Meta). The
 * widened token + boundary cast preserves type safety at the consumer
 * site without coupling unrelated subsystems.
 *
 * Mirror precedent: `IService<any>` in `@gertsai/di` (`src/types.ts`) —
 * the `ServiceType` union also widens its consumer generic to `any` so
 * heterogeneous services share one service-id space.
 */

import { createIdentifier } from '@gertsai/di';
import type { IGlobalService, ServiceIdentifier } from '@gertsai/di';

import type { IStorageProvider, StorageMetadata } from './types';

/**
 * The widened provider shape used as the registry-side type. Every
 * concrete `IStorageProvider<MyMeta>` is structurally assignable to this,
 * because all metadata generics widen to `unknown` / `string` here.
 *
 * Implementations that also wish to participate in `@gertsai/di`'s
 * `IGlobalService` lifecycle (i.e., expose `$destroy()` + `isReady`)
 * may extend this intersection — adapters are not required to do so,
 * but doing so unlocks lifecycle integration. The intersection is kept
 * as an alias so the public token signature stays
 * `ServiceIdentifier<IStorageProvider<...>>` without leaking the
 * `IGlobalService` requirement to non-DI consumers.
 *
 * @internal
 */
type WideStorageProvider = IStorageProvider<
  StorageMetadata<unknown, unknown, string>
> &
  IGlobalService;

/**
 * Service identifier used to register an {@link IStorageProvider}
 * implementation with `@gertsai/di`'s container.
 *
 * The token resolves to a widened `IStorageProvider<unknown, unknown,
 * string>`. Consumers cast at the registration boundary to recover their
 * specific Meta. Pattern:
 *
 * ```ts
 * import { storageProviderIdentifier } from '@gertsai/storage-core';
 * import { ServicesRegistry } from '@gertsai/di';
 *
 * const registry = new ServicesRegistry<null>();
 * registry.register(storageProviderIdentifier, () =>
 *   new MyPgStorageProvider(...) as unknown as IStorageProvider<MyMeta>,
 * );
 *
 * // At the consumer boundary:
 * const provider = registry.create(
 *   storageProviderIdentifier,
 *   null,
 * ) as unknown as IStorageProvider<MyMeta>;
 * ```
 *
 * Apps with multiple storage providers (e.g., one for users, one for
 * audit logs) should create additional named identifiers via
 * `createIdentifier<IStorageProvider<UserMeta>>('UserStorage')` etc.
 * The single canonical identifier exported here is the default for
 * single-provider apps.
 *
 * @public
 */
export const storageProviderIdentifier: ServiceIdentifier<WideStorageProvider> =
  createIdentifier<WideStorageProvider, 'StorageProvider'>('StorageProvider');
