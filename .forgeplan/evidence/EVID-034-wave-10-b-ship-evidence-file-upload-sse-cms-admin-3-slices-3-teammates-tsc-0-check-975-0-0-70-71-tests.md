---
depth: standard
id: EVID-034
kind: evidence
last_modified_at: 2026-05-14T00:40:05.813473+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-019
  relation: informs
- target: RFC-014
  relation: informs
status: active
title: Wave 10.B ship evidence — file-upload + SSE + CMS admin — 3 slices / 3 teammates / tsc 0 / check 975-0-0 / 70-71 tests
---

## Summary

Wave 10.B ships three additive content-slice capabilities on `examples/m9s-example-web/` (+ supporting backend on `examples/m9s-example/`): drag-and-drop file upload with XHR progress bar, Server-Sent Events streaming of ingest lifecycle, and an auth-gated `/admin/content` CMS route group with paginated list + soft-delete. Three parallel teammates with disjoint file ownership shipped ~1300 LOC in one wave. All smoke gates green: backend tsc clean, web svelte-check 975 files / 0 errors / 0 warnings, lint clean, 70/71 backend tests passing (1 pre-existing pg-vector read-only-FS infra flake — unrelated to this wave, documented in [[EVID-032]] as well).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: internal-test-result + manual-verification

`congruence_level: CL3` because the smoke ran against this exact m9s-example monorepo target (same-target validation, not a related project), via the project's own type-check, svelte-check, lint, and Vitest harness. R_eff contribution = max(0, 1.0 − 0.0) = 1.0.

## What was built

**Slice F — file-upload (teammate `m9s-file-upload-teammate/v1`):**
- `examples/m9s-example/src/services/ingest/src/multipart-parser.ts` (NEW, 187 LOC) — busboy wrapper with 10 MiB / 1 file / 8 fields / 32 header-pairs caps; emits `PayloadTooLargeError` on breach.
- `examples/m9s-example/src/services/ingest/src/actions/upload-document.action.ts` (REPLACE stub, 232 LOC) — REST `POST /api/v1/ingest/upload` via moleculer-web `passReqResToParams: true`; UTF-8 decode + docId regex validation + `crypto.randomUUID()` fallback; delegates to existing `v1.ingest.document` via `broker.call`; maps `PayloadTooLargeError → ResponseCode.PAYLOAD_TOO_LARGE` (HTTP 413).
- `examples/m9s-example-web/src/lib/stores/upload.ts` (NEW, 47 LOC) — shared `lastUpload` writable store consumed by S's SSE panel.
- `examples/m9s-example-web/src/routes/ingest/+page.svelte` (MODIFY +110 LOC at `WAVE-10-B/F:*` markers) — dropzone div with drag-over/drag-leave/drop handlers + hidden file input + `<progress>` bar driven by `XMLHttpRequest.upload.onprogress`; client-side 10 MiB / `.txt|.md` validation; writes to `lastUpload` store on success.
- `examples/m9s-example-web/e2e/upload.spec.ts` (NEW, 46 LOC) + `e2e/fixtures/sample.txt` — Playwright spec gated on `RUN_E2E=1`.

