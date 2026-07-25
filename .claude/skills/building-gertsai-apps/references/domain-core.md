# Domain, ports & use-cases (hexagonal core)

## What & why

`m9s-example` implements a strict hexagonal (ports-and-adapters) core. It is
built from three concentric layers plus one wiring site:

- **`domain/`** — a pure layer of entities (`readonly` interfaces) and factory
  functions that guard invariants, plus the outbound **port interfaces** in
  `domain/ports/`. The domain has zero transport/infra coupling: its *only*
  `@gertsai` dependency is `@gertsai/errors`, used to signal invariant
  violations through the canonical error taxonomy. Some domain types (e.g.
  `chunk.ts`) have no dependencies at all.
- **`application/`** — class-based use-cases that orchestrate ports via
  constructor injection. A use-case never performs I/O itself; every side
  effect is delegated to a port (`IDocumentStore`, `IChunkStore`, `IEmbedder`,
  `IPermissionGate`, `IRotationStore`).
- **`composition/`** — a single composition root that wires concrete adapters
  to the port interfaces, selected per environment variable.

Because use-cases depend only on port interfaces, they are trivially
unit-testable with `vi.fn()` stubs, and the whole backend (memory vs Postgres,
mock vs Ollama vs OpenAI, allow-all vs OpenFGA) can be swapped by env var
without touching any `domain/` or `application/` code. That is the core promise
of hexagonal architecture, realised here end to end.

## How it works in m9s-example

### Pattern 1 — Pure domain entity + invariant-guarding factory

- **What.** Entities are `readonly` interfaces (`Document`, `Chunk`,
  `ChunkSearchHit`). A `createDocument(input)` factory validates invariants
  (non-empty `id`/`text`) and throws a typed `ValidationError` from
  `@gertsai/errors`, returning a normalised object.
- **Why.** Once an entity passes through its factory, use-cases can trust it
  without re-validating. Keeping entities as interfaces (not classes) keeps them
  serialisable and transport-free. The only allowed `@gertsai` import in the
  domain is the error taxonomy.
- **How.** Define `export interface X { readonly ... }` in `domain/*.ts`, then
  `export const createX = (input: X): X => { if (!invariant) throw new ValidationError({ message, details: { field, constraint } }); return {...}; }`.
  Spread optional fields conditionally:
  `...(input.metadata !== undefined && { metadata: input.metadata })`.

### Pattern 2 — Outbound ports as I-prefixed interfaces in `domain/ports/`

- **What.** Every external dependency (persistence, vector store, embeddings,
  authZ, token rotation) is expressed as a pure TypeScript interface in
  `domain/ports/`. No interface imports a concrete implementation; JSDoc merely
  names the real adapters (Milvus/pgvector, OpenAI/Ollama, OpenFGA).
- **Why.** Lets the entire backend be swapped (memory↔Postgres,
  mock↔Ollama↔OpenAI, allow-all↔OpenFGA) with zero changes to domain or
  application code — the swap happens only in the composition root.
- **How.** Create `domain/ports/IFoo.ts` exporting
  `export interface IFoo { method(args): Promise<Result>; }`. Use `import type`
  for any domain entities it references. Apply Interface Segregation: split a
  wide port (`IDocumentStore`) into narrow consumer-facing interfaces
  (`IDocumentStore` write / `IDocumentQuery` read /
  `ISoftDeletableDocumentStore`) plus a `FullDocumentStore = A & B & C`
  composition that concrete adapters implement; mark the wide composition
  `@deprecated` so new callers depend on the narrowest interface they need.
  `IRotationStore` additionally models failure modes as data via a
  discriminated-union `ConsumeResult` instead of throwing.

### Pattern 3 — Class-based use-case with constructor-injected deps

- **What.** Each use-case is a class taking a single `deps` object in its
  constructor (`private readonly deps`). It exposes one async
  `execute(input): Promise<result>` method. Inputs and outputs are pure data
  interfaces with no transport coupling.
- **Why.** Constructor injection is explicit and trivially mockable. A separate
  `Deps` interface (typed to ports, not impls) is what the composition root
  fulfils. The use-case does no I/O of its own — every side effect goes through
  a port — so it can be tested with stub adapters and reused across transports
  (HTTP action, BullMQ worker, workflow).
