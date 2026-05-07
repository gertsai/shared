---
'@gertsai/tenant-resolver': minor
---

Initial release. Composable multi-strategy tenant resolution with security-hardened built-in strategies.

- `TenantResolverStrategy<Source>` interface + `TenantResolution` Value Object preserving strategy provenance.
- `ChainTenantResolver<Source>` with **default `mode: 'strict'`** (fail-closed per security review — throws `UnauthorizedError` from `@gertsai/errors` on no-match across all strategies). Optional `mode: 'optional'` requires explicit opt-in for non-tenant-isolated routes (health checks, public docs).
- Built-in strategies (security hardened):
  - `HeaderStrategy({ headerName, trustProxy: true })` — constructor throws if `trustProxy !== true` (forces consumer awareness of trusted-proxy contract; default-fail-secure per CWE-639/CWE-290).
  - `SubdomainStrategy({ baseDomain, allowedHosts? })` — strict labelled-suffix match; rejects IPv4/IPv6 literals; optional whitelist.
  - `PathStrategy({ pathPattern })` — URL-normalized match; rejects `..`, `.`, NUL, non-printable, `/`, `%` post-decode (covers double-encoded traversal).
- `/moleculer` subpath: `MoleculerCtxStrategy` reading `ctx.meta.tenantId` + `tenantMiddleware(resolver)` factory. Peer-optional `moleculer` import via `import type` only.
- `/http` subpath: `nodeHttpAdapter(req)` for Node `http.IncomingMessage` (type-only Node builtin import).
- `resolveTenantStrict(resolver, source)` standalone helper for non-chain throws.
- 62 tests including adversarial fixtures (header-spoof, path-traversal incl. double-encoded, subdomain-strict-suffix, chain-strict-mode).
