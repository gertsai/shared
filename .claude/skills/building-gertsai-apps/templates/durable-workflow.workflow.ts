// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
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
    // NOTE: `name` is cosmetic (logs / introspection only). The runtime address is
    // `<svc.fullName>.<registrationKey>` — the KEY passed to setWorkflows, NOT this field.
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
