# Service Context Extension

Extend your Moleculer services with typed custom properties using generics.

## Overview

The `ApiController` supports a third generic parameter `ServiceContext` that allows you to define typed custom properties on your service. This enables:

- **Type-safe access** to custom service properties (graphStore, cache, etc.)
- **Autocomplete** in your IDE for all service properties
- **Compile-time checks** for property access errors

## Quick Start

```typescript
import { ApiController, ServiceContextBase } from '@gerts/api-core';
import type { CypherGraphStore, GraphRAG } from '@gerts/graph';

// 1. Define your service context interface
interface GraphServiceContext extends ServiceContextBase {
  graphStore: CypherGraphStore;
  graphRAG: GraphRAG;
  ontologyCache: Map<string, any>;
}

// 2. Create typed controller
const controller = ApiController.resolveController<
  'v1',
  'graph',
  GraphServiceContext
>('v1', 'graph');

// 3. Initialize in started handler
controller.addStartedHandler(async (ctx) => {
  // ctx.service is Partial<GraphServiceContext> - assign properties
  ctx.service.graphStore = new CypherGraphStore({ ... });
  ctx.service.graphRAG = new GraphRAG({ ... });
  ctx.service.ontologyCache = new Map();

  ctx.logger?.info('Graph service initialized');
});

// 4. Access typed properties in actions
controller.register('query', {
  auth: 'none',
  params: typia.createValidateEquals<QueryParams>(),
  response: typia.createValidate<QueryResponse>(),

  async handler(ctx) {
    // ctx.service is fully typed as GraphServiceContext!
    const { graphRAG, ontologyCache } = ctx.service;

    const result = await graphRAG.query({
      question: ctx.params.question,
      tenantId: ctx.params.tenantId,
    });

    return ctx.respond(result);
  },
});
```

## Type System Design

### Two Contexts, Two Types

| Context | Type | Purpose |
|---------|------|---------|
| `addStartedHandler` / `addStoppedHandler` | `Partial<ServiceContext>` | Properties are optional (being added/removed) |
| Action handlers (`handler(ctx)`) | `ServiceContext` | Properties are required (fully initialized) |

### Why Partial in Lifecycle Handlers?

During `addStartedHandler`, your service properties **don't exist yet**. They are being assigned:

```typescript
controller.addStartedHandler(async (ctx) => {
  // Before: ctx.service.graphStore is undefined
  ctx.service.graphStore = new CypherGraphStore({ ... });
  // After: ctx.service.graphStore is CypherGraphStore
});
```

Using `Partial<ServiceContext>` correctly models this initialization phase.

### Why Full Type in Action Handlers?

By the time actions run, all `addStartedHandler` callbacks have completed. Your service is fully initialized:

```typescript
controller.register('query', {
  async handler(ctx) {
    // ctx.service.graphStore is guaranteed to exist
    const result = await ctx.service.graphStore.query(...);
  },
});
```

## Backward Compatibility

All generics have default values, so existing code works without changes:

```typescript
// This still works (no ServiceContext specified)
const controller = ApiController.resolveController('v1', 'users');

controller.register('list', {
  async handler(ctx) {
    // ctx.service is Moleculer.Service (base type)
  },
});
```

## Complete Example

