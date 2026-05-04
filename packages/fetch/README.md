<div align="center">

# @gertsai/fetch

### A Fetch API on top of undici — with SSRF guards built in

A thin, opinionated HTTP client for Node.js. Wraps [undici](https://undici.nodejs.org/)'s
`request()` in a Fetch-shaped surface, normalizes bodies and responses, and ships SSRF
protection, body-size limits, and request timeouts as defaults — not afterthoughts.

<br>

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-000.svg?style=flat-square)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@gertsai/fetch?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@gertsai/fetch)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6?style=flat-square)](./src/index.ts)

</div>

---

## Why @gertsai/fetch

- **Fetch-shaped, undici-fast.** `ResponseLike` mirrors `ok` / `status` / `headers` / `json()` / `text()` / `arrayBuffer()` over undici's `request()` — no Node global `fetch` quirks.
- **Secure by default.** SSRF validation is **on**. Localhost, RFC1918, link-local, cloud-metadata (`169.254.169.254`), `0.0.0.0`, and broadcast are blocked unless you opt in.
- **DoS-aware body resolution.** Sync and async iterables are drained with a hard `maxBodySize` ceiling (default 50 MB). No unbounded buffers.
- **Timeouts that actually fire.** A single `timeout` option drives both `headersTimeout` and `bodyTimeout` on undici. Default 30 s.
- **Tier 1, zero internal deps.** One runtime dep (`undici`). Drop it into any package without dragging the monorepo with it.

## Install

```bash
npm i @gertsai/fetch
# or
pnpm add @gertsai/fetch
```

Requires Node.js >= 22.

## Quickstart

```ts
import { httpCaller } from '@gertsai/fetch';

const res = await httpCaller('https://api.example.com/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Jane', email: 'jane@example.com' }),
  timeout: 5_000,
  security: {
    ssrfProtection: true,
    maxBodySize: 10 * 1024 * 1024,
    allowedHostnames: ['api.example.com'],
  },
});

if (!res.ok) {
  throw new Error(`HTTP ${res.status} ${res.statusText}`);
}

const user = await res.json<{ id: string }>();
```

Internal call to a private host? Opt in explicitly:

```ts
import { httpCaller } from '@gertsai/fetch';

await httpCaller('http://redis.internal:6379/health', {
  security: { allowPrivateNetworks: true, allowedHostnames: ['redis.internal'] },
});
```

## What you get

| Feature | What it does | Default |
|---|---|---|
| **`httpCaller` / `makeRequest`** | Fetch-shaped wrapper around `undici.request`. Returns `ResponseLike`. | — |
| **SSRF guard** | Blocks loopback, RFC1918, link-local, cloud metadata, `0.0.0.0`, broadcast. Allow/blocklists supported. | on |
| **Body resolver** | Handles `string`, `Uint8Array`, `ArrayBuffer`, `DataView`, `Blob`, `URLSearchParams`, `FormData`, sync + async iterables. | — |
| **Body size limit** | Caps streamed iterables before they hit the wire. Throws on overflow. | 50 MB |
| **Timeout** | Single `timeout` knob → undici `headersTimeout` + `bodyTimeout`. | 30 s |
| **Header normalization** | Multi-value response headers collapsed into a Fetch `Headers` object. | — |
| **`validateUrl` / `assertSafeUrl`** | Standalone SSRF utilities — usable outside the fetcher. | — |

## API surface

```ts
// Fetchers
httpCaller(url, init?)          // Promise<ResponseLike> — primary entry
makeRequest(url, init?)         // Promise<ResponseLike> — low-level, identical
resolveBody(body, maxSize?)     // body normalizer (exported for testing)
default                         // re-export of httpCaller

// URL validation (standalone, no fetcher required)
validateUrl(url, config?)       // → { valid, error?, url? }
assertSafeUrl(url, config?)     // → URL, throws on SSRF
createUrlValidator(config)      // → { validate, assert } with preset config

// Types
ResponseLike, RequestOptions, HttpMethod, FetcherFunction, HttpErrorResponse
FetchSecurityConfig, UrlValidatorConfig, UrlValidationResult, UndiciRequestOptions
```

`RequestOptions` extends undici's `RequestInit` with `timeout`, `retries`, and a
`security: FetchSecurityConfig` block (`ssrfProtection`, `allowLocalhost`,
`allowPrivateNetworks`, `maxBodySize`, `allowedHostnames`, `blockedHostnames`).

## Status

| | |
|---|---|
| **Version** | `0.1.0` |
| **Node** | `>= 22` |
| **Tests** | 40 (vitest) |
| **Tier** | 1 — no internal `@gertsai/*` deps |
| **Monorepo** | [`@gertsai/shared`](../../README.md) |

Run locally:

```bash
pnpm --filter @gertsai/fetch build
pnpm --filter @gertsai/fetch test
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).