**Slice S — sse-streaming (teammate `m9s-sse-streaming-teammate/v1`):**
- `examples/m9s-example/src/services/ingest/src/sse-emitter.ts` (NEW, ~75 LOC) — module-level `EventEmitter` keyed by docId with `setMaxListeners(50)` + wildcard channel.
- `examples/m9s-example/src/mol-services/sse-ingest.handler.ts` (NEW, ~120 LOC) — moleculer-web alias function `(IncomingMessage, ServerResponse) → void`; docId regex `^[a-z0-9-]{8,64}$`; SSE headers + `flushHeaders()`; idempotent cleanup; 30s idle timeout; `req.on('close')`/`res.on('close')` teardown.
- `examples/m9s-example-web/src/lib/sse-client.ts` (NEW, ~115 LOC) — browser `EventSource` wrapper with JSON-decoded event handling, terminal `done`/`error` auto-close, `SseCloseReason` discriminator.
- `examples/m9s-example/src/mol-services/api.service.ts` (MODIFY +27 LOC) — new `/api/stream` route with `bodyParsers: false`, empty `use:` chain (no rate-limiter on long-lived streams), alias `'GET ingest'` pointing to the SSE handler.
- `examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts` (MODIFY +25 LOC, additive only) — emits `started` → `embedding` → `persisted` → `done` lifecycle on every document (synthetic `embedding` event in inline mode for full 4-event sequence); `error` event in catch.
- `examples/m9s-example-web/src/routes/ingest/+page.svelte` (MODIFY +86 LOC at `WAVE-10-B/S:*` markers) — `$effect` opens SSE on `$lastUpload` change; exhaustive switch over `SseEventKind`; panel with icons + i18n labels + relative timestamps.

**Slice C — cms-admin (teammate `m9s-cms-admin-teammate/v1`):**
- `examples/m9s-example/src/services/ingest/src/actions/list-documents.action.ts` (REPLACE stub, 136 LOC) — `GET /api/v1/ingest/list?skip=&limit=`; typia validation; `assertAuthenticated` from `@gertsai/session-guard`; transport-boundary clamp on skip/limit (limit ≤ 100); returns `{items, total, skip, limit}`.
- `examples/m9s-example/src/services/ingest/src/actions/delete-document.action.ts` (REPLACE stub, 104 LOC) — `POST /api/v1/ingest/delete`; typia regex `^[A-Za-z0-9_-]{1,128}$`; idempotent soft-delete; logs `docId` + `operatorUuid` (no PII per CWE-532).
- `examples/m9s-example/src/domain/ports/IDocumentStore.ts` (MODIFY +71 LOC) — extended port with `listSummaries(opts)` / `count()` / `softDelete(id)` + `DocumentSummary` / `ListDocumentsOpts` types.
- `examples/m9s-example/src/infrastructure/document.repository.ts` (MODIFY +55 LOC) — implements new port methods via inherited `BaseEntityStorageService.list/count/delete`; in-memory sort/filter excludes `status === 'deleted'`.
- `examples/m9s-example/src/infrastructure/pg-document.repository.ts` (MODIFY +62 LOC) — implements new port methods via raw SQL; **schema caveat**: `documents` table lacks `deleted_at`, so PG `softDelete` degrades to hard delete (JSDoc-documented; tracked for future migration).
- `examples/m9s-example-web/src/routes/(admin)/admin/+layout.server.ts` (NEW, 24 LOC) — SSR 302 redirect to `/login?next=<url>` when `locals.user` is unset.
- `examples/m9s-example-web/src/routes/(admin)/admin/+layout.svelte` (NEW, 67 LOC) — amber-accent admin chrome + sub-nav.
- `examples/m9s-example-web/src/routes/(admin)/admin/content/+page.server.ts` (NEW, 138 LOC) — `load` reads `?skip=&limit=`, calls backend; `actions.delete` POSTs to `/api/v1/ingest/delete`.
- `examples/m9s-example-web/src/routes/(admin)/admin/content/+page.svelte` (NEW, 172 LOC) — 5-col table; native `confirm()` on delete; pagination via prev/next buttons + `Intl.DateTimeFormat`.
- `examples/m9s-example-web/src/routes/+layout.svelte` (MODIFY +19 LOC) — conditional "Admin" nav link rendered only when `data.user` is set.
- `examples/m9s-example-web/e2e/admin.spec.ts` (NEW, 97 LOC) — Playwright spec with 3 cases (anon redirect / authed list / delete flow), `RUN_E2E`-gated.

