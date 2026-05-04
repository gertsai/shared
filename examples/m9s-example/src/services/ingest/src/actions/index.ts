/**
 * Ingest service action exports. Mirrors the pipeline pattern.
 *
 * Order is significant only for side-effect registration: each action
 * file calls `controller.register(...)` at module-load time, so importing
 * this barrel registers the full surface in one go.
 */
export * from './ingest-document.action';
// Internal sub-actions consumed by the `wf-ingest.ingest.process` workflow.
// Not exposed over REST (no `rest:` field on either action).
export * from './embed-batch.action';
export * from './store-chunks.action';
// Workflow trigger — public REST endpoint (POST /ingest/workflow).
export * from './start-workflow.action';
