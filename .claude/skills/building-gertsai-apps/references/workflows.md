# Durable workflows with replay

## What & why

m9s-example builds durable, replay-capable workflows by writing a pure,
transport-agnostic `WorkflowDefinition<TInput, TOutput>` (from `@gertsai/core`)
in the application layer, then registering it onto the `ApiController` via
`setWorkflows()` from `@gertsai/api-core/moleculer`.

api-core adapts each definition into a Moleculer workflow schema and attaches it
to the synthesized service schema **before** `broker.start()`, where the
`@moleculer/workflows` middleware (gated on `REDIS_URL`, using Redis as the
durable event log) picks it up. A REST action triggers runs via
`broker.wf.run('<svc.fullName>.<key>', payload)` and either returns a job id
(async) or awaits `job.promise()` (sync).

Replay/idempotency comes from the middleware journaling step boundaries to
Redis: on worker crash the run restarts but skips already-journaled steps. The
durable event log is what makes the workflow survive a crash — without
`REDIS_URL` there is no `broker.wf`, no journal, and no replay.

The flow, end to end:

1. Author a pure `WorkflowDefinition` in the application layer (no Moleculer
   types).
2. Register it at module-load via `setWorkflows(controller, { key: def })`.
3. api-core adapts each definition into a `MoleculerWorkflowSchema` and writes
   the `workflows: {...}` block onto the synthesized service schema **before**
   `broker.start()`.
4. The `@moleculer/workflows` middleware (added only when `REDIS_URL` is set)
   reads `schema.workflows` during synchronous service creation and wires up
   `broker.wf`.
5. A REST trigger action calls `broker.wf.run('<svc.fullName>.<key>', payload)`
   and chooses sync (`await job.promise()`) or async (return job id).

## How it works in m9s-example

### Pure transport-agnostic WorkflowDefinition

- **What** — The workflow body is authored as a
  `WorkflowDefinition<TInput, TOutput>` from `@gertsai/core` — a plain object
  with `name`, `version`, `params`, and an `async handler(input, signal)`. No
  Moleculer types, no `ctx`, no `ctx.call`.
- **Why** — Decouples the workflow logic from the runtime so the same definition
  could later run on a non-Moleculer adapter (FastAPI/Go/Rust). Makes the handler
  trivially unit-testable with stub deps and keeps it inside the application
  layer (hexagonal core), not the transport edge.
- **How** — Export a factory `createXProcessWorkflow(deps): WorkflowDefinition<I, O>`
  that closes over injected use-case deps and returns
  `{ name, version, params, async handler(input, signal) { ... } }`. Keep the
  fastest-validator `params` literal co-located with the TS input interface.

### Factory + dependency injection for the definition

- **What** — Rather than a singleton, the workflow is produced by a factory that
  takes its dependencies (the `IngestDocumentUseCase`) as an argument.
- **Why** — Lets tests build an isolated definition with stub deps, and lets the
  composition root wire the production use case (bound to the shared
  infrastructure singleton). Keeps the handler pure — its only inputs are
  `input`, `signal`, and the closed-over deps.
- **How** —
  `export function createIngestProcessWorkflow(deps: { readonly useCase: IngestDocumentUseCase }) { const { useCase } = deps; return { ...handler delegates to useCase.execute(...) }; }`.

### Module-load registration via setWorkflows()

- **What** —
  `setWorkflows(controller, { process: createIngestProcessWorkflow({ useCase }) })`
  is called at module-load time in `lifecycle.ts`, NOT inside an
  `addStartedHandler`.
- **Why** — The `@moleculer/workflows` middleware reads `schema.workflows`
  during synchronous service creation (`broker.createService`), which fires
  BEFORE any `started()` callback. Deferring registration would leave an empty
  workflows block and `broker.wf.run(...)` would throw at runtime (per Sprint 3.1
  EVID-005 timing analysis).