- **How.** Define `export interface FooDeps { readonly bar: IBar; ... }`,
  `export interface FooInput { readonly ... }`,
  `export interface FooResult { readonly ... }`. Then
  `export class FooUseCase { constructor(private readonly deps: FooDeps) {} async execute(input: FooInput): Promise<FooResult> { ... } }`.
  Inside `execute`: 1) optional session-guard assertions, 2) authZ via gate
  (fail-closed), 3) build entity via factory, 4) call ports, 5) return result.
  Throw typed `@gertsai/errors` (`ValidationError`, `InternalError`) for
  invariant/contract violations.

### Pattern 4 — Fail-closed authorization at the application boundary

- **What.** Use-cases call `gate.can(userId, action, resource)` and throw
  `permissionDenied(...)` (a `ForbiddenError`) when the gate returns false,
  before any side effect. Optional `@gertsai/session-guard` assertions
  (`assertAuthenticated`, `assertSessionInTenant`) run first when a `Session`
  is supplied.
- **Why.** Centralises authZ in the application layer (not scattered in
  transport handlers) and keeps it engine-agnostic via `IPermissionGate`. The
  session/tenant fields are OPTIONAL and additive so pre-existing callers
  passing only `userId` keep working (back-compat invariant).
- **How.** Guard block:
  `if (session !== undefined) { assertAuthenticated(session); if (expectedTenantId !== undefined) assertSessionInTenant(session, expectedTenantId); }`.
  Then
  `const allowed = await gate.can(userId, action, resource); if (!allowed) throw permissionDenied(userId, action, resource);`
  BEFORE building/persisting anything.

### Pattern 5 — Composition root as the single adapter-wiring site

- **What.** `composition/infrastructure.ts` is the only module that imports
  concrete adapters. `buildInfrastructure()` selects implementations per env var
  via small `pick*()` helpers and returns a `SharedInfrastructure` bag of ports;
  it is invoked once at module load
  (`export const infrastructure = buildInfrastructure()`).
- **Why.** Everywhere else depends on ports; only one file knows the full
  concrete graph. A module-level singleton guarantees both services (ingest,
  search) observe the SAME in-memory store instance, so an ingest is visible to
  a later search. Env-driven selection (memory/postgres, mock/ollama/openai,
  allow-all/openfga) makes the app runnable with zero env vars yet
  production-shaped when configured. It also enforces fail-closed boot (refuses
  the AllowAll gate under `NODE_ENV=production`).
- **How.** One `pickX(): IX` function per port, each `switch`-ing on a config
  value and throwing if a required env var is missing. Return an interface bag
  typed to ports (`SharedInfrastructure`). Export the built singleton. Lifecycle
  handlers then `new FooUseCase({ ...infrastructure })` and stash the use-case
  on the service context.

### Pattern 6 — Transport-agnostic `WorkflowDefinition` wrapping a use-case

- **What.** A durable/replayable workflow is expressed as `@gertsai/core`'s
  `WorkflowDefinition<TInput, TOutput>` (name/version/params/handler) built by a
  factory `createIngestProcessWorkflow({ useCase })`. The handler delegates the
  whole pipeline to one `useCase.execute(...)` call; the Moleculer adaptation
  happens later via api-core's `setWorkflows()`.
- **Why.** Keeps the workflow body free of Moleculer types (handler takes
  `(input, signal)`, not a `Context`) so it stays unit-testable and
  transport-independent. The factory shape (not a singleton) lets tests
  construct an isolated definition with stub deps. Co-locating the
  fastest-validator `params` with the TS interface keeps validation and type in
  sync.
- **How.**
  `export function createFooWorkflow(deps: { readonly useCase: FooUseCase }): WorkflowDefinition<In, Out> { return { name, version, params: PARAMS_AS_CONST, async handler(input, _signal) { /* defensive guards */ return mapResult(await deps.useCase.execute(...)); } }; }`.
  Be aware of replay semantics: a single-call handler re-runs the entire
  use-case on replay — fine only with deterministic embedders.

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// ============================================================================
// 1) DOMAIN ENTITY — domain/<entity>.ts
//    Pure type + invariant-guarding factory. Only @gertsai import allowed in
//    the domain is the error taxonomy.
// ============================================================================
import { ValidationError } from '@gertsai/errors';

export interface FooMetadata {
  // TODO: optional, transport-free metadata fields
  readonly source?: string;
}

export interface Foo {
  readonly id: string;
  readonly text: string;
  readonly metadata?: FooMetadata;
}

/** Factory: validates invariants so use-cases can trust the entity. */
export const createFoo = (input: Foo): Foo => {
  if (!input.id || input.id.trim().length === 0) {
    throw new ValidationError({
      message: 'Foo.id must be non-empty',
      details: { field: 'id', constraint: 'non-empty' }, // TODO: never put secrets in details
    });
  }
  // TODO: add remaining invariant checks
  return {
    id: input.id,
    text: input.text,
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };
};

