# RAG API Standard (RFC-036)

Universal types for RAG API responses. Provides capability-based composition for building type-safe RAG applications.

## Why This Exists

1. **No Universal Standard**: RAG APIs have no universal standard. Each platform (LangChain, LlamaIndex, Haystack, Cohere) uses its own format.

2. **Foundation for HTTP API**: Our gerts.ai HTTP API (RFC-030) uses these types. Without RFC-036, we'd have to define types inline.

3. **Reusability**: These types are used by:
   - `apps/pipeline` — HTTP API endpoints
   - `@gerts/agent` — Agent responses
   - `@gerts/graph` — GraphRAG queries
   - Future SDK packages (`@gerts/sdk-js`, `gerts-py`)

4. **Type Safety**: Zod schemas provide runtime validation + TypeScript inference.

## Installation

Already included in `@gerts/core`.

```bash
pnpm add @gerts/core
```

## Usage

### Import Options

```typescript
// Option 1: Namespace import (recommended, avoids name collisions)
import { rag } from '@gerts/core';
const response: rag.RAGResponse<{}> = { ... };

// Option 2: Direct import
import { RAGResponse, RAGRequest, encodeSSE } from '@gerts/core/rag';
```

### Basic Response

```typescript
import { rag } from '@gerts/core';

const response: rag.RAGResponse<{}> = {
  id: rag.createResponseId(),
  object: 'rag.response',
  answer: 'Alice Chen is a software engineer at NeuraTech.',
  sources: [{
    id: rag.createSourceId(),
    text: 'Alice Chen works at NeuraTech as a senior engineer.',
    score: 0.95,
    documentId: 'doc_123',
    chunkIndex: 0,
  }],
  usage: {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  },
  createdAt: new Date().toISOString(),
  tenantId: 'demo',
};
```

### With Capabilities

The response type dynamically includes additional fields based on requested capabilities:

```typescript
import { rag } from '@gerts/core';

// With grounding capability
const grounded: rag.RAGResponse<{ grounding: true }> = {
  // ... core fields ...
  grounding: {
    citations: [{
      id: rag.createCitationId(),
      sourceId: 'src_...',
      startChar: 0,
      endChar: 35,
      text: 'Alice Chen is a software engineer',
      confidence: 0.95,
    }],
    groundingScore: 0.95,
    mode: 'accurate',
  },
};

// With all capabilities
const full: rag.RAGResponse<{
  grounding: true;
  observability: true;
  graph: true;
}> = {
  // ... core fields ...
  grounding: { ... },
  observability: {
    retrieval: {
      strategy: 'hybrid',
      candidateCount: 100,
      usedCount: 10,
      rerankingApplied: true,
      latencyMs: 234,
    },
    generation: {
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 500,
      stopReason: 'end_turn',
      latencyMs: 890,
    },
    traceId: 'tr_abc123',
    spanId: 'sp_def456',
    latency: {
      totalMs: 1456,
      retrievalMs: 234,
      generationMs: 890,
    },
  },
  graph: {
    mode: 'local',
    entities: [{
      id: 'e1',
      name: 'Alice Chen',
      type: 'Person',
      description: 'Software engineer at NeuraTech',
    }],
    relationships: [{
      id: 'r1',
      source: 'e1',
      target: 'e2',
      type: 'works_at',
    }],
    subgraph: {
      nodes: [...],
      edges: [...],
    },
  },
};
```

### Request Validation

```typescript
import { rag } from '@gerts/core';

// Validate incoming request
const result = rag.safeValidateRAGRequest(requestBody);

if (result.success) {
  const validated = result.data;
  // validated.question, validated.tenantId, etc.
} else {
  const errors = rag.formatValidationErrors(result.error);
  // errors: [{ path: 'question', message: 'Question cannot be empty' }]
}
```

### Streaming (SSE)

```typescript
import { rag } from '@gerts/core';

// Create stream events
function* streamResponse(): Generator<string> {
  yield rag.encodeSSE(rag.createStartEvent('rag_123'));

  // Retrieval phase
  yield rag.encodeSSE({ type: 'rag.retrieval.start', strategy: 'hybrid' });
  yield rag.encodeSSE({ type: 'rag.retrieval.source', source: { ... } });
  yield rag.encodeSSE({ type: 'rag.retrieval.complete', count: 5, latencyMs: 234 });

  // Generation phase
  yield rag.encodeSSE({ type: 'text-start', messageId: 'msg_1' });
  yield rag.encodeSSE(rag.createTextDelta('Alice '));
  yield rag.encodeSSE(rag.createTextDelta('Chen '));
  yield rag.encodeSSE(rag.createTextDelta('works at NeuraTech.'));
  yield rag.encodeSSE({ type: 'text-end' });

  yield rag.encodeSSE(rag.createFinishEvent('complete'));
}

// Parse stream events
for await (const line of stream) {
  if (line.startsWith('data: ')) {
    const event = rag.decodeSSE<{}>(line.slice(6));

    if (rag.isTextDelta(event)) {
      process.stdout.write(event.textDelta);
    }
  }
}
```