**Pre-seed by team-lead (`team-lead-wave-10-b/v1`):**
- `examples/m9s-example/package.json` — added `busboy@^1.6.0` + `@types/busboy@^1.5.4`.
- `examples/m9s-example-web/messages/{en,ru}.json` — 30 new keys (`upload_*`, `sse_*`, `admin_*`, `nav_link_admin`) keeping en/ru parity invariant.
- `examples/m9s-example/src/services/ingest/src/actions/index.ts` — 3 new exports.
- `examples/m9s-example-web/src/routes/ingest/+page.svelte` — 6 marker comments (`WAVE-10-B/{F,S}:{SCRIPT-IMPORTS,STATE,DROPZONE|STATUS-PANEL}`) for disjoint regions.
- Created `examples/m9s-example-web/src/routes/(admin)/admin/content/` directory skeleton.

## Smoke results (2026-05-14 ≈ 03:38 UTC)

| Gate | Command | Result |
|---|---|---|
| Backend tsc | `pnpm --filter @gertsai-examples/m9s-example exec tsc --noEmit` | **0 errors** |
| Web check | `pnpm --filter @gertsai-examples/m9s-example-web check` | **975 files · 0 errors · 0 warnings** |
| Workspace lint | `pnpm lint` (eslint --max-warnings 0) | **0 errors, 0 warnings** |
| Backend tests | `pnpm --filter @gertsai-examples/m9s-example test` | **70/71 PASS** (1 pre-existing `pg-vector` read-only FS infra flake) |
| paraglide compile | `npx paraglide-js compile --project ./project.inlang --outdir ./src/paraglide` | **Success** (46 → 60 keys per locale) |

The 1 test failure is `tests/e2e.test.ts > search round-trip` failing in `PgVectorStore.search` → `PgClientAdapter.$queryRaw` → `pg-pool` with "Read-only file system" — a Postgres container infra issue documented as pre-existing in EVID-033. Wave 10.B did not modify the affected code path.

## Acceptance criteria status (PRD-019)

- [x] **FR-001** — `POST /api/v1/ingest/upload` action accepts multipart, returns `{docId, bytes, status: 'queued'}`, rejects oversized with 413.
- [x] **FR-002** — `GET /api/stream/ingest?docId=...` SSE endpoint emits 5 lifecycle kinds, auto-closes on terminal, 30s idle timeout.
- [x] **FR-003** — `/ingest` route now has additive dropzone + progress bar; existing form unchanged.
- [x] **FR-004** — `/admin/content` route group: SSR 302 to `/login` for anon; paginated list for authed; delete via form action POST.
- [x] **FR-005** — `ingest.list-documents` + `ingest.delete-document` actions visible via `/openapi`, both `assertAuthenticated`-gated.
- [x] **FR-006** — `e2e/upload.spec.ts` + `e2e/admin.spec.ts` exist with skip flags wired (run via `RUN_E2E=1`).

All 6 NFRs verified in code (10 MiB server-side cap, docId regex hardening, SSR-only redirect, form-action CSRF, in-memory SSE seam, i18n parity).

## Non-trespass verification

All 6 `WAVE-10-B/{F,S}:*` markers in `routes/ingest/+page.svelte` survive — verified via `grep -c "WAVE-10-B"` returning 6. No teammate touched another's region. Pre-seeded `messages/{en,ru}.json` unchanged by teammates. Backend action `index.ts` barrel exports unchanged.

## R_eff (target ≥ 0.5)

```
R_eff = min(evidence_scores) = min(1.0 [supports CL3]) = 1.0
```

R_eff = 1.0 — well above the 0.5 activation gate.

## References

- [[PRD-019]] — Wave 10.B requirements doc.
- [[RFC-014]] — Wave 10.B 3-teammate strategy.
- [[PRD-018]] / [[EVID-033]] — Wave 10.A scaffolding consumed (locals.user, paraglide m.*, Toast).
- [[ADR-005]] — `@gertsai/storage-core` IStorageProvider (port extension by C).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel (HTTP boundary scrub applies to new routes).




