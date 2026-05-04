<div align="center">

# @gertsai/auth-openfga

### Zanzibar-style ReBAC for gerts.ai — powered by OpenFGA

Type-safe permission checks, bulk relationship writes, instant revoke, event-driven
caching, and ABAC context (time, network, geo) — wired to `@gertsai/core` events.

<br>

[![License: MIT](https://img.shields.io/badge/license-MIT-000.svg?style=flat-square)](LICENSE)
[![Tier](https://img.shields.io/badge/tier-4-orange?style=flat-square)](#status)
[![Status](https://img.shields.io/badge/status-alpha-yellow?style=flat-square)](#status)

</div>

---

## Why @gertsai/auth-openfga

- **Zanzibar / ReBAC, not just RBAC** — relationship tuples (`user:123 — viewer — project:demo`) compose into RBAC, ABAC, and graph-style access. One model covers tenants, teams, projects, and API keys.
- **OpenFGA under the hood** — production-grade Zanzibar implementation (`@openfga/sdk`). We add type-safe wrappers, batched checks, ergonomic helpers (`canView`, `canEdit`, `canDelete`, `canManage`).
- **Event-driven cache** — `PermissionCache` keyed by `(user, relation, object)` with surgical invalidation on IAM events from `@gertsai/core`. No global flush, no stale grants.
- **Bulk operations** — grant/revoke many relations in one transaction (`bulkGrantAccess`, `bulkRevokeFromResources`), batched under OpenFGA's transaction limits.
- **Instant revoke + ABAC pre-check** — pluggable deny ledger (in-memory or Redis) short-circuits checks before OpenFGA. ABAC layer enforces time windows, CIDR allowlists, OFAC geo-blocks, and clearance levels.
- **Cloudflare-aware IP extraction** — `extractClientIp` validates the proxy chain against known Cloudflare ranges (SEC-006). No spoofable `X-Forwarded-For`.

## Install

```sh
pnpm add @gertsai/auth-openfga @gertsai/core @openfga/sdk
```

Requires Node.js ≥ 20 and a reachable OpenFGA store (self-hosted or managed).

## Quickstart

```typescript
import {
  getFgaClient,
  checkPermission,
  canView,
  canEdit,
} from '@gertsai/auth-openfga';

// Configure the singleton client (reads env if config omitted)
const fga = getFgaClient({
  apiUrl: process.env.OPENFGA_API_URL!,
  storeId: process.env.OPENFGA_STORE_ID!,
  authorizationModelId: process.env.OPENFGA_MODEL_ID,
});

// Low-level check
const allowed = await checkPermission({
  userId: '123',
  relation: 'viewer',
  resourceType: 'project',
  resourceId: 'demo',
});

// Convenience wrappers
const canSee  = await canView('123', 'project', 'demo');
const canEdit_ = await canEdit('123', 'project', 'demo');
```

### ABAC: time, network, geo

```typescript
import { checkPermission, buildABACContext } from '@gertsai/auth-openfga';

const context = buildABACContext(req, {
  resource: { sensitivity: 2, status: 'active' },
  policy:   { allowedCidrs: ['10.0.0.0/8'], blockedCountries: ['IR', 'KP'] },
});

const allowed = await checkPermission({
  userId: '123',
  relation: 'can_view',
  resourceType: 'sensitive_project',
  resourceId: 'secret',
  context,
});
```

### Instant revoke (deny ledger)

```typescript
import { denyAccess, restoreAccess, setDenyLedger, RedisDenyLedgerAdapter } from '@gertsai/auth-openfga';

setDenyLedger(new RedisDenyLedgerAdapter({ redis, prefix: 'deny:' }));

await denyAccess({ userId: '123', resourceType: 'project', resourceId: 'demo' });
// every checkPermission for this tuple returns false until restoreAccess(...)
```

## What you get

| Area                | Surface                                                                     |
|---------------------|-----------------------------------------------------------------------------|
| **Queries**         | `checkPermission`, `canView` / `canEdit` / `canDelete` / `canManage`, `batchCheckPermissions`, `listAccessibleResources`, `listProjectViewers`, `getAccessSummary`, `expandPermission`, `explainAccess` |
| **Mutations**       | `writeTuples`, `deleteTuples`, `writeTransaction`, `grantTeamProjectAccess`, `setProjectTenant`, `setTeamParent` |
| **IAM event hooks** | `onUserCreated`, `onUserDeleted`, `onMembershipAdded/Removed`, `onRoleAssigned/Unassigned`, `onTeamMemberAdded/Removed`, `onApiKeyCreated/Deleted` |
| **Bulk ops**        | `bulkGrantAccess`, `bulkRevokeAccess`, `bulkGrantToResources`, `bulkRevokeFromResources`, `bulkWriteTuples`, `bulkDeleteTuples` |
| **Permission cache**| `PermissionCache`, `getPermissionCache`, `createInvalidationHandler`, `INVALIDATION_EVENTS` |
| **Deny ledger**     | `denyAccess`, `restoreAccess`, `isDenied`, `listDeniedAccess`, `InMemoryDenyLedger`, `RedisDenyLedgerAdapter` |
| **ABAC**            | `buildABACContext`, `buildTimeContext`, `buildNetworkContext`, `buildGeoContext`, `preCheckABAC`, `DEFAULT_ABAC_POLICY` |
| **Cloudflare IPs**  | `isCloudflareIp`, `isTrustedProxy`, `extractClientIp`, `CLOUDFLARE_IPV4_RANGES`, `CLOUDFLARE_IPV6_RANGES`, `isIpInCidr` |

## Subpath imports

| Import                                  | Use case                                                          |
|-----------------------------------------|-------------------------------------------------------------------|
| `@gertsai/auth-openfga`                 | Full surface — client, ABAC, cache, deny, queries, mutations.     |
| `@gertsai/auth-openfga/queries`         | Read path only — checks, lists, expand. No mutation code shipped. |
| `@gertsai/auth-openfga/mutations`       | Write path only — tuple writes, IAM hooks, bulk ops.              |

Subpath imports keep edge / read-only workers small by tree-shaking the half they don't need.

## API surface

```typescript
// Client
import { GertsFgaClient, getFgaClient, resetFgaClient } from '@gertsai/auth-openfga';

// Type-safe checks (RFC-055)
import type {
  CheckableResourceType, RelationFor, TypedOpenFgaCheck, StaticOpenFgaCheck,
  FgaTuple, FgaCheckRequest, FgaCheckResponse, FgaListObjectsRequest,
} from '@gertsai/auth-openfga';

// Subject helpers (SEC-009) — canonical string forms
import {
  subjectString, apiKeyString, userString, teamMemberString,
  roleAssigneeString, objectString, parseObjectString, parseUserString,
  FGA_TYPES, FGA_RELATIONS, METHOD_TO_RELATION, ACTION_TO_RELATION,
} from '@gertsai/auth-openfga';

// ABAC
import {
  buildABACContext, extractClientIp, extractCountryCode,
  isWithinBusinessHours, isClearanceSufficient, isCountryAllowed,
  preCheckABAC, CLEARANCE_LEVELS, RESOURCE_STATUS, BLOCKED_COUNTRIES_OFAC,
} from '@gertsai/auth-openfga';

// Cache + deny
import {
  PermissionCache, createInvalidationHandler, INVALIDATION_EVENTS,
  denyAccess, restoreAccess, isDenied, RedisDenyLedgerAdapter,
} from '@gertsai/auth-openfga';
```

`FGA_TYPES` and `FGA_RELATIONS` are the source of truth for resource types
(`tenant`, `team`, `project`, `api_key`, ...) and relations
(`viewer`, `editor`, `admin`, `owner`, `can_view`, `can_edit`, ...).
`METHOD_TO_RELATION` / `ACTION_TO_RELATION` map HTTP verbs and domain actions
to the relation that gates them.

## Status

- **Tier 4** — depends on `@gertsai/core` (event bus, config, logging).
- **Version** — `0.1.0`, alpha. APIs may change before `1.0`.
- **Tests** — Vitest suites for `bulk`, `cache`, `constants`, `deny` under `src/__tests__/`.
- **Production checklist** — provide `OPENFGA_API_URL`, `OPENFGA_STORE_ID`, and `OPENFGA_MODEL_ID`; wire `createInvalidationHandler` to the core event bus; pick `RedisDenyLedgerAdapter` over the in-memory default for multi-instance deploys.

## License

MIT — see [LICENSE](./LICENSE).
