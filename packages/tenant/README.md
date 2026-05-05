<div align="center">

# @gertsai/tenant

### Tenant identification primitives — language-neutral core, optional Moleculer adapter

A tiny, dependency-free package that defines what a tenant id *is* (a branded
non-empty string) and how to read one from a request context. Pure types + helpers
in the root entry; Moleculer middleware lives in the `@gertsai/tenant/moleculer`
subpath so non-Moleculer consumers never pull Moleculer into their bundle.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Ftenant-cb3837?style=flat-square)](https://www.npmjs.com/package/@gertsai/tenant)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](./LICENSE)
[![Tier](https://img.shields.io/badge/tier-1-brightgreen?style=flat-square)](#status)
[![ESM + CJS](https://img.shields.io/badge/build-ESM%20%2B%20CJS-orange?style=flat-square)](#status)

</div>

---

## Install

```sh
pnpm add @gertsai/tenant
# or
npm i @gertsai/tenant
```

If you use the Moleculer adapter, also install the peer:

```sh
pnpm add moleculer
```

`moleculer` is declared as an *optional* peer dependency — no install needed
for code that only imports the root entry.

## Quickstart — root (any framework)

```ts
import {
  asTenantId,
  getTenantIdOptional,
  getTenantIdStrict,
  MissingTenantIdError,
  type TenantId,
  type TenantBearingContext,
} from '@gertsai/tenant';

// 1. Strict read — throws MissingTenantIdError when absent.
function chargeWallet(ctx: TenantBearingContext, amount: number) {
  const tenantId: TenantId = getTenantIdStrict(ctx);
  // ... use tenantId — narrowed to the branded type
}

// 2. Optional read — undefined when absent.
const maybe = getTenantIdOptional({ meta: { tenantId: 'acme' } }); // → 'acme' as TenantId

// 3. Cast a raw value (e.g. from config) into the brand.
const fromEnv = asTenantId(process.env.DEFAULT_TENANT ?? '');

// 4. Recover from missing-tenant errors at the edge.
try {
  getTenantIdStrict({});
} catch (err) {
  if (err instanceof MissingTenantIdError) {
    // emit 400 / structured log / etc.
  }
}
```

The root entry is **structural**: it doesn't know about Moleculer, Express,
or any other transport. It only requires an object with the shape
`{ meta?: { tenantId?: string } }`.

## Quickstart — Moleculer subpath

```ts
// moleculer.config.ts
import { tenantMiddleware } from '@gertsai/tenant/moleculer';

export default {
  middlewares: [tenantMiddleware()],
  // ... other middlewares
};
```

The middleware wraps every local action: any action invoked without
`ctx.meta.tenantId` rejects with `MissingTenantIdError` before the handler
runs. To opt actions out of the check, place them on a service that bypasses
this middleware (e.g. system / health-check services on a separate broker
config).

You can also read the tenant id directly inside an action:

```ts
import type { Context } from 'moleculer';
import {
  getMoleculerTenantId,
  getMoleculerTenantIdStrict,
} from '@gertsai/tenant/moleculer';

export default {
  name: 'orders',
  actions: {
    list(ctx: Context) {
      const tenantId = getMoleculerTenantIdStrict(ctx); // throws if missing
      return this.adapter.find({ query: { tenantId } });
    },
    listOptional(ctx: Context) {
      const tenantId = getMoleculerTenantId(ctx); // undefined if missing
      return tenantId ? this.adapter.find({ query: { tenantId } }) : [];
    },
  },
};
```

## API surface

### Root — `@gertsai/tenant`

| Export | Kind | Purpose |
|---|---|---|
| `TenantId` | type | Branded non-empty string (`string & { __brand: 'TenantId' }`) |
| `TenantContext` | type | `{ tenantId: string }` — required-tenant shape |
| `MaybeTenantContext` | type | `{ tenantId?: string }` — optional-tenant shape |
| `TenantBearingContext` | type | `{ meta?: MaybeTenantContext }` — adapter input shape |
| `MissingTenantIdError` | class | Thrown by strict readers when `meta.tenantId` is missing/empty |
| `getTenantIdStrict(ctx)` | fn | Returns `TenantId` or throws `MissingTenantIdError` |
| `getTenantIdOptional(ctx)` | fn | Returns `TenantId` or `undefined` |
| `asTenantId(value)` | fn | Casts a non-empty string to `TenantId` (throws `TypeError` if empty) |

### Moleculer subpath — `@gertsai/tenant/moleculer`

| Export | Kind | Purpose |
|---|---|---|
| `getMoleculerTenantId(ctx)` | fn | Optional read from a `moleculer.Context` |
| `getMoleculerTenantIdStrict(ctx)` | fn | Strict read from a `moleculer.Context` |
| `tenantMiddleware()` | fn | Moleculer middleware that enforces `ctx.meta.tenantId` on every local action |

## Compatibility

| | |
|---|---|
| **Node.js** | ≥ 22 LTS |
| **TypeScript** | ≥ 5.0 (uses branded types via intersection) |
| **Module systems** | ESM (`import`) and CJS (`require`) — types per format |
| **Moleculer** | optional peer `^0.14.0` (only required when using `/moleculer` subpath) |

The Moleculer subpath is type-only at the import boundary — Moleculer's
`Context` type is referenced via `import type`, so consumers that never import
the subpath will never see `moleculer` in their dependency graph.

## Status

| | |
|---|---|
| **Version** | `0.1.0` (initial) |
| **Tier** | 1 — no internal `@gertsai/*` dependencies |
| **Build** | Dual ESM (`dist/*.js`) + CJS (`dist/*.cjs`), types per format |
| **Stability** | Pre-1.0 — public API may shift; breaking changes called out in changelog |

Created per **PRD-001 FR-017** + **ADR-004** (Preserve-history-or-Fresh strategy).
The upstream `tenant.middleware.ts` in `gertsai_codex` resolves tenants from
HTTP requests (host / URL / header) and is conceptually a *layer above* this
package — it produces a tenant id, while this package defines what that id
is and how downstream code reads it.

## License

[Apache-2.0](./LICENSE)
