# @gertsai/tenant-resolver

Composable multi-strategy tenant resolution for `@gertsai/*` services.
Pure types + a fail-closed strategy chain in the root export, optional
Moleculer + Node-HTTP adapters in dedicated subpaths per ADR-006
Decision B + Amendment 1.

The package never imports a concrete HTTP framework runtime — built-in
strategies operate on the duck-typed `HttpRequestLike` interface so the
same code works for `node:http`, `Request`, Moleculer-web requests, and
arbitrary test fixtures.

## Install

```bash
pnpm add @gertsai/tenant-resolver @gertsai/errors
```

`@gertsai/errors` is a peer dependency — `resolveTenantStrict` and the
default-strict `ChainTenantResolver` throw `UnauthorizedError` from it
when no strategy resolves.

## Quickstart

```ts
import {
  ChainTenantResolver,
  HeaderStrategy,
  PathStrategy,
  SubdomainStrategy,
} from '@gertsai/tenant-resolver';
import { nodeHttpAdapter } from '@gertsai/tenant-resolver/http';

const chain = new ChainTenantResolver([
  new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true }),
  new PathStrategy({ pathPattern: '/t/:tenantId/...' }),
  new SubdomainStrategy({ baseDomain: 'gertsai.dev' }),
]);
// Default mode is 'strict' — throws UnauthorizedError when none resolve.

import { createServer } from 'node:http';

createServer(async (req, res) => {
  try {
    const { tenantId, strategyName } = await chain.resolve(nodeHttpAdapter(req));
    res.setHeader('x-resolved-by', strategyName);
    res.end(`tenant: ${tenantId}`);
  } catch (err) {
    res.statusCode = 401;
    res.end(String(err));
  }
});
```

For routes that genuinely should not require a tenant (health checks,
public docs), opt into the optional mode explicitly:

```ts
const optionalChain = new ChainTenantResolver(strategies, { mode: 'optional' });
const resolution = await optionalChain.resolve(req); // null when nothing matches
```

## Subpath imports

### `@gertsai/tenant-resolver/moleculer`

Moleculer-aware adapters. Type-only `moleculer` import; install
`moleculer` as a peer dependency to use this subpath at runtime.

```ts
import { MoleculerCtxStrategy, tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';

const broker = new ServiceBroker({
  middlewares: [tenantMiddleware(new MoleculerCtxStrategy())],
});
```

`tenantMiddleware` writes the resolution to `ctx.meta.tenantResolution`
and back-fills `ctx.meta.tenantId` if absent. Override the destination
key with `tenantMiddleware(resolver, { metaKey: 'gertsResolution' })`.

### `@gertsai/tenant-resolver/http`

Node-HTTP adapter that lifts an `IncomingMessage` to `HttpRequestLike`.

```ts
import { nodeHttpAdapter } from '@gertsai/tenant-resolver/http';
const adapted = nodeHttpAdapter(req);
```

## API

| Export | Kind | Purpose |
|---|---|---|
| `TenantResolverStrategy<Source>` | interface | Composable strategy contract; `resolve` returns `null` on no-match. |
| `TenantResolution` | type | `{ tenantId, strategyName }` — strategyName preserves provenance. |
| `HttpRequestLike` | interface | Duck-typed request shape used by HTTP-shaped strategies. |
| `ChainTenantResolver<Source>` | class | Sequential first-wins orchestrator; `mode: 'strict' \| 'optional'` (default `'strict'`). |
| `resolveTenantStrict(resolver, source)` | function | Wraps a single resolver; throws `UnauthorizedError` on null. |
| `HeaderStrategy` | class | Reads a HTTP header value; **requires `trustProxy: true`**. |
| `SubdomainStrategy` | class | Strict suffix match against `baseDomain`; rejects IP literals. |
| `PathStrategy` | class | URL-normalised match of `:tenantId` placeholder; rejects traversal. |
| `MoleculerCtxStrategy` | class (`/moleculer`) | Reads `ctx.meta.tenantId`. |
| `tenantMiddleware(resolver, opts?)` | factory (`/moleculer`) | Moleculer middleware wrapping a resolver per request. |
| `nodeHttpAdapter(req)` | function (`/http`) | Lifts `node:http.IncomingMessage` to `HttpRequestLike`. |

## Security

Multi-tenant boundary enforcement depends on the strategies you compose.
Read this section before deploying.

### `HeaderStrategy` requires a trusted reverse proxy

A HTTP request header is user-controllable. `X-Tenant-ID` is only a
trustworthy source of identity if a trusted reverse proxy (nginx,
Envoy, ALB, Cloud Run ingress, etc.) **strips** any inbound
`X-Tenant-ID` from the client and **re-sets** it from authenticated
context.

The constructor throws unless you pass `trustProxy: true`:

```ts
// throws — fail-closed default
new HeaderStrategy({ headerName: 'X-Tenant-ID' });

// only after you verify your edge proxy strips & sets the header
new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
```

When this contract cannot be guaranteed (development, public-facing
ingress without a proxy), prefer `PathStrategy` or `SubdomainStrategy`
which derive identity from URL structure, then validate against an
authentication check.

### `ChainTenantResolver` is fail-closed by default

The chain's default mode is `'strict'`: if every strategy returns
`null` (no tenant resolved), `resolve()` throws `UnauthorizedError`.
Routes that intentionally serve unauthenticated traffic must opt into
the optional mode explicitly:

```ts
new ChainTenantResolver(strategies, { mode: 'optional' });
```

Forgetting to opt out is safe; forgetting to opt in is not.

### `PathStrategy` URL-normalises before matching

The strategy decodes the URL once, rejects any traversal markers
(`..`, `%2F` after decode, NUL bytes, control characters), and
rejects captured `tenantId` values that retain `/`, `%`, or
non-printable bytes after decoding. Double-encoded payloads
(`%252e%252e`) are caught by the post-decode `%` guard.

### `SubdomainStrategy` strict-suffix match

The strategy enforces a labelled-suffix match: the host MUST end with
`'.' + baseDomain` and MUST NOT equal the apex domain. IPv4 / IPv6
literals are rejected. Hosts of the form
`attacker.evil.gertsai.dev.attacker.com` (where `gertsai.dev` is a
substring but not a labelled suffix) are rejected.

For tightest scope provide the optional `allowedHosts` whitelist:

```ts
new SubdomainStrategy({
  baseDomain: 'gertsai.dev',
  allowedHosts: ['tenantA.gertsai.dev', 'tenantB.gertsai.dev'],
});
```

## Cross-references

- [ADR-006 — Errors + Tenant Resolver placement / Wave 5 extraction policy](../../.forgeplan/adrs/ADR-006-errors-tenant-resolver-placement-session-additive-scoping-wave-5-extraction-policy.md)
- [PRD-003 — Wave 5: Errors + Runtime Context + Framework Adapters foundation](../../.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)
- Invariants: I-4 / I-5 (no Moleculer in core), I-11 (null-on-no-match),
  I-15 (`HeaderStrategy.trustProxy` opt-in), I-18 (default strict mode).

## License

Apache-2.0 — see the `LICENSE` symlink at the package root.
