---
"@gertsai/api-core": minor
"@gertsai/api-rlr": minor
"@gertsai/core": minor
---

Sprint 2 — api-core decomposition Phase A (per ADR-003 + SPEC-002).

**`@gertsai/api-core` v0.2.0** — three subpath exports без breaking changes:

- `@gertsai/api-core/contracts` — pure types (APIError, ResponseCode, response envelope, OpenAPI helpers). Zero runtime side effects, zero peer deps на Moleculer/BullMQ/dotenv/GCP. Safe для browser, FastAPI clients, Rust ts-types.
- `@gertsai/api-core/moleculer` — Moleculer-specific runtime (ApiController, queues, channels, OAuth, gateway, **workflows experimental stub**). Lazy-init.
- `@gertsai/api-core/runtime/node` — Node.js-specific factories (`loadConfig`, `createGcpLoggerStream`). Opt-in side effects.

Root `@gertsai/api-core` остаётся backward-compatible через deprecated reexports с JSDoc warnings — но **больше не экспортирует `loadConfig`** (move на `/runtime/node`).

**`@gertsai/core` v0.2.0** — language-neutral workflow contracts:

- `WorkflowDefinition`, `WorkflowRun`, `WorkflowSignal`, `WorkflowState`, `WorkflowStepResult`, `EventEnvelope` — single source of truth для всех runtime adapters (Moleculer сейчас, FastAPI/Go/Rust позже).

**`@gertsai/api-rlr` v0.2.0** — migrated к `@gertsai/api-core/contracts` subpath. Per-package tsconfig override на ESNext+Bundler для resolver compatibility.

**Migration guide для consumers**:

```typescript
// BEFORE (v0.1.x)
import { APIError, ResponseCode } from '@gertsai/api-core';
import { ApiController } from '@gertsai/api-core';
import { loadConfig } from '@gertsai/api-core'; // ← removed

// AFTER (v0.2.x)
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { ApiController } from '@gertsai/api-core/moleculer';
import { loadConfig } from '@gertsai/api-core/runtime/node';
```

Root imports continue to work для `APIError`/`ApiController`/etc., но triggers JSDoc deprecation warning. `loadConfig` requires explicit subpath migration.

**Breaking surface only**: `loadConfig` no longer reexported from root. Workaround — explicit subpath. All other v0.1.x APIs preserved через root reexports.

Refs: PRD-001, ADR-003 (Platform Runtime Boundaries), SPEC-002 (Sprint 2 checklist), EVID-002 (smoke), EVID-003 (Sprint 2 evidence).
