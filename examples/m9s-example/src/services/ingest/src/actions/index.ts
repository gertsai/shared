/**
 * Ingest service action exports. Mirrors the pipeline pattern.
 *
 * Order is significant only for side-effect registration: each action
 * file calls `controller.register(...)` at module-load time, so importing
 * this barrel registers the full surface in one go.
 */
export * from './ingest-document.action';
// Internal sub-actions originally consumed by the journaled
// `wf-ingest.ingest.process` workflow. Sprint 3.1 §W-7 collapsed the
// workflow onto pure use-case delegation (`v1.ingest.process`), so these
// are now unused from the workflow path but kept as stable internal
// entry points (no `rest:` field on either action).
export * from './embed-batch.action';
export * from './store-chunks.action';
// Workflow trigger — public REST endpoint (POST /ingest/workflow).
export * from './start-workflow.action';

// Wave 10.B (PRD-019 / RFC-014) — content slices.
//   - upload-document: multipart file upload (busboy)  [owner: F]
//   - list-documents:  paginated list (admin CMS)      [owner: C]
//   - delete-document: soft-delete via storage         [owner: C]
export * from './upload-document.action';
export * from './list-documents.action';
export * from './delete-document.action';
