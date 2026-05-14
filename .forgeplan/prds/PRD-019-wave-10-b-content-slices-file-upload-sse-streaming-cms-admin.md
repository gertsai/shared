---
depth: standard
id: PRD-019
kind: prd
last_modified_at: 2026-05-14T00:19:21.057127+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-018
  relation: based_on
status: active
title: 'Wave 10.B — content slices: file upload + SSE streaming + CMS admin'
---

## Problem Statement

Wave 10.A (PRD-018) shipped auth UI + production error UI + i18n foundation on `examples/m9s-example-web/`. The reference webapp still showcases only the **3 Wave 9 anonymous demo flows** (ingest text, search, docs). For a production-grade reference, three further capability slices remain in the PRD-016 deferred backlog:

1. **File upload** — drag-and-drop UI for multipart `POST /api/ingest/upload`, with progress bar and basic client-side validation (`< 10 MiB`, `text/plain` only for this slice; PDF/Word in Wave 10.C).
2. **Server-Sent Events (SSE)** streaming — `GET /api/stream/ingest` endpoint that emits per-document ingest progress events (`{kind:'started'|'embedding'|'persisted'|'done'|'error', docId, ts}`) consumable by the upload UI for live status.
3. **CMS admin route group** — `/admin/content` with list / view / delete for ingested documents, gated by `locals.user` populated in Wave 10.A's auth handler. Auth-required; redirects to `/login` if anonymous.

These slices are intentionally **scoped to the reference application** — they consume already-shipped `@gertsai/*` capabilities (entity-storage, runtime-context, errors taxonomy, rest-request-manager) and demonstrate how a downstream app wires them into a SvelteKit UI. No new `@gertsai/*` package surface is introduced.

## Goals