```typescript
// services/graph/context.ts
import { ServiceContextBase } from '@gerts/api-core';
import type { CypherGraphStore, GraphRAG, GraphExtractor } from '@gerts/graph';
import type { MilvusAdapter, GeminiEmbedder } from '@gerts/vectordb';

export interface GraphServiceContext extends ServiceContextBase {
  // Core components
  graphStore: CypherGraphStore;
  graphRAG: GraphRAG;
  extractor: GraphExtractor;

  // Vector components
  embedder: GeminiEmbedder;
  vectorStore: MilvusAdapter;

  // Caches
  ontologyCache: Map<string, any>;

  // Settings
  settings: {
    questionAnalysis: { enabled: boolean };
    queryRouter: { enabled: boolean; defaultMode: string };
  };
}

// services/graph/lifecycle.ts
import { ApiController } from '@gerts/api-core';
import type { GraphServiceContext } from './context';
import config from '../project.config';

const controller = ApiController.resolveController<
  'v1',
  'graph',
  GraphServiceContext
>('v1', 'graph');

controller.addStartedHandler(async (ctx) => {
  const graph = await import('@gerts/graph');
  const vectordb = await import('@gerts/vectordb');

  // Initialize FalkorDB backend
  const backend = new graph.FalkorDBBackend({
    url: config.FALKORDB_URL
  });
  await backend.connect();

  // Initialize components
  ctx.service.graphStore = new graph.CypherGraphStore({ backend });
  ctx.service.embedder = new vectordb.GeminiEmbedder({
    apiKey: config.GEMINI_API_KEY
  });
  ctx.service.vectorStore = new vectordb.MilvusAdapter({ ... });
  ctx.service.graphRAG = await graph.createGraphRAGStack({ ... });
  ctx.service.ontologyCache = new Map();
  ctx.service.settings = config.graphSettings;

  ctx.logger?.info('Graph service initialized');
});

controller.addStoppedHandler(async (ctx) => {
  // Cleanup resources
  await ctx.service.graphStore?.close?.();
  await ctx.service.vectorStore?.close?.();
  ctx.service.ontologyCache?.clear();

  ctx.logger?.info('Graph service stopped');
});

// services/graph/actions/query.ts
import { ApiController } from '@gerts/api-core';
import type { GraphServiceContext } from '../context';
import typia from 'typia';

const controller = ApiController.resolveController<
  'v1',
  'graph',
  GraphServiceContext
>('v1', 'graph');

export const query = controller.register('query', {
  auth: 'none',
  params: typia.createValidateEquals<{
    question: string;
    tenantId: string;
    mode?: 'local' | 'global' | 'hybrid';
  }>(),
  response: typia.createValidate<{
    answer: string;
    sources: Array<{ id: string; text: string }>;
  }>(),
  rest: 'POST /query',

  async handler(ctx) {
    const { question, tenantId, mode = 'local' } = ctx.params;

    // Full type safety - IDE autocomplete works!
    const { graphRAG, settings } = ctx.service;

    // Check settings
    if (settings.questionAnalysis.enabled) {
      ctx.logger.info('Question analysis enabled');
    }

    // Execute query
    const result = await graphRAG.query({
      question,
      tenantId,
      options: { mode },
    });

    return ctx.respond({
      answer: result.answer,
      sources: result.sources,
    });
  },
});
```

## Helper Functions Pattern

For complex services, create typed helper functions:

```typescript
// services/graph/helpers.ts
import type { ActionHandlerCtx } from '@gerts/api-core';
import type { GraphServiceContext } from './context';

type GraphCtx = ActionHandlerCtx<any, any, any, GraphServiceContext>;

export function getGraphStore(ctx: GraphCtx) {
  const store = ctx.service.graphStore;
  if (!store) throw new Error('GraphStore not initialized');
  return store;
}

export function getGraphRAG(ctx: GraphCtx) {
  const rag = ctx.service.graphRAG;
  if (!rag) throw new Error('GraphRAG not initialized');
  return rag;
}

export function getSettings(ctx: GraphCtx) {
  return ctx.service.settings ?? {};
}
```

## API Reference

### ServiceContextBase

Base interface for extending. Always extend this when defining your context:

```typescript
interface ServiceContextBase {}

interface MyContext extends ServiceContextBase {
  myProperty: MyType;
}
```

### ApiController<V, N, S>

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| V | string | - | Service version (e.g., 'v1') |
| N | string | - | Service name (e.g., 'graph') |
| S | ServiceContextBase | ServiceContextBase | Custom service context |

### LifecycleHandlerContext<V, N, S>

Context passed to `addStartedHandler` and `addStoppedHandler`:

- `service: Moleculer.Service & Partial<S>` - Service with optional context properties

### ActionHandlerCtx<Auth, Params, Response, S>

Context passed to action handlers:

- `service: Moleculer.Service & S` - Service with required context properties
