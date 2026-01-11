# <div align="center"> `Orchestra rate limit request` </div>

<br>

<div align="center">

A `api-rlr` middleware with [`redis`](https://github.com/redis/redis) store for the
[`orch-api-services`](https://gitlab.com/orchdev/api/orch-api-services)

</div>

## Access key

Request `{GITLAB_CI_KEY}` from the administrator to access the private repository

### Setting the key to an environment variable

Activate environment variable in terminal, will work until system reboots

```sh
export GITLAB_CI_KEY="test-keyh28hfu4-wrx34"
```

You can also add a variable to the `~/.bash_profile` or `~/.bashrc` file

```sh
nano ~/.bash_profile
```

Paste a line into a file and save

```sh
export GITLAB_AUTH_TOKEN="test-keyh28hfu4-wrx34"
```

Activating a profile after modification with the `source` command

```sh
source ~/.bash_profile
```

## Installation

It is necessary to create a .npmrc file in the place where the package is used and add the following line to it

```sh
# Add to .nprmrc

# api-rlr
> '//gitlab.com/api/v4/projects/57516921/packages/npm/:_authToken'="${GITLAB_AUTH_TOKEN}"
```

```sh
# Using npm
> pnpm add @orchdev/api-rlr
# Using yarn or pnpm
> yarn/pnpm add @orchdev/api-rlr
```

## Usage

### Importing

This library is provided in ESM as well as CJS forms, and works with both
Javascript and Typescript projects.

Import it in a CommonJS project (`type: commonjs` or no `type` field in
`package.json`) as follows:

```ts
const { RLRMiddleware } = require('@orchdev/api-rlr');
```

Import it in a ESM project (`type: module` in `package.json`) as follows:

```ts
import { RLRMiddleware } from '@orchdev/api-rlr';
```

### Examples

Global middleware with Redis store and GCRA strategy (recommended for webhook follow‑up/pull endpoints):

```ts
import { createApiService } from '@orchdev/api-core';
import RLRMiddleware from '@orchdev/api-rlr';
import RedisClient from 'ioredis';

import pjson from '../../package.json';
import config from '../project.config';

export default createApiService(
  {
    name: 'api.analytics',
    version: 'v1',
    settings: {
      host: config.SERVICE_HOST,
      port: config.SERVICE_PORT,
      rateLimit: null,
      use: [
        RLRMiddleware({
          // base window and rate
          timeFrame: +config.RLR_TIMEFRAME, // e.g. 60000 ms
          limit: +config.RLR_LIMIT, // e.g. 60 req / window

          // strategy (optional): 'gcra' | 'sliding_window'
          strategy: 'gcra',
          // burst for GCRA (optional): additional short burst capacity
          burst: 3,

          // optional per-route overrides (path can be string or RegExp)
          routes: [
            {
              path: /\/v2\/messages\/.*/,
              method: 'GET',
              strategy: 'gcra',
              burst: 4, // override burst for this route
              timeFrame: 60000, // override window
              limit: 60, // override limit
            },
            {
              path: '/v2/media/download',
              method: 'GET',
              strategy: 'sliding_window',
              timeFrame: 60000,
              limit: 90,
            },
          ],

          // Redis connection factory (REQUIRED)
          store: () =>
            new RedisClient(
              !config.RLR_CLUSTER
                ? { host: config.RLR_HOST, port: config.RLR_PORT }
                : {
                    sentinels: [{ host: config.RLR_HOST, port: config.RLR_PORT }],
                    name: config.RLR_CLUSTER_NAME,
                  },
            ),
        }),
      ],
    },
    routes: [
      {
        path: '/',
        whitelist: ['v1.analytics.**'],
        bodyParsers: {
          json: {
            strict: false,
            limit: '1MB',
          },
          urlencoded: {
            extended: true,
            limit: '1MB',
          },
        },
        autoAliases: true,
        authentication: true,
      },
    ],
  },
  pjson,
);
```

### Headers

By default, the middleware returns Draft 6 headers. To return Draft 7 headers, set `draftVersion: DraftVersionType.DRAFT7`.

- Draft 6 (default)
  - `X-RateLimit-Policy`: `<limit>;w=<windowSeconds>`
  - `X-RateLimit-Limit`: `<limit>`
  - `X-RateLimit-Remaining`: `<remaining>`
  - `X-RateLimit-Retry-After`: `<seconds>` (seconds until a retry is allowed)
  - `X-RateLimit-Retry`: `<epochMillis>` (absolute timestamp when a retry is allowed)
  - `X-RateLimit-Bucket`: `<method>:<normalized-path>[/bulk][/sse]` (optional)

- Draft 7 (enable via `draftVersion: DraftVersionType.DRAFT7`)
  - `RateLimit-Policy`: `<limit>;w=<windowSeconds>`
  - `RateLimit`: `limit=<limit>, remaining=<remaining>, reset=<seconds>`

Clients like `@orchlab/gong` parse both families and apply the max delay with a small offset and per‑bucket cooldown.

### Strategies

- `sliding_window` (default): time window with weighted previous window; simple and compatible with most clients.
- `gcra`: highly predictable pacing with accurate `Retry-After`; recommended for webhook follow‑up/pull endpoints.

Use `strategy` globally and/or override per route via `routes[]` entries.

### Recommendations

- Default for API gateways: use `gcra`.
  - Suggested baseline: `timeFrame = 60000`, `limit = 60`, `burst = 3–5`.
  - Bucket key: per API key and route pattern (optionally include a major id), e.g. `<apiKey>:<routePattern>[:<majorId>]`.

- Media/multipart endpoints (short spikes):
  - Keep `gcra` and raise `burst` (e.g. 8–12) and/or `limit`, or
  - Use `sliding_window` with a higher `limit` for a wider start.

- Public read-only GET traffic:
  - Prefer `gcra` with a higher `limit` and a small `burst` (1–2),
  - `sliding_window` is acceptable if you already rely on it.

- Headers:
  - If you need `RateLimit` (draft 7), set `draftVersion: DraftVersionType.DRAFT7`.
  - By default, Draft 6 headers are returned.

- Redis connection reuse (hot‑reload):
  - Pass `storeSingletonKey: 'rlr:redis:default'` to reuse a single Redis client per process; graceful shutdown hooks are attached automatically.

- Observability:
  - Emit metrics for `remainingHits`, `expiryTime` (or computed `retryAfter`), and per‑bucket deny counts.
  - If using `sliding_window`, periodically check ZSET sizes and TTLs to ensure keys don’t accumulate.

- Client retry guidance:
  - Respect `Retry-After`/`X-RateLimit-Retry(-After)` from responses; add small jitter; avoid synchronized retries across workers.

#### Subjects, routes and fallback

- `whiteList` applies to subjects (e.g., IP/API key/tenant), not to routes.
- To ignore specific endpoints, use `routes[].ignore: true`.
- If `routes` are provided and no entry matches, the global limit applies as a fallback for the normalized URL (`<method>:<normalized-path>`).

#### Bucket id, normalization and security

- Subject is resolved via `bucketKeyResolver(req)` (e.g., `acct:<id>`/`key:<apiKey>`). If it returns `null`, the client IP is used.
- Bucket id format (default): `<method>:<normalized-path>[/bulk][/sse]`.
  - Normalization: lowercase; long numeric/uuid-like segments → `:id`; `/reactions/*` → `/reactions/:reaction`; trim trailing slash.
- Do not include sensitive information in the bucket id returned to clients; consider hashing if necessary.

#### Time and consistency

- The middleware uses the application clock (`Date.now()`). Ensure NTP sync across nodes. If you need Redis time, consider extending the store to call `TIME` and propagate it to scripts.

#### Store reuse and resilience

- Always pass `storeSingletonKey` to reuse a single Redis client per process; graceful shutdown hooks are attached automatically.
- Configure ioredis with sensible timeouts and retry strategies. Prefer a dedicated Redis (or cluster) for rate‑limiting.
- Define an operational failure policy: for public read‑only GET you may choose fail‑open; for write/webhooks prefer fail‑closed.

#### Perimeter

- Combine app‑level limits with CDN/WAF rate‑limiting for volumetric protection at the edge.

### Dynamic subject and plan‑based limits

You can bind rate limits to an account/tenant (instead of IP) and dynamically increase limits for PRO/Enterprise plans using two optional resolvers:

- `bucketKeyResolver(req)`: returns the subject used to key the bucket (e.g., apiKey, accountId, tenantId). Fallback is client IP.
- `limitsResolver({ req, route, base })`: overrides `{ limit, timeFrame, strategy, burst }` per request (ideal for plans/tiers).

Example configuration:

```ts
RLRMiddleware({
  timeFrame: 60_000,
  limit: 60,
  strategy: 'gcra',
  burst: 3,
  routes: [
    /* ... */
  ],

  // Decide bucket subject: prefer bearer token or api key; fallback to IP
  bucketKeyResolver: (req) => {
    const auth = req.headers?.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (m) return `acct:${m[1]}`; // subject bound to account token
    const apiKey = req.headers?.['x-api-key'];
    if (typeof apiKey === 'string' && apiKey) return `key:${apiKey}`;
    return null; // fallback to IP
  },

  // Bump limits for PRO/Enterprise plans
  limitsResolver: ({ req, route, base }) => {
    // Option A: plan from JWT (already decoded by auth middleware)
    //   const plan = (req as any).user?.plan;
    // Option B: plan from a DB lookup (sync or cached async)
    //   const accountId = (req as any).user?.id || /* parse from token */
    //   const plan = plansCache.get(accountId) || 'free';

    const planHeader = req.headers?.['x-plan'];
    const plan = Array.isArray(planHeader) ? planHeader[0] : planHeader; // 'pro' | 'enterprise' | 'free'

    if (plan === 'pro') {
      return {
        limit: Math.ceil(base.limit * 2),
        burst: Math.max(base.burst, 6),
      };
    }
    if (plan === 'enterprise') {
      return { limit: base.limit * 4, burst: Math.max(base.burst, 10) };
    }
    return null; // no overrides
  },
});
```

Notes:

- If you resolve the subject to an `accountId`, multiple IPs/clients of the same account will share the same bucket.
- You can also switch strategies per plan or route (e.g., `gcra` for webhooks on PRO, `sliding_window` for others).
- Prefer caching plan lookups to avoid adding latency to the fast path.

#### Example: wiring JWT/DB plan in api.service.ts

```ts
// api/services/src/mol-services/api.service.ts
import { createApiService } from '@orchdev/api-core';
import RLRMiddleware from '@orchdev/api-rlr';
import RedisClient from 'ioredis';
import jwt from 'jsonwebtoken';

import pjson from '../../package.json';
import config from '../project.config';

type AccountPlan = 'free' | 'pro' | 'enterprise';

// Simple in-memory cache for plan lookups
const plansCache = new Map<string, { plan: AccountPlan; exp: number }>();
const getCachedPlan = (accountId: string) => {
  const hit = plansCache.get(accountId);
  if (hit && hit.exp > Date.now()) return hit.plan;
  return null;
};
const setCachedPlan = (accountId: string, plan: AccountPlan, ttlMs = 60_000) => {
  plansCache.set(accountId, { plan, exp: Date.now() + ttlMs });
};

function getAccountFromJwt(req: any): {
  accountId?: string;
  plan?: AccountPlan;
} {
  const auth = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return {};
  try {
    const payload: any = jwt.decode(m[1]); // verify() if needed
    return { accountId: payload?.account_id, plan: payload?.plan };
  } catch {
    return {};
  }
}

export default createApiService(
  {
    settings: {
      host: config.SERVICE_HOST,
      port: config.SERVICE_PORT,
      rateLimit: null,
      use: [
        RLRMiddleware({
          timeFrame: +config.RLR_TIMEFRAME,
          limit: +config.RLR_LIMIT,
          strategy: 'gcra',
          burst: 3,

          bucketKeyResolver: (req) => {
            const { accountId } = getAccountFromJwt(req);
            if (accountId) return `acct:${accountId}`;
            const apiKey = req.headers?.['x-api-key'];
            if (typeof apiKey === 'string' && apiKey) return `key:${apiKey}`;
            return null; // fallback to IP
          },

          limitsResolver: ({ req, base }) => {
            const { accountId, plan: planFromJwt } = getAccountFromJwt(req);

            const headerPlan = req.headers?.['x-plan'];
            const quickPlan = Array.isArray(headerPlan) ? headerPlan[0] : headerPlan;
            const plan: AccountPlan =
              quickPlan === 'pro' || quickPlan === 'enterprise'
                ? (quickPlan as AccountPlan)
                : planFromJwt || 'free';

            if (plan === 'pro') {
              return {
                limit: Math.ceil(base.limit * 2),
                burst: Math.max(base.burst, 6),
              };
            }
            if (plan === 'enterprise') {
              return { limit: base.limit * 4, burst: Math.max(base.burst, 10) };
            }

            // Async refresh of cached plan via Moleculer (optional)
            if (accountId && !planFromJwt && !quickPlan) {
              const ctx = (req as any).$ctx;
              ctx
                .call('v2.accounts.getPlan', { accountId })
                .then((p: AccountPlan) =>
                  setCachedPlan(accountId, ['pro', 'enterprise'].includes(p as any) ? p : 'free'),
                )
                .catch(() => {});
            }

            return null;
          },

          routes: [
            /* your route patterns */
          ],
          storeSingletonKey: 'rlr:redis:default',
          store: () =>
            new RedisClient(
              !config.RLR_CLUSTER
                ? { host: config.RLR_HOST, port: config.RLR_PORT }
                : {
                    sentinels: [{ host: config.RLR_HOST, port: config.RLR_PORT }],
                    name: config.RLR_CLUSTER_NAME,
                  },
            ),
        }),
      ],
    },
    name: 'api.gate',
    version: 'v2',
    routes: [
      /* ... */
    ],
  },
  pjson,
);
```

### Server buckets and routes

This middleware can emit a server bucket id so clients can align queues. The id is returned via `X-RateLimit-Bucket`.

- Bucket id format (default): `<method>:<normalized-path>[/bulk][/sse]`
  - Normalization: numeric/uuid-like segments → `:id`, collapse `/reactions/*` → `/reactions/:reaction`, trim trailing slash, lowercase.
  - If a route entry in `routes[]` matches, that normalized path is used. Otherwise, the raw URL is normalized on the fly as a fallback.

- Example routes table (typical Gateway):

| Path (RegExp)                    | Method                | Limit       | Window(ms)       | Strategy       | Burst          |
| -------------------------------- | --------------------- | ----------- | ---------------- | -------------- | -------------- | -------------- | -------------- | --- |
| ^/v2/messages(/.\*)?$            | POST                  | 60          | 60000            | gcra           | 3              |
| ^/v2/messages(/.\*)?$            | PATCH                 | 30          | 60000            | sliding_window | -              |
| ^/v2/chats/[^/]+/messages$       | POST                  | 60          | 60000            | gcra           | 3              |
| ^/v2/chats/[^/]+/messages/[^/]+$ | PATCH                 | 30          | 60000            | sliding_window | -              |
| ^/v2/chats(/.\*)?$               | GET                   | 120         | 60000            | sliding_window | -              |
| ^/v2/webhooks/outgoing(/.\*)?$   | POST                  | 30          | 60000            | sliding_window | -              |
| ^/v2/webhooks/outgoing(/.\*)?$   | PATCH                 | 20          | 60000            | sliding_window | -              |
| ^/v2/webhooks/outgoing(/.\*)?$   | DELETE                | 10          | 60000            | sliding_window | -              |
| ^/v2/webhooks/outgoing(/.\*)?$   | GET                   | 120         | 60000            | sliding_window | -              |
| ^/v2/users/me/avatar$            | PUT                   | 10          | 60000            | sliding_window | -              |
| ^/v1/analytics/(groups           | identifies            | pages       | ...)$            | POST           | 40             | 60000          | gcra           | 5   |
| ^/v1/sapi/sendWithFiles$         | POST                  | 30          | 60000            | sliding_window | -              |
| ^/v2/(projects                   | tasks                 | teams       | members)(/.\*)?$ | POST           | 40             | 60000          | sliding_window | -   |
| ^/v2/(projects                   | tasks                 | teams       | members)(/.\*)?$ | PATCH          | 30             | 60000          | sliding_window | -   |
| ^/v2/(bots                       | applications)(/.\*)?$ | POST        | 30               | 60000          | sliding_window | -              |
| ^/v2/(bots                       | applications)(/.\*)?$ | GET         | 120              | 60000          | sliding_window | -              |
| ^/v2/payments(/.\*)?$            | POST                  | 20          | 60000            | sliding_window | -              |
| ^/v2/payments(/.\*)?$            | PUT                   | 20          | 60000            | sliding_window | -              |
| ^/v2/(search                     | meetings              | ai)(/.\*)?$ | GET              | 180            | 60000          | sliding_window | -              |

- SSE policy: for `GET` endpoints ending with `/events` or `/stream`, consider separate buckets or stricter concurrency on the client. This library appends `/sse` suffix to the bucket id by default for such paths.

## License

GNU LGPLv3 © [Eli Rum](https://gitlab.com/explosivebit)