// ============================================================================
// 2) OUTBOUND PORT — domain/ports/IFooStore.ts
//    Interface only. NEVER import a concrete adapter here. Apply ISP: keep the
//    interface as narrow as the consumer that needs it.
// ============================================================================
import type { Foo } from '../<entity>';

export interface IFooStore {
  /** Persist. Implementations document their upsert/throw policy. */
  save(doc: Foo): Promise<void>;
  /** Returns null when not found (and excludes soft-deleted rows). */
  findById(id: string): Promise<Foo | null>;
  // TODO: split read/query/delete concerns into separate interfaces per ISP,
  //       then `export type FullFooStore = IFooStore & IFooQuery & ...;`
}

// ============================================================================
// 3) USE-CASE — application/DoSomethingUseCase.ts
//    Class + constructor-injected deps (typed to PORTS, never impls). No I/O
//    except through ports. Optional session-guard assertions are additive.
// ============================================================================
import { InternalError, ValidationError } from '@gertsai/errors';
import type { Session } from '@gertsai/session';
import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';

import { createFoo, type FooMetadata } from '../domain/<entity>';
import type { IFooStore } from '../domain/ports/IFooStore';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';
import { permissionDenied } from '../shared/errors';

export interface DoSomethingDeps {
  readonly fooStore: IFooStore;
  readonly gate: IPermissionGate;
  // TODO: add other ports (embedder, chunkStore, ...)
}

export interface DoSomethingInput {
  readonly userId: string;
  readonly docId: string;
  readonly text: string;
  readonly metadata?: FooMetadata;
  readonly session?: Session;          // optional, additive
  readonly expectedTenantId?: string;  // optional, additive
}

export interface DoSomethingResult {
  readonly docId: string;
}

export class DoSomethingUseCase {
  constructor(private readonly deps: DoSomethingDeps) {}

  async execute(input: DoSomethingInput): Promise<DoSomethingResult> {
    const { userId, docId, text, metadata, session, expectedTenantId } = input;
    const { gate, fooStore } = this.deps;

    // (a) optional session-guard assertions — skipped when session is absent
    if (session !== undefined) {
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) {
        assertSessionInTenant(session, expectedTenantId);
      }
    }

    // (b) AuthZ — fail closed, before any side effect
    const allowed = await gate.can(userId, 'do-something', docId); // TODO: action verb
    if (!allowed) throw permissionDenied(userId, 'do-something', docId);

    // (c) build domain entity (validates invariants)
    const doc = createFoo({
      id: docId,
      text,
      ...(metadata !== undefined && { metadata }),
    });

    // (d) delegate side effects to ports; throw typed errors on contract breach
    if (text.trim().length === 0) {
      throw new ValidationError({ message: 'text required', details: { field: 'text' } });
    }
    // TODO: example contract check
    // if (vectors.length !== n) throw new InternalError({ message: '...', details: {...} });