- **How** — Resolve the controller, then at module top-level construct the use
  case from the composition-root singleton and call `setWorkflows`. The runtime
  workflow name is `<svc.fullName>.<registrationKey>` — registration key
  `'process'` on service `v1.ingest` yields `v1.ingest.process`. **The
  `WorkflowDefinition.name` field is cosmetic** (logs / introspection only) and
  does NOT drive the runtime address — only the registration KEY (the object key
  in `setWorkflows({ <key>: def })`) does. Trigger with the derived
  `<fullName>.<key>`, never with `def.name`.

### REDIS_URL-gated middleware + fail-fast trigger guard

- **What** — The `WorkflowsMiddleware` is only added to the broker when
  `config.REDIS_URL` is set (Redis is the durable event-log backend). The trigger
  action checks `broker.wf` exists before calling `.run(...)` and throws a
  precise 400 with an actionable hint if not.
- **Why** — Replay-after-crash relies on a durable journal; without Redis there
  is no `broker.wf`. The action-level guard converts an obscure `TypeError` into
  a clear `APIError(BAD_REQUEST, ...)` telling the operator to set REDIS_URL.
- **How** — In `moleculer.config.ts`:
  `if (config.REDIS_URL) middlewares.push(WorkflowsMiddleware({ adapter: { type: 'Redis', options: { url: config.REDIS_URL, prefix: '...' } }, schemaProperty: 'workflows' }))`.
  In the action:
  `const broker = service.broker as ServiceBroker & { wf?: WorkflowRunner }; if (!broker.wf || typeof broker.wf.run !== 'function') throw new APIError(ResponseCode.BAD_REQUEST, undefined, 'Workflows require REDIS_URL ...');`.

### Sync vs async run modes over broker.wf.run

- **What** — The REST action triggers `broker.wf.run(name, payload)` which
  returns `{ id, promise?() }`. A `sync` request flag selects between awaiting
  `job.promise()` (return final result) and returning the job id immediately
  (background run).
- **Why** — Async is the production default (fire-and-forget, poll later); sync
  is useful for curl demos and tests that assert end-state. The job handle is the
  durable identity the runtime tracks across replay.
- **How** —
  `const job = await broker.wf.run('v1.ingest.process', { docId, text, userId, metadata }); if (sync && typeof job.promise === 'function') { const result = await job.promise(); return respond({...result, workflowJobId: String(job.id)}, ...); } return respond({ status: 'started', workflowJobId: String(job.id), chunkCount: null }, ...);`.

### Determinism contract for safe replay

- **What** — Because the current handler collapses the pipeline into a single
  `useCase.execute()` call, the WHOLE use case re-runs on replay. This is
  documented as safe only because chunking is deterministic and the embedder is
  deterministic (Mock / seeded).
- **Why** — `@moleculer/workflows` replays by re-running the handler and reading
  already-journaled `ctx.call` results from the event log. With no internal
  journaled step boundaries, replay re-embeds — acceptable iff the embedder
  yields identical vectors for identical input. A non-deterministic embedder
  would corrupt state on replay.
- **How** — Keep replayed work deterministic, or restore the two-journaled-step
  split (`ctx.call('..._embed')` then `ctx.call('..._store')`) so already-embedded
  vectors are read from the journal and not recomputed. Document the chosen
  trade-off explicitly in the workflow's header.

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// ============================================================================
// FILE 1 — application/MyProcessWorkflow.ts
// Pure, transport-agnostic WorkflowDefinition. Lives in the application layer.
// ============================================================================
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';
import type { MyUseCase } from './MyUseCase';

