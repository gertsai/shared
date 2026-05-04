<div align="center">

# @gertsai/core

### Core primitives for the gerts.ai platform

Type-safe building blocks for agentic systems: errors, results, retries, RAG, LLM routing,
text processing, hooks, sessions, and connector ACLs — all in one tier-3 package.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Fcore-cb3837?style=flat-square)](https://www.npmjs.com/package/@gertsai/core)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square)](./LICENSE)
[![Status](https://img.shields.io/badge/status-v0.1.0-orange?style=flat-square)](#status)
[![Tier](https://img.shields.io/badge/tier-3-purple?style=flat-square)](#status)

</div>

---

## Why @gertsai/core

- **One foundation, many domains.** Errors, `Result<T, E>`, retry, timeouts, IDs, logger, event
  bus, LRU cache, tokenization — the boring-but-essential primitives every gerts.ai package
  builds on top of.
- **RAG, codified.** A complete RFC-036 implementation lives under `@gertsai/core/rag`:
  request/response types, capabilities (grounding, observability, graph), SSE streaming events,
  Zod schemas, error taxonomy.
- **LLM abstraction with cost awareness.** `BaseLLM`, `ModelRouter`, OpenAI/Anthropic/Gemini
  providers, structured output (Zod → JSON Schema), and full re-exports from
  [`@gertsai/llm-costs`](../llm-costs) — 2,600+ models, 100+ providers.
- **Universal query system.** Type-safe `NLQuery`, `GraphQuery`, `VectorQuery`, `RAGQuery` with
  a pluggable executor registry and router (RFC-032).
- **Text processing pipeline.** Document/`TextNode` types, splitters, readers, parsers,
  metadata, deduplication, provenance, entity extraction schemas.
- **Security primitives.** Hooks (pre/post, background, priority), connector ACLs, deny-ledger
  with memory/postgres/redis/hybrid providers (RFC-042).

## Install

```bash
npm install @gertsai/core
# or
pnpm add @gertsai/core
# or
yarn add @gertsai/core
```

> **Build requirement.** This package uses [`typia`](https://typia.io/) for runtime validation,
> which requires the [`ts-patch`](https://github.com/nonara/ts-patch) TypeScript transformer.
> The `postinstall` hook runs `ts-patch install -s` automatically; the build command is `tspc`
> (not `tsc`). If you fork or extend this package, keep `ts-patch` and `tspc` in your toolchain.

Peer/runtime dependencies pulled in transitively: `@gertsai/llm-costs` (workspace), `zod`,
`gpt-tokenizer`, `llm-info`, `typia`, `zod-to-json-schema`.

## Quickstart

### Result + retry: composable, exception-free error handling

```typescript
import { ok, err, isOk, withRetry, type Result } from '@gertsai/core';

async function fetchUser(id: string): Promise<Result<User, string>> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) return err(`HTTP ${res.status}`);
  return ok(await res.json());
}

// Retry with exponential backoff + jitter on transient errors
const user = await withRetry(() => fetchUser('u_42'), {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 5_000,
});

if (isOk(user)) {
  console.log(user.value.email);
}
```

### Build a RAG response (RFC-036)

```typescript
import {
  type RAGResponse,
  createResponseId,
  createSourceId,
} from '@gertsai/core/rag';

const response: RAGResponse<{}> = {
  id: createResponseId(),
  object: 'rag.response',
  answer: 'Alice Chen is a senior engineer at NeuraTech.',
  sources: [
    {
      id: createSourceId(),
      text: 'Alice Chen works at NeuraTech as a senior engineer.',
      score: 0.95,
      documentId: 'doc_123',
      chunkIndex: 0,
    },
  ],
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  createdAt: new Date().toISOString(),
  tenantId: 'demo',
};
```

### Route an LLM call with cost-aware fallback

```typescript
import { createLLMWithFallback, calculateLlmCost } from '@gertsai/core/llm';

const llm = createLLMWithFallback({
  primary: { provider: 'openai', model: 'gpt-4o-mini' },
  fallbacks: [{ provider: 'anthropic', model: 'claude-3-5-haiku-latest' }],
});

const reply = await llm.call({
  messages: [{ role: 'user', content: 'Summarize RFC-036 in one sentence.' }],
});

const cost = calculateLlmCost('gpt-4o-mini', reply.usage);
console.log(`Tokens: ${reply.usage.totalTokens} · Cost: $${cost.totalCost}`);
```

## What you get

| Module | What it solves | Key exports |
|---|---|---|
| **`result`** | Rust-style `Result<T, E>` / `Option<T>`, no thrown exceptions for expected errors | `Result`, `ok`, `err`, `isOk`, `isErr`, `map`, `andThen` |
| **`errors`** | Unified `GertsError` taxonomy (RFC-053), gRPC-aligned `ErrorKind`, retryability | `GertsError`, `ErrorKind`, `ErrorSeverity` |
| **`retry`** | Exponential backoff + jitter, retryable-error detection | `withRetry`, `RetryConfig` |
| **`timeout`** | `withTimeout`, `deadline`, `raceWithTimeout`, `TimeoutController` | `TimeoutError`, `withTimeout`, `deadline` |
| **`ids`** | Prefixed ULIDs/UUIDs for typed entity IDs | `createId`, branded ID types |
| **`logger`** | Structured logger interface + console default | `Logger`, `createLogger` |
| **`event-bus`** | Typed pub/sub for cross-module events | `EventBus`, `EventHandler` |
| **`lru-cache`** | Bounded LRU with TTL | `LRUCache` |
| **`tokenization`** | `gpt-tokenizer` wrapper, factory by model name | `Tokenizer`, `createTokenizer` |
| **`llm`** | `BaseLLM`, OpenAI/Anthropic/Gemini providers, `ModelRouter`, structured output, full `@gertsai/llm-costs` re-export | `BaseLLM`, `ModelRouter`, `createLLM`, `zodToResponseFormat` |
| **`rag`** *(namespace)* | RFC-036 request/response, capabilities, SSE streaming, Zod schemas, error taxonomy | `RAGRequest`, `RAGResponse`, `RAGErrors`, `encodeSSE` |
| **`query`** | Universal query types: NL/Graph/Vector/RAG + executor + router (RFC-032) | `QueryRouter`, `createNLQuery`, `IQueryExecutor` |
| **`text`** | Documents, `TextNode`, splitters, readers, parsers, metadata, dedup, provenance | `Document`, `TextNode`, `TextSplitter`, `DocumentReader` |
| **`hooks`** | Pre/post hooks for agents/tools/LLM with priority + background execution | `hookManager`, `hook`, `LLMCallContext`, `ToolCallContext` |
| **`session`** | `GraphRAGSessionContext`, tenant config, multilingual/vector/agent reasoning configs | `createSession`, `TenantConfig`, `ResolvedTenantConfig` |
| **`streaming`** | Generic stream types and helpers | `StreamEvent`, streaming utilities |
| **`graph`** | Graph store interface (entities, relationships, traversal) | `GraphStore` |
| **`actuator`** | Health/readiness probes, lifecycle management | `Actuator` |
| **`agent`** | Agent base types and contracts | `Agent` types |
| **`providers`** | Provider configuration primitives | provider abstractions |
| **`connections`** | Connection lifecycle and pooling primitives | connection types |
| **`entity-reference`** | Stable references to graph/document entities | `EntityReference` |
| **`connectors`** | ACL models + indexing/sync status enums (RFC-042) | `ExternalAccess`, `DocumentAccess`, ACL prefixes |
| **`deny-ledger`** | Persistent access-deny store: memory / postgres / redis / hybrid (RFC-042) | `MemoryDenyLedger`, `PostgresDenyLedger`, `RedisDenyLedger`, `HybridDenyLedger` |

## Subpath imports

Three public entry points are declared in `package.json#exports`. Use the most specific
subpath to keep tree-shaking effective.

| Import | When to use |
|---|---|
| `import { ... } from '@gertsai/core'` | Cross-cutting primitives: result, retry, errors, timeout, hooks, query, text, session, deny-ledger, connectors, ids, logger, etc. |
| `import { ... } from '@gertsai/core/rag'` | RFC-036 RAG types directly (no namespace). Equivalent to `import { rag } from '@gertsai/core'` then `rag.RAGResponse`. |
| `import { ... } from '@gertsai/core/llm'` | LLM providers, `ModelRouter`, model registry, `@gertsai/llm-costs` re-exports, structured output. |

```typescript
// Top-level: most primitives
import { ok, err, withRetry, hookManager, MemoryDenyLedger } from '@gertsai/core';

// RAG subpath: skip the namespace
import { type RAGResponse, RAGErrors, encodeSSE } from '@gertsai/core/rag';

// LLM subpath: providers + cost integration
import { ModelRouter, calculateLlmCost, zodToResponseFormat } from '@gertsai/core/llm';
```

## Known limitations

- **`identity-resolver` not exported.** `connectors/identity-resolver.ts` was untracked
  upstream (excluded by a global `connectors/` `.gitignore` pattern). The export is
  commented out and will return in v0.1.x. `connectors/acl` and `connectors/enums` are
  unaffected. See [`KNOWN-ISSUES.md`](../../KNOWN-ISSUES.md) for the full list.

## Status

- **Version:** `0.1.0`
- **Tier:** 3 — depends on `@gertsai/llm-costs` (tier 2)
- **Build:** `tspc` (TypeScript + `ts-patch` + `typia` transformer). The `postinstall` hook
  installs the patch automatically.
- **Tests:** `vitest`. DB-integration tests for the deny-ledger (postgres / redis / hybrid)
  are skipped by default; they require a running database and run only in CI with Docker
  fixtures.
- **Stability:** APIs are usable but pre-1.0; minor breaks may land in `0.x` releases. Track
  changes in the monorepo `CHANGELOG.md`.
- **Peer warnings.** `@ryoppippi/unplugin-typia` declares `typescript@<5.9`; we ship 5.9.x.
  Build and tests still pass — see `KNOWN-ISSUES.md` §5.

## License

[Apache-2.0](./LICENSE)

<br>

<div align="center">

### Primitives. Type-safe. Composable.

Part of the [gerts.ai](https://gerts.ai) platform.

</div>