### Error Handling

```typescript
import { rag } from '@gerts/core';

async function query(request: rag.RAGRequest): Promise<rag.RAGResult<{}>> {
  try {
    // Validate
    const parsed = rag.validateRAGRequest(request);

    // Execute
    const response = await doQuery(parsed);
    return { success: true, data: response };

  } catch (e) {
    if (e instanceof TimeoutError) {
      return { success: false, error: rag.RAGErrors.retrievalTimeout(5000) };
    }
    if (e instanceof RateLimitError) {
      return { success: false, error: rag.RAGErrors.rateLimited(60000) };
    }
    return { success: false, error: rag.RAGErrors.internal(e) };
  }
}

// Handle result
const result = await query(request);

if (rag.isSuccess(result)) {
  console.log(result.data.answer);
} else if (rag.isFailure(result)) {
  if (rag.isRetryable(result.error)) {
    // Retry after result.error.retryAfterMs
  }
  console.error(result.error.detail);
}
```

## API Reference

### Types

| Type | Description |
|------|-------------|
| `RAGRequest<C>` | Request with capability selection |
| `RAGResponse<C>` | Response with capability-based composition |
| `RAGStreamEvent<C>` | SSE event discriminated union |
| `RAGError` | Error (RFC 9457 + OpenAI format) |
| `RAGResult<C>` | Success / Failure / Partial result |
| `Source` | Retrieved source chunk |
| `Citation` | Citation linking answer to source |
| `Entity` | Graph entity |
| `Relationship` | Graph relationship |

### Capabilities

| Capability | Fields Added |
|------------|--------------|
| `grounding` | `citations`, `groundingScore`, `mode` |
| `observability` | `retrieval`, `generation`, `traceId`, `spanId`, `latency` |
| `graph` | `entities`, `relationships`, `subgraph`, `communities` |

### Branded IDs

| Function | Format |
|----------|--------|
| `createResponseId()` | `rag_<uuid>` |
| `createSourceId()` | `src_<uuid>` |
| `createCitationId()` | `cit_<uuid>` |

### Error Factory

| Function | HTTP Status |
|----------|-------------|
| `RAGErrors.validation(message, param?)` | 400 |
| `RAGErrors.invalidTenant(tenantId)` | 400 |
| `RAGErrors.tenantNotFound(tenantId)` | 404 |
| `RAGErrors.noSources()` | 200 |
| `RAGErrors.retrievalTimeout(timeoutMs)` | 504 |
| `RAGErrors.rateLimited(retryAfterMs)` | 429 |
| `RAGErrors.contentFiltered(reason?)` | 400 |
| `RAGErrors.graphConnectionFailed(cause?)` | 502 |
| `RAGErrors.internal(cause)` | 500 |
| `RAGErrors.serviceUnavailable(retryAfterMs?)` | 503 |

### Streaming Events

| Event Type | Phase |
|------------|-------|
| `start`, `finish`, `heartbeat` | Lifecycle |
| `text-start`, `text-delta`, `text-end` | Generation (Vercel AI SDK compatible) |
| `rag.retrieval.*` | Retrieval |
| `rag.grounding.*` | Grounding (if capability) |
| `rag.graph.*` | Graph (if capability) |
| `rag.complete`, `rag.usage` | Completion |
| `warning`, `error` | Errors |

## Design Principles

1. **Capability-Based Composition** (NOT level-based hierarchy)
   - Client chooses: `capabilities: ['grounding', 'graph']`
   - Response type includes only requested fields

2. **Interface Segregation**
   - Each capability is independent
   - No forced dependencies between capabilities

3. **RFC 9457 + OpenAI Errors**
   - Problem Details format
   - OpenAI-compatible `error` field
   - `retryable` and `retryAfterMs` for resilience

4. **Vercel AI SDK v5 Streaming**
   - Compatible with Vercel AI SDK
   - Extended with `rag.*` namespace

## Related

- [RFC-036 Specification](../../../apps/pipeline/docs/RFC-036-RAG-API-STANDARD.md)
- [RFC-030 HTTP API](../../../apps/pipeline/docs/RFC-030-UNIFIED-API-PROTOCOL.md)