1. Drag-and-drop file upload UI works end-to-end against a new `POST /api/ingest/upload` Moleculer action (form-data multipart), with progress shown via XHR upload events; success/error rendered via the existing `Toast` component (5 variants from Wave 10.A).
2. `GET /api/stream/ingest` SSE endpoint streams 5+ progress event kinds for a `docId` query param; client `EventSource` displays a live status panel in the upload route; closes cleanly on `done` or 30s idle timeout.
3. `/admin/content` route group lists ingested docs (paginated 20/page) with a "Delete" button (form action, CSRF-protected via SvelteKit's built-in token); anonymous users redirected to `/login?next=/admin/content`; total Wave 10.B LOC < 1200; **0 new ESLint errors**; **0 new svelte-check errors**; all 3 e2e specs pass; pre-existing 70/71 backend tests still pass (1 known infra flake).

## Target Audience

- **Primary:** external developers using `examples/m9s-example` + `examples/m9s-example-web` as a starter template for their own `@gertsai/*`-based application; they need to see end-to-end patterns for file upload, real-time progress, and auth-gated admin UI.
- **Secondary:** internal contributors auditing the reference webapp for completeness against the PRD-016 deferred backlog before Wave 10.C (design system).
- **Tertiary:** the Wave 10 /audit reviewer (task #63) — needs traceable evidence that all 3 slices ship together with disjoint file ownership and zero regressions.

## Functional Requirements

- [ ] **FR-001 — File upload action (backend)**: an authenticated developer can POST a `multipart/form-data` request with a `file` field (≤10 MiB, `text/plain`) and optional `docId` to `/api/ingest/upload`; the handler decodes the file, calls the existing `ingest.document` pipeline, and returns `{docId, bytes, status: 'queued'}`. Oversized files return HTTP 413.
  - **Acceptance:** `curl -F file=@README.md http://localhost:3000/api/ingest/upload` returns `{docId, bytes, status}`; oversized file returns 413.
- [ ] **FR-002 — SSE streaming endpoint**: a client can open `GET /api/stream/ingest?docId=<uuid>` and receive 5 event kinds (`started`, `embedding`, `persisted`, `done`, `error`) as SSE-formatted frames; the connection auto-closes on `done`/`error` or after 30s idle.
  - **Acceptance:** `curl -N "http://localhost:3000/api/stream/ingest?docId=test-1"` while running upload prints 4-5 events ending with `kind:"done"`.
- [ ] **FR-003 — File upload UI route**: a user can drag-and-drop a `.txt` or `.md` file onto a dropzone on `/ingest`, see a progress bar driven by XHR `upload.progress`, and watch live status events streamed via `EventSource`; the existing form below remains usable.
  - **Acceptance:** dropping a 200 KB `.txt` on the page → progress bar fills → status panel shows 4-5 events ending in a success Toast.
- [ ] **FR-004 — CMS admin route group**: an authenticated user can visit `/admin/content`, see a paginated table of ingested documents (20/page, newest first), and delete one via a form-action POST that triggers `BaseEntityStorageService.softDelete`; an anonymous user is redirected to `/login?next=/admin/content`.
  - **Acceptance:** anonymous user visiting `/admin/content` is redirected to `/login`; authenticated user sees the list; delete button removes the row.
- [ ] **FR-005 — Backend list/delete actions**: developers can call `ingest.list-documents` (`{skip?, limit?}` → `{items, total}`) and `ingest.delete-document` (`{docId}` → soft-delete); both gated by `assertAuthenticated` and visible in `/openapi`.
  - **Acceptance:** both actions visible via `/openapi`; `curl -X POST -b "auth=<jwt>" http://localhost:3000/api/ingest/delete-document -d '{"docId":"abc"}'` returns 204.
- [ ] **FR-006 — E2E tests (Playwright)**: the test runner exercises the upload + SSE flow and the admin redirect + list + delete flow, and exits 0 against a running stack.
  - **Acceptance:** `pnpm --filter @gertsai-examples/m9s-example-web test:e2e` exits 0.

## Non-Functional Requirements

**NFR-1 — Security**
  - Multipart upload size cap 10 MiB enforced **server-side** (not just client) — defense-in-depth against CWE-770 (resource exhaustion).
  - SSE endpoint accepts only `docId` matching `/^[a-z0-9-]{8,64}$/` regex (no path traversal, no header injection via newline-injection in user input).
  - `/admin/*` SSR-redirect to `/login` on missing auth — **never** render a partial page client-side then redirect (prevents flash-of-protected-content).
  - Delete action is **form-action POST only** (CSRF-protected via SvelteKit's `+page.server.ts` form-action token); no DELETE-via-link GET.

**NFR-2 — Observability**
  - Each SSE connection logs `[sse] open docId=<id> userId=<id|anon>` and `[sse] close docId=<id> kind=<done|timeout|error>` via `createAppLogger`.
  - Upload action logs `[ingest.upload] bytes=<n> docId=<id>` (no body content — CWE-532 avoidance).

**NFR-3 — Performance**
  - SSE: each connection ≤ 64 KiB heap, idle timeout 30s, no per-message JSON re-encoding (build event string once, write directly).
  - File upload: stream parsing (don't buffer the entire file in memory before piping to the action — busboy/stream API).
  - Admin list: server-side pagination (20/page); no full table scan.

**NFR-4 — Backward compatibility**
  - Existing `/ingest` form action remains functional — dropzone is **additive** above it.
  - Wave 9 anonymous `/ingest`, `/search`, `/docs` routes remain anonymous-accessible.
  - Only the new `/admin/*` group is auth-gated.

**NFR-5 — i18n coverage**
  - All user-visible strings in new components go through paraglide `m.*()`.
  - `en.json` and `ru.json` end with identical key sets (Wave 10.A linter check stays green).

**NFR-6 — Test seam**
  - In-memory event-bus fallback for SSE so e2e tests don't depend on real BullMQ workers (deferred to Wave 10.C real-infra test).

## Stakeholders

- **Owner:** `@gertsai-examples/m9s-example-web` + `@gertsai-examples/m9s-example` reference app surface.
- **Consumers:** Future Wave 10.C (design system / Storybook) builds on these components. External developers using m9s-example as the reference template.
- **Reviewers:** Wave 10 /audit (planned task #63 after 10.C).

## Related Artifacts

- [[PRD-018]] — Wave 10.A foundation slices (auth + error UI + i18n) — the immediate prerequisite (provides `locals.user`, paraglide `m.*`, Toast component).
- [[PRD-016]] — Wave 10 super-PRD; this PRD closes 3 of its 7 deferred slices.
- [[PRD-017]] — Wave 9.0.1 maintenance; introduced `/openapi` route + session-guard e2e baseline used by FR-005.
- [[RFC-013]] — Wave 10.A 3-teammate strategy; proven blueprint re-applied here.
- [[RFC-014]] — Wave 10.B 3-teammate strategy doc (this PRD's implementation plan).
- [[EVID-033]] — Wave 10.A ship evidence; pre-flight reference for the team-lead.
- [[ADR-005]] — `@gertsai/storage-core` IStorageProvider, consumed by FR-005 list/delete.
- [[ADR-006]] — `@gertsai/errors` Shared Kernel; HTTP boundary scrub applies to new routes.

## Out of Scope

- PDF / Word file parsing (`pdf-parse` / `mammoth`) — Wave 10.C scope or later.
- Storybook + design-system component primitives — Wave 10.C scope.
- Multi-tenant document scoping — Wave 9.0.2 / future (tenant resolver wired but not enforced at admin route).
- Real BullMQ-backed SSE bridge — Wave 10.C real-infra concern.
- typia auto-derive of new actions — Wave 9.0.2 backlog.



