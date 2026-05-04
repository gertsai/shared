/**
 * Type-safe controller wrapper for m9s-example services.
 *
 * Mirror of `apps/pipeline/src/lib/pipeline-controller.ts` — a thin facade
 * over `ApiController.resolveController<V, N, S>()` that lets each domain
 * service supply its own `ServiceContext` interface so action handlers see
 * `ctx.service.<thing>` strongly typed without per-call casts.
 *
 * @example
 * ```typescript
 * import { resolveExampleController } from '../../lib/example-controller';
 *
 * interface IngestServiceContext extends ServiceContextBase {
 *   useCase: IngestDocumentUseCase;
 *   queue: IngestQueueHandle;
 * }
 *
 * const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>(
 *   'v1',
 *   'ingest',
 * );
 *
 * controller.addStartedHandler(async (ctx) => {
 *   ctx.service.useCase = new IngestDocumentUseCase(...);
 * });
 * ```
 */
import { ApiController } from '@gertsai/api-core';
import type { ServiceContextBase } from '@gertsai/api-core';

export function resolveExampleController<
  V extends string,
  N extends string,
  S extends ServiceContextBase = ServiceContextBase,
>(version: V, name: N) {
  return ApiController.resolveController<V, N, S>(version, name);
}