export interface MyProcessInput {
  // TODO: payload shape the REST caller sends
  id: string;
  text: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface MyProcessResult {
  id: string;
  // TODO: result shape
  status: 'completed' | 'skipped-empty';
}

// Defensive size cap — fastest-validator min/max does not cover byte-size.
const MAX_INPUT_BYTES = 1_000_000;

// fastest-validator schema forwarded into the synthesized Moleculer workflow.
// Co-locate it with the TS input interface so they stay in sync.
const MY_PROCESS_PARAMS = {
  id: 'string',
  text: { type: 'string', min: 1 },
  userId: { type: 'string', optional: true, default: 'anonymous' },
  metadata: { type: 'object', optional: true },
} as const;

/**
 * Factory (not a singleton) so the handler stays pure: tests pass stub deps;
 * the composition root passes the production use case.
 */
export function createMyProcessWorkflow(deps: {
  readonly useCase: MyUseCase;
}): WorkflowDefinition<MyProcessInput, MyProcessResult> {
  const { useCase } = deps;

  return {
    name: 'my.process',
    version: 1,
    params: MY_PROCESS_PARAMS,

    // signal exposes runId + AbortSignal (+ optional meta). Thread it into
    // your ports if/when they accept cancellation; reserved otherwise.
    async handler(input: MyProcessInput, _signal: WorkflowSignal): Promise<MyProcessResult> {
      const { id, text, userId = 'anonymous', metadata } = input;
      if (text.length > MAX_INPUT_BYTES) {
        throw new Error(`Input too large (>${MAX_INPUT_BYTES} bytes)`);
      }
      // TODO: REPLAY SAFETY — this single call re-runs entirely on replay.
      // Safe ONLY if all work here is deterministic. If you have a
      // non-deterministic step (random ids, external mutation), split it
      // into journaled ctx.call boundaries instead (advanced).
      const result = await useCase.execute({ userId, id, text, metadata });
      return { id: result.id, status: 'completed' };
    },
  };
}

// ============================================================================
// FILE 2 — services/<svc>/lifecycle.ts
// Register at MODULE LOAD (not in addStartedHandler). Runtime name becomes
// `<svc.fullName>.<registrationKey>` => here `v1.my.process`.
// ============================================================================
import { setWorkflows } from '@gertsai/api-core/moleculer';
import { resolveExampleController } from '../../lib/example-controller';
import { MyUseCase } from '../../application/MyUseCase';
import { createMyProcessWorkflow } from '../../application/MyProcessWorkflow';
import { infrastructure } from '../../composition/infrastructure';
import type { MyServiceContext } from './types';

const controller = resolveExampleController<'v1', 'my', MyServiceContext>('v1', 'my');
controller.setRestBasePath('/');

// Use the module-load infrastructure singleton so the use case observes the
// same stores the rest of the app does.
const myUseCase = new MyUseCase(infrastructure);

// TODO: the cast bridges ApiController's Symbol-keyed hook to the
// ApiControllerInternalHook contract setWorkflows expects.
setWorkflows(controller as unknown as Parameters<typeof setWorkflows>[0], {
  process: createMyProcessWorkflow({ useCase: myUseCase }),
});

controller.addStartedHandler(async (ctx) => {
  ctx.service.useCase = myUseCase; // stash deps action handlers need
});

export { controller };

// ============================================================================
// FILE 3 — services/<svc>/src/actions/start-workflow.action.ts
// REST trigger. Gate on broker.wf; support sync vs async.
// ============================================================================
import type { ServiceBroker } from 'moleculer';
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import typia from 'typia';
import { resolveExampleController } from '../../../../lib/example-controller';
import type { MyServiceContext } from '../../types';

export interface StartWorkflowRequest {
  id: string;
  text: string;
  userId?: string;
  sync?: boolean; // true => await job.promise(); else return job id
}
export interface StartWorkflowResponse {
  id: string;
  workflowJobId: string;
  status: 'started' | 'completed' | 'skipped-empty';
}

// Local structural type — avoid coupling to @moleculer/workflows types.
interface WorkflowRunner {
  run: (name: string, payload?: unknown, opts?: unknown) => Promise<{ id: string; promise?: () => Promise<unknown> }>;
}

const controller = resolveExampleController<'v1', 'my', MyServiceContext>('v1', 'my');

export const startWorkflow = defineAction(controller.register('workflow', {
  auth: 'none', // TODO: 'required' in production; use session.user_uuid
  rest: 'POST /my/workflow',
  params: typia.createValidate<StartWorkflowRequest>(),
  response: typia.createValidate<StartWorkflowResponse>(),
  responseCode: ResponseCode.SUCCESS_CREATED,
  async handler({ params, service, logger, respond }) {
    const { id, text, sync } = params;
    const userId = params.userId ?? 'anonymous';

    // Gate: workflows require REDIS_URL — broker.wf is undefined without it.
    const broker = service.broker as ServiceBroker & { wf?: WorkflowRunner };
    if (!broker.wf || typeof broker.wf.run !== 'function') {
      throw new APIError(
        ResponseCode.BAD_REQUEST,
        undefined,
        'Workflows require REDIS_URL — set REDIS_URL=redis://... and restart',
      );
    }

    // Runtime name = `<svc.fullName>.<registrationKey>` => 'v1.my.process'.
    const job = await broker.wf.run('v1.my.process', { id, text, userId });

    if (sync && typeof job.promise === 'function') {
      const result = (await job.promise()) as { id: string; status: 'completed' | 'skipped-empty' };
      return respond(
        { id: result.id, workflowJobId: String(job.id), status: result.status },
        'Workflow completed',
        ResponseCode.SUCCESS_CREATED,
      );
    }
    return respond(
      { id, workflowJobId: String(job.id), status: 'started' },
      'Workflow started',
      ResponseCode.SUCCESS_CREATED,
    );
  },
}));

// ============================================================================
// FILE 4 — moleculer.config.ts (excerpt). Gate the middleware on REDIS_URL.
// ============================================================================
// import { Middleware as WorkflowsMiddleware } from '@moleculer/workflows';
// const middlewares: BrokerMiddleware[] = [];
// if (config.REDIS_URL) {
//   middlewares.push(
//     WorkflowsMiddleware({
//       adapter: { type: 'Redis', options: { url: config.REDIS_URL, prefix: 'myapp:wf:' } },
//       schemaProperty: 'workflows', // default; set explicitly for clarity
//     }) as unknown as BrokerMiddleware,
//   );
// }
// // export default { ...broker config..., middlewares };
```

## Best practices

- Author the workflow body as a pure `WorkflowDefinition<I,O>` from
  `@gertsai/core` (name/version/params/handler) — no Moleculer `ctx`, no
  transport types. Keep it in the application layer.
- Use a factory `createXWorkflow(deps)` that injects the use case, instead of a
  singleton — pure handler, easy to stub in tests, wired by the composition root.
- Call `setWorkflows(controller, { key: def })` at MODULE LOAD in
  `lifecycle.ts`, never inside `addStartedHandler` — the middleware reads
  `schema.workflows` during synchronous service creation, before any `started()`
  callback runs.
- Remember the runtime workflow name is `<service.fullName>.<registrationKey>`
  (e.g. key `'process'` on `v1.ingest` => `v1.ingest.process`). The
  `broker.wf.run(...)` call site MUST use this composed name, not the bare key.
- Gate `WorkflowsMiddleware` on `REDIS_URL` in `moleculer.config.ts` and ALSO
  guard `broker.wf` in the trigger action — throw a precise
  `APIError(BAD_REQUEST, undefined, '... set REDIS_URL ...')` rather than letting
  `broker.wf.run` TypeError out.
- Co-locate the fastest-validator `params` literal (`as const`) with the TS
  input interface so the workflow runtime validator and the compile-time shape
  stay aligned; re-validate only what the schema cannot express (e.g. byte-size
  caps).
- Type `broker.wf` and the job locally as a minimal structural interface
  (`run() => { id, promise?() }`) instead of importing `@moleculer/workflows`
  types — keeps api-core's type graph decoupled from the workflows package.
- Offer sync vs async run modes: default async returns `String(job.id)`
  immediately; `sync:true` awaits `job.promise()` and returns the final result
  (handy for curl/tests).
- Keep everything that gets replayed deterministic. If you must do
  non-deterministic work, split the pipeline into separate journaled `ctx.call`
  step boundaries so already-completed steps are read from the Redis event log
  instead of recomputed.
- Use a Redis key `prefix` (e.g. `'myapp:wf:'`) in the adapter options so
  parallel installs sharing one Redis instance do not collide.

## Pitfalls

- **DOC DRIFT**: `README.md:435-444` still describes the OLD two-step journaled
  shape (`ctx.call('v1.ingest._embed')` then `ctx.call('v1.ingest._store')`) and
  names a standalone `wf-ingest` service /
  `services/workflows/ingest-process.workflow.ts`. The CURRENT code
  (`IngestProcessWorkflow.ts` header, lines 30-39) collapsed this into a SINGLE
  `useCase.execute()` call and registers via `setWorkflows` on `v1.ingest`. Trust
  the code, not the README step list.
- Single-call replay re-runs the ENTIRE use case (including embedding) on a
  worker crash. This is only safe because chunking and the embedder are
  deterministic. A non-deterministic embedder (or any random-id /
  external-mutation step) will corrupt state on replay — you'd need to restore
  the journaled two-call split.
- Registering workflows inside `addStartedHandler` is a silent runtime failure:
  the `@moleculer/workflows` middleware reads `schema.workflows` before
  `started()` fires, so the workflows block is empty and
  `broker.wf.run('v1.x.process')` throws 'unknown workflow' at runtime. Always
  register at module load.
- Forgetting `REDIS_URL` means `broker.wf` is undefined — the durable event log
  (replay backend) does not exist. Without the action-level guard this surfaces
  as a cryptic TypeError; with it, a clear 400.
- Wrong workflow name at the call site: `broker.wf.run('process', ...)` (bare
  key) fails. The middleware composes `<svc.fullName>.<key>`; you must pass the
  full composed name (`'v1.ingest.process'`).
- The `signal: WorkflowSignal` (runId + AbortSignal) is passed to the handler but
  m9s does NOT propagate abort into the use case (ports don't accept one yet) —
  do not assume cooperative cancellation works out of the box; threading it is a
  TODO.
- The `setWorkflows(controller as unknown as Parameters<typeof setWorkflows>[0], ...)`
  cast is currently required: `ApiController` exposes the registration hook via a
  `Symbol.for('@gertsai/api-core:registerWorkflow')` key that is intentionally
  hidden from the emitted `.d.ts`, so the structural match to
  `ApiControllerInternalHook` is not nominal. Do not try to call the Symbol hook
  directly — always go through `setWorkflows`.
- No automated test ships for the workflow runtime (`README:474-476`) because it
  needs a real/fake Redis adapter — the replay path is verified manually. Don't
  assume CI covers crash-replay behavior.

## Canonical files

- [`examples/m9s-example/src/application/IngestProcessWorkflow.ts:110-180`](../../../examples/m9s-example/src/application/IngestProcessWorkflow.ts) —
  The canonical pure `WorkflowDefinition` factory. `createIngestProcessWorkflow(deps)`
  returns a `WorkflowDefinition<IngestProcessInput, IngestProcessResult>` with
  name/version/params/handler. Handler is pure — no Moleculer types — and
  delegates to the use case. Header JSDoc (lines 23-39) documents the determinism
  contract that makes single-call replay safe.
- [`examples/m9s-example/src/services/ingest/lifecycle.ts:95-104`](../../../examples/m9s-example/src/services/ingest/lifecycle.ts) —
  Registration site. Constructs the use case from the module-load infrastructure
  singleton and calls
  `setWorkflows(controller, { process: createIngestProcessWorkflow({ useCase }) })`.
  Lines 78-93 explain WHY this must happen at module-load (not inside
  addStartedHandler) — middleware reads `schema.workflows` before any `started()`
  callback.
- [`examples/m9s-example/src/services/ingest/src/actions/start-workflow.action.ts:96-185`](../../../examples/m9s-example/src/services/ingest/src/actions/start-workflow.action.ts) —
  REST trigger action. Resolves controller, registers `POST /ingest/workflow`,
  gates on `broker.wf` existence (400 if Redis absent), calls
  `broker.wf.run('v1.ingest.process', payload)`, and branches sync
  (`await job.promise()`) vs async (return job id).
- [`examples/m9s-example/moleculer.config.ts:189-265`](../../../examples/m9s-example/moleculer.config.ts) —
  Middleware wiring.
  `WorkflowsMiddleware({ adapter: { type: 'Redis', options: { url: REDIS_URL, prefix } }, schemaProperty: 'workflows' })`
  pushed onto the broker middleware list ONLY when `config.REDIS_URL` is set.
  Comment block lines 144-166 explains the durable-journal/replay rationale.
- [`packages/core/src/workflow/types.ts:16-88`](../../../packages/core/src/workflow/types.ts) —
  The language-neutral contract: `WorkflowDefinition<TInput, TOutput>`
  (name/version/params/handler), `WorkflowSignal` (runId + AbortSignal + optional
  meta), `WorkflowSignalMeta`, `WorkflowState`, `WorkflowRun`. Exported from
  `@gertsai/core` root.
- [`packages/api-core/src/moleculer/workflow/setWorkflows.ts:65-75`](../../../packages/api-core/src/moleculer/workflow/setWorkflows.ts) —
  `setWorkflows(controller, workflows)` public helper — iterates the registration
  map, adapts each definition, and calls the Symbol-keyed `REGISTER_WORKFLOW` hook
  on the controller. Exported from `@gertsai/api-core/moleculer`.
- [`packages/api-core/src/moleculer/workflow/adapter.ts:68-88`](../../../packages/api-core/src/moleculer/workflow/adapter.ts) —
  `adaptWorkflowDefinition(name, def)` converts a pure `WorkflowDefinition` into a
  `MoleculerWorkflowSchema`. The synthesized handler extracts `runId` from
  `ctx.id`, threads an `AbortSignal` from `ctx.locals.abortSignal` (or a fresh
  one), lifts `ctx.meta` into `WorkflowSignalMeta`, and forwards `ctx.params` as
  the typed input.
- [`packages/api-core/src/lib/controller/ApiController.class.ts:801-832`](../../../packages/api-core/src/lib/controller/ApiController.class.ts) —
  Controller internals: `_pendingWorkflows` map, the Symbol-keyed
  `[REGISTER_WORKFLOW]` hook that populates it, and
  `_attachWorkflowsToServices(synthSchema)` which writes the `workflows: {...}`
  block onto the synthesized service schema at start (line 1342, pre-broker.start).
- [`examples/m9s-example/README.md:426-476`](../../../examples/m9s-example/README.md) —
  Prose 'Workflow with replay' section: explains journaling-to-Redis,
  replay-skips-journaled-steps semantics, the curl async/sync examples, and the
  REDIS_URL gate. NOTE: its step list is stale vs current code (see pitfalls).

## @gertsai packages used

- `@gertsai/core` — `WorkflowDefinition`, `WorkflowSignal`, `WorkflowSignalMeta`,
  `WorkflowState`, `WorkflowRun` contracts.
- `@gertsai/api-core/moleculer` — `setWorkflows`, `adaptWorkflowDefinition`,
  `REGISTER_WORKFLOW` hook, `defineAction`.
- `@gertsai/api-core/contracts` — `APIError`, `ResponseCode`.
- `@gertsai/errors` — `InternalError`, `ValidationError` (thrown by the delegated
  use case).
- `@gertsai/session` + `@gertsai/session-guard` — `assertAuthenticated` /
  `assertSessionInTenant` in the use case the workflow delegates to.