    await fooStore.save(doc);
    return { docId: doc.id };
  }
}
```

## Best practices

- Keep the domain layer free of transport/infra imports. The ONLY `@gertsai`
  dependency allowed in `domain/` is `@gertsai/errors` for the canonical
  taxonomy used by entity factories; `chunk.ts` has zero deps at all.
- Model entities as `readonly` interfaces, not classes, and ship a `createX()`
  factory that validates invariants and throws a typed `ValidationError`. After
  the factory, use-cases trust the entity without re-validating.
- Express every external dependency as an I-prefixed interface in
  `domain/ports/`. Type use-case `Deps` against these interfaces — never against
  concrete adapter classes.
- Use constructor injection with a single `deps` object
  (`constructor(private readonly deps: XDeps)`) and one
  `execute(input): Promise<result>` method. Inputs/outputs are pure data
  interfaces.
- Apply Interface Segregation: when a port grows wide, split it at the consumer
  boundary (e.g. `IDocumentStore` write port vs `IDocumentQuery` read projection
  vs `ISoftDeletableDocumentStore`) and offer a `Full*Store = A & B & C`
  intersection only for adapters; mark the wide composition `@deprecated`.
- Fail closed on authZ: call `gate.can(...)` and throw `permissionDenied(...)`
  BEFORE any persistence/side effect. Run optional `assertAuthenticated` /
  `assertSessionInTenant` first when a `Session` is supplied.
- Make new auth/tenant parameters OPTIONAL and additive so existing callers keep
  working (the ADR-010 I-2/I-3 back-compat invariant); guard them behind
  `if (session !== undefined)`.
- Throw the `@gertsai/errors` taxonomy (`ValidationError` for caller mistakes,
  `InternalError` for broken port contracts, `ForbiddenError` via
  `permissionDenied`) — not bare `Error` — so the transport layer can map kinds
  to HTTP/gRPC codes. Never put secrets/PII in the `details` bag.
- Confine all concrete-adapter knowledge to one composition root
  (`composition/infrastructure.ts`). Select impls via small `pickX()` helpers
  switching on env vars; build once and export a singleton bag of ports. Throw
  at boot if a required env var is missing, and refuse insecure defaults (e.g.
  AllowAll gate) under `NODE_ENV=production`.
- Keep cross-cutting concerns OUT of the use-case: caching is applied by the
  inbound Moleculer adapter, not inside `SearchDocumentsUseCase`;
  logging/tracing are injected via the service context, not the shared infra
  bag.
- For durable workflows, wrap a use-case in a `WorkflowDefinition` factory from
  `@gertsai/core` (handler takes `(input, signal)`, no Moleculer types); let
  api-core's `setWorkflows()` do the transport adaptation at registration.
- Unit-test use-cases with `vi.fn()` stubs typed to the port interfaces (see
  `tests/ingest-use-case.test.ts` `makeDeps()`). Because the use-case does no
  real I/O, no DB/HTTP is needed — this is the payoff of the hexagonal core.
- Put a neutral error kernel in `shared/` (not `composition/`) so
  domain/application/infra/services can all import it without inverting hex
  direction — this exact move was forced by audit EVID-029.

## Pitfalls

- **Inverted hex direction:** importing from `composition/` or
  `infrastructure/` inside `application/` or `domain/`. The audit (EVID-029)
  caught `application/ -> composition/` and relocated the error kernel to
  `shared/`. Domain/application may depend on ports and the shared kernel only.
- **Importing a concrete adapter** (`DocumentRepository`, `MockEmbedder`,
  `OpenFgaPermissionGate`) anywhere outside the composition root. Use cases must
  depend on the port interface, never the impl.
- **Per-service adapter construction instead of a shared singleton:** the
  original m9s shape called `new MemoryVectorStore()` in each lifecycle,
  producing TWO independent in-memory stores so search always returned 0
  results. The composition root singleton fixes this for in-memory mode.
- **Workflow replay with a non-deterministic embedder:** `IngestProcessWorkflow`
  delegates the whole pipeline to one use-case call, so a crash mid-run re-runs
  embedding on replay. Safe only with deterministic embedders; otherwise the
  embed and store steps must be split into two journaled calls (documented
  TODO).
- **Forgetting the back-compat guard on optional session/tenant fields:**
  calling `assertAuthenticated(session)` unconditionally breaks pre-existing
  callers that pass only `userId`. Always guard with `if (session !== undefined)`.
- **Trusting an adapter's contract blindly:** the use-case re-checks
  `vectors.length === chunkTexts.length` and throws `InternalError` on mismatch.
  Skipping such port-contract assertions lets bad adapter output corrupt
  persisted data.
- **Putting unbounded inputs through:** `SearchDocumentsUseCase` clamps `topK`
  (`DEFAULT_TOP_K`/`MAX_TOP_K`) and `IngestProcessWorkflow` enforces
  `MAX_INPUT_BYTES`. Missing these defensive bounds is a DoS vector.
- **Leaking secrets/PII into `error.details`** — these may be serialised; rely
  on the redaction set but never assume it, and keep details to field/constraint
  metadata.
- **Building the AllowAllPermissionGate (or any dev default) in production.** The
  composition root must fail-closed at boot under `NODE_ENV=production`
  (ADR-011 I-12).

## Canonical files

All paths are relative to the repository root; `:line` marks the most relevant
declaration.

- `examples/m9s-example/src/domain/document.ts:39` — Domain entity (`Document`) +
  `DocumentMetadata` + `createDocument` factory that throws `ValidationError`
  from `@gertsai/errors` on empty id/text — the canonical "pure entity with
  invariant-guarding factory" pattern.
- `examples/m9s-example/src/domain/chunk.ts:7` — Domain entities `Chunk` +
  `ChunkSearchHit` — readonly data shapes, zero dependencies (not even
  `@gertsai/errors`), the purest domain type.
- `examples/m9s-example/src/domain/ports/IDocumentStore.ts:54` — Outbound write
  port; demonstrates the Interface Segregation split (`IDocumentStore` narrow
  write port, `IDocumentQuery` read projection, `ISoftDeletableDocumentStore`,
  `FullDocumentStore` composition) with `@deprecated` on the god-interface.
- `examples/m9s-example/src/domain/ports/IEmbedder.ts:10` — Outbound port for
  embeddings — interface only, JSDoc names the real adapters
  (OpenAI/Ollama/mock) without importing any of them.
- `examples/m9s-example/src/domain/ports/IPermissionGate.ts:11` — Outbound authZ
  port; single `can(userId, action, resource)` method that lets enforcement
  engines (allow-all dev, OpenFGA prod) be swapped with zero domain change.
- `examples/m9s-example/src/domain/ports/IRotationStore.ts:56` — Outbound port
  for refresh-token jti tracking using a discriminated-union `ConsumeResult` —
  example of modelling failure modes as data, not exceptions.
- `examples/m9s-example/src/application/IngestDocumentUseCase.ts:93` — Canonical
  use-case: constructor-injected deps interface (`IngestDocumentDeps`), pure data
  Input/Result, `execute()` orchestrating authZ -> build entity -> chunk ->
  embed -> persist; optional session/session-guard assertions (additive,
  back-compat).
- `examples/m9s-example/src/application/SearchDocumentsUseCase.ts:70` — Second
  use-case showing the same skeleton + input validation + `clampTopK` defensive
  bounds (`DEFAULT_TOP_K` / `MAX_TOP_K`); JSDoc explicitly states caching lives
  OUTSIDE the use-case (in the inbound adapter).
- `examples/m9s-example/src/application/IngestProcessWorkflow.ts:110` —
  Transport-agnostic `WorkflowDefinition<TInput, TOutput>` from `@gertsai/core`;
  factory `createIngestProcessWorkflow(deps)` wraps a use-case so it can be
  journaled by `@moleculer/workflows` without leaking Moleculer types into the
  domain.
- `examples/m9s-example/src/composition/infrastructure.ts:96` — Composition root
  — `buildInfrastructure()` picks concrete adapters per env var
  (`STORAGE_PROVIDER`, `EMBEDDER_PROVIDER`, `AUTH_GATE`, `REDIS_URL`) and exports
  a single `infrastructure` `SharedInfrastructure` bag; the only place that
  imports concrete adapters.
- `examples/m9s-example/src/shared/errors.ts:40` — Neutral error kernel —
  re-exports `@gertsai/errors` taxonomy + `permissionDenied(userId, action, resource)`
  factory; importable from domain/application/infra/services without violating
  hex direction (moved out of `composition/` after audit EVID-029).
- `examples/m9s-example/src/infrastructure/allow-all-permission.gate.ts:12` —
  Concrete adapter implementing `IPermissionGate` — shows the
  `class X implements IPort` pattern living in `infrastructure/`, not `domain/`.
- `examples/m9s-example/src/services/search/lifecycle.ts:32` — Wiring point:
  lifecycle started-handler constructs `new SearchDocumentsUseCase({...infrastructure})`
  and stashes it on the service context — the seam between composition root and
  inbound transport.
- `examples/m9s-example/tests/ingest-use-case.test.ts:17` — `makeDeps()` builds
  all ports as `vi.fn()` stubs typed to the port interfaces — the canonical proof
  that the hexagonal core is unit-testable with zero infra.

## @gertsai packages used

- `@gertsai/errors` — canonical error taxonomy (`ValidationError`,
  `InternalError`, `ForbiddenError`) used by domain factories, use-cases, and the
  `shared/errors.ts` kernel.
- `@gertsai/session` — `Session` type passed (optionally) into use-cases.
- `@gertsai/session-guard` — `assertAuthenticated` / `assertSessionInTenant`
  guards run at the application boundary.
- `@gertsai/core` — `WorkflowDefinition<TInput, TOutput>` for transport-agnostic
  durable workflows.
- `@gertsai/tenant` — tenant identity used by session/tenant assertions.
- `@gertsai/entity-storage` — backend for the document/chunk storage adapters.
- `@gertsai/rest-request-manager` — used by HTTP-based adapters (e.g. embedders).
- `@gertsai/pg-client` — Postgres-backed storage adapter selected by the
  composition root.
- `@gertsai/auth-openfga` — OpenFGA-backed `IPermissionGate` adapter (production).
- `@gertsai/api-core` — `setWorkflows()` and the Moleculer transport adaptation
  for inbound actions and workflows.
