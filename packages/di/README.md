<div align="center">

# @gertsai/di

### Type-safe dependency injection that respects consumer lifecycles

A lightweight DI container for TypeScript: branded service identifiers, lazy
factories, automatic cleanup tied to consumer destruction, and dual ESM+CJS output.

[![Tier](https://img.shields.io/badge/tier-2-orange?style=flat-square)](#)
[![Build](https://img.shields.io/badge/build-ESM%20%2B%20CJS-blue?style=flat-square)](#)
[![Types](https://img.shields.io/badge/types-strict-3178c6?style=flat-square)](#)
[![Status](https://img.shields.io/badge/status-alpha-yellow?style=flat-square)](#status)

</div>

---

## Why @gertsai/di

<table>
<tr>
<td width="50%">

### Without
- DI containers tied to decorators and `reflect-metadata`
- Singletons that outlive the entities they serve
- Loose `string` keys, no compile-time guarantees
- Manual teardown of every dependent object

</td>
<td width="50%">

### With @gertsai/di
- Plain classes, no decorators, no metadata reflection
- Services live and die with their consumer
- `ServiceIdentifier<T>` carries the type into `get()`
- One `consumer.$destroy()` cascades cleanup

</td>
</tr>
</table>

## Install

```bash
pnpm add @gertsai/di
```

Peer requirement: TypeScript 5.2+. Workspace dep: [`@gertsai/utils`](../utils)
(provides `DeferredPromise` for service readiness).

## Quickstart

```typescript
import { EventEmitter } from 'events';
import {
  AbstractService,
  createIdentifier,
  diContainer,
  type ConsumerType,
} from '@gertsai/di';

// 1. Consumer — entity that owns services
class UserEntity extends EventEmitter implements ConsumerType {
  constructor(public readonly id: string, public readonly name: string) {
    super();
  }
  $destroy() {
    this.emit('destroy');
    this.removeAllListeners();
  }
}

// 2. Service — bound to a consumer, lifecycle-managed
class ProfileService extends AbstractService<UserEntity> {
  private profile: { bio: string } | null = null;

  constructor({ consumer }: { consumer: UserEntity }) {
    super({ consumer });
    this.profile = { bio: `Profile for ${consumer.name}` };
    this._isReady.resolve();
  }

  getProfile() { return this.profile; }
  $destroy() { this.profile = null; this.removeAllListeners(); }
}

// 3. Identifier — branded, type-carrying
const ProfileServiceId = createIdentifier<ProfileService>('profile');

// 4. Register
diContainer.registerService(UserEntity, ProfileServiceId, ({ consumer }) =>
  new ProfileService({ consumer }),
);

// 5. Resolve + use
const alice = new UserEntity('u-1', 'Alice');
const sd = diContainer.resolveServiceDirectory('User', UserEntity, alice);
const profile = sd.get(ProfileServiceId); // typed as ProfileService

await profile.isReady;
profile.getProfile(); // { bio: 'Profile for Alice' }

alice.$destroy(); // cascades — ProfileService.$destroy() runs
```

## What you get

| | |
|:---|:---|
| **Branded identifiers** | `createIdentifier<T>(name)` returns `ServiceIdentifier<T>` — the type travels through registration and resolution. |
| **Container hierarchy** | Per-consumer-class registries plus a `__global__` registry for singletons. Lookups are scoped, not flat. |
| **Lifecycle binding** | A consumer emitting `'destroy'` triggers `ServiceDirectory.$destroy()` which destroys every cached service. No manual bookkeeping. |
| **Lazy instantiation** | Services are constructed only on first `sd.get(id)`. Subsequent calls return the cached instance. |
| **Memory-safe** | `WeakMap<ConsumerType, ServiceDirectory>` ensures directories are GC-eligible once consumers are unreferenced. |
| **Readiness protocol** | `AbstractService` exposes `isReady: Promise<void>` backed by a `DeferredPromise` from `@gertsai/utils`. |
| **Global services** | Register via `registerGlobalService(id, factory)`, access via `diContainer.$sd.get(id)`. |
| **Module augmentation** | Extend `ServiceTypeMapping` / `GlobalServiceTypeMapping` for full inference across files. |
| **Dual build** | `dist/esm` + `dist/cjs` with separate `.d.ts` per format, both published from one source. |

## API surface

```typescript
// Identifiers
createIdentifier<Service, Name extends string>(name: Name): ServiceIdentifier<Service>;

// Container
diContainer.registerService(
  ConsumerClass,
  serviceId,
  ({ consumer }) => new Service({ consumer }),
);
diContainer.registerGlobalService(serviceId, ({ consumer: null }) => new Service(...));
diContainer.resolveServiceDirectory(name, ConsumerClass, consumerInstance): ServiceDirectory;
diContainer.$sd; // global ServiceDirectory

// Service directory
sd.get(serviceId);   // lazy + cached, returns typed instance
sd.$destroy();       // cascade-destroys every cached service

// Base class
abstract class AbstractService<Consumer extends ConsumerType | null> {
  protected _consumer: Consumer;
  protected _isReady: DeferredPromise<void>;
  get Consumer(): Consumer;
  get isReady(): Promise<void>;
  abstract $destroy(): void;
}

// Type-mapping extension points
declare module '@gertsai/di' {
  interface ServiceTypeMapping {
    User: { profile: ProfileService; settings: SettingsService };
  }
  interface GlobalServiceTypeMapping {
    logger: LoggerService;
  }
}

// Runtime guards & assertions (Sprint 3.4 W-4A-4)
isDestroyable(value): value is IDestroyable;
isServiceIdentifier(value): value is ServiceIdentifier<unknown>;
assertServiceIdentifier(value, label?): asserts value is ServiceIdentifier<unknown>;

// Safe-destroy helpers (Sprint 3.4 W-4A-4)
safeDestroy(target: unknown): unknown;                 // returns caught error or undefined
safeDestroyAll(targets: Iterable<unknown>): SafeDestroyResult;

// Type-level inference helpers (Sprint 3.4 W-4A-4)
type InferServiceFromIdentifier<I extends ServiceIdentifier<any>>;
type AnyServiceIdentifier = ServiceIdentifier<ServiceType>;
```

Exports: `createIdentifier`, `diContainer`, `AbstractService`, `ServiceDirectory`,
`ServicesRegistry`, `isDestroyable`, `isServiceIdentifier`,
`assertServiceIdentifier`, `safeDestroy`, `safeDestroyAll`, plus types
`IService`, `IGlobalService`, `ConsumerType`, `ServiceConsumer`,
`ServiceIdentifier`, `ServiceFactory`, `SafeDestroyResult`,
`InferServiceFromIdentifier`, `AnyServiceIdentifier`,
`ServiceTypeMapping`, `GlobalServiceTypeMapping`, `DefaultServiceTypeMapping`.

## Best practices

### Heterogeneous teardown with `safeDestroyAll`

Real-world consumer arrays mix services, plain objects, and the occasional
service whose `$destroy()` throws. `safeDestroyAll` skips non-destroyables
and isolates failures so one bad actor cannot abort the cascade:

```typescript
import { safeDestroyAll } from '@gertsai/di';

// Heterogeneous teardown — some items may not be IDestroyable, some may throw.
const result = safeDestroyAll([service1, service2, configBag, eventBus]);

if (result.errors.length > 0) {
  logger.error({ errors: result.errors }, 'Some services failed to destroy');
  // App can decide whether to escalate.
}
// result.destroyed / result.skipped also available for telemetry.
```

## Deferred / future

### Parameterized identifiers (Sprint 3.x)

Orchestra's `orchlab/di` supports `ServiceIdentifier<T, Args>` with cached
variants per `JSON.stringify(args)` key. Sprint 3.4 explicitly DEFERRED this
pattern to avoid breaking existing consumers (would widen every generic).

Roadmap (separate `parameterized.ts` module, additive non-breaking):
- `createParameterizedIdentifier<S, I, Args>(name)` — separate brand.
- `getParameterized(id, args)` — overload on `ServiceDirectory`.
- `getAll(id)` — list all cached variants of a parameterized identifier.

No timeline yet. Track in `forgeplan` workspace under future `Sprint 3.x`.

## Comparison

| | `@gertsai/di` | InversifyJS | TSyringe |
|---|---|---|---|
| Decorators / `reflect-metadata` | no | required | required |
| Lifecycle bound to a consumer entity | yes | manual scopes | manual scopes |
| Bundle footprint | minimal (one workspace dep) | medium | small |
| Primary use case | entity-scoped services in long-lived apps | enterprise IoC | request-scoped DI |

## Status

Alpha — `0.1.0`, internal Orchestra/GertsAi consumption. Public API may shift
before `1.0`. Tier 2 in the workspace dependency graph (depends on `@gertsai/utils`).

## License

Apache-2.0 — see repository root `LICENSE` for terms.
