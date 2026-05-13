---
depth: standard
id: PRD-016
kind: prd
last_modified_at: 2026-05-13T21:57:56.809795+00:00
last_modified_by: claude-code/2.1.139
status: draft
title: Wave 10 — production-grade web UI (auth UI / CMS / file upload / SSE / i18n / Storybook / error UI)
---


# PRD-016: Wave 10 — production-grade web UI (auth UI / CMS / file upload / SSE / i18n / Storybook / error UI)

**STATUS: DRAFT** — placeholder for the next sprint after Wave 9 ships. Captures the 7 deferred scopes from PRD-015 §Out of Scope so they are tracked as `pending` forgeplan artifacts rather than living in a comment.

## Problem Statement

Wave 9 ships m9s-example-web as a functional but minimal full-stack reference: 4 routes, allow-all gate, text-only ingest, no UI for auth/i18n/file upload/etc. This is sufficient to demonstrate **the end-to-end type-safe RPC pattern**, but insufficient to demonstrate **production-grade SaaS UX**.

Wave 10 closes that gap by adding 7 capability slices to `examples/m9s-example-web/` (and minor backend extensions for auth + file ingest endpoints).

## Target Audience

| Persona | Pain after Wave 9, before Wave 10 |
|---|---|
| New `@gertsai/*` adopter | Sees demo but cannot copy a real auth flow / CMS pattern; has to invent both |
| Product owner evaluating for production | "Where's login? File upload? Multi-language?" — answers required for serious eval |
| Frontend engineer copying the example | Has to wire i18n + design system + error UI themselves; reference value bounded |
| Security reviewer | No auth UI = no demo of session lifecycle, JWT refresh, logout — incomplete security narrative |

## Scope — 7 capability slices

### Slice 1: Auth UI flow

- Backend: `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/refresh` endpoints (returns JWT pairs)
- Frontend: `/login` route with form, JWT storage in cookie (httpOnly), middleware-driven redirect for unauthenticated users on protected routes
- Frontend: `/logout` action — clears cookie, redirects to `/login`
- `openapi-fetch` middleware: proactive token refresh ~60s before expiry, reactive 401 retry (mirror pipeline `apps/webapp/src/shared/api/client.ts` auth middleware)
- Backend: minimal JWT issuer (HS256 with shared secret from env; demo only) OR delegate to `@gertsai/auth` if available

**Out**: OAuth providers (Google/GitHub/Apple), SAML, magic-link email, MFA — all "future enterprise" features

### Slice 2: Multi-page CMS / admin

- New routes: `/admin`, `/admin/tenants`, `/admin/users`, `/admin/settings`
- Tenant switcher in nav (dropdown reading from `X-Tenant-ID` header registry)
- User management table (read-only Wave 10; CRUD optional Wave 11)
- Settings page exposing env-equivalent runtime config (read-only)
- Permissions gating via `assertSessionInTenant` + `ForbiddenError` UI

### Slice 3: File upload

- Backend: `/api/v1/files/upload` multipart endpoint accepting `application/pdf`, `text/plain`, `text/markdown`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
- File text extraction (use a parser library — likely `pdf-parse` + `mammoth`)
- Wire extracted text through existing `v1.ingest.document` flow
- Frontend: drag-drop `<input type="file">` zone with progress indicator, MIME validation, size limit (10 MB)
- Multiple-file batch ingest

### Slice 4: Streaming responses (SSE)

- Backend: `/api/v1/events/stream` SSE endpoint subscribed to `document.indexed` + `document.deleted` channels
- Authenticated stream with tenant filtering
- Frontend: `EventSource` consumer in nav header → toast / counter increment on each event
- Search results page: live-refresh when new document matches active query (debounced)
- Backend `@moleculer/channels` integration to publish events from BullMQ workers

### Slice 5: i18n

- Toolkit: `paraglide-js` (compile-time i18n, zero runtime overhead — matches SvelteKit philosophy)
- 2 locales: `en` (default), `ru` (because user comments in Russian)
- All UI strings tagged + translated
- Server-side locale negotiation from `Accept-Language` header + cookie override
- `/profile/settings` includes locale dropdown

### Slice 6: Storybook / design system showcase

- Install `@storybook/sveltekit@^8`
- Stories for ~10 primitives: Button, Card, Input, Textarea, Select, Dialog, Toast, Skeleton, Badge, Table
- Component library lives in `examples/m9s-example-web/src/lib/ui/`
- Story includes: variants (default/primary/secondary/destructive), states (loading/disabled/error), accessibility notes
- `pnpm --filter ...-web storybook` script

### Slice 7: Production-grade error UI

- Skeleton placeholders during server load
- Error boundaries per route via `+error.svelte`
- Toast system: success / info / warning / error / loading variants
- Offline banner using `navigator.onLine` + service worker hook
- Optimistic UI for ingest action (show pending row, reconcile on backend ack)
- Form validation: typia-derived client-side schema validation + server-side error display
- Network retry indicator (visual feedback when `openapi-fetch` middleware retries 5xx)

## Functional Requirements

**DRAFT** — see Wave 10 sprint kickoff for full FR table. Per-slice FRs to be expanded when PRD-016 is promoted from DRAFT to active. Initial high-level FRs:

- FR-1 — Slice 1 (Auth UI): Login form route exists; JWT issued by backend; openapi-fetch middleware refreshes tokens 60s before expiry; logout clears cookie
- FR-2 — Slice 2 (CMS): /admin route group exists; tenant switcher in nav; user table read-only
- FR-3 — Slice 3 (File upload): /api/v1/files/upload multipart accepts pdf/docx/md/txt up to 10 MB; extracted text routed through existing v1.ingest.document
- FR-4 — Slice 4 (SSE): /api/v1/events/stream emits document.indexed and document.deleted events; web consumer updates counters live
- FR-5 — Slice 5 (i18n): `paraglide-js` integrated with `en` + `ru` locales; Accept-Language negotiation
- FR-6 — Slice 6 (Storybook): @storybook/sveltekit installed; 10 primitives have stories
- FR-7 — Slice 7 (Error UI): Skeleton placeholders + error boundaries + toast system + offline banner + optimistic UI

Each FR will be expanded into per-slice acceptance criteria when Wave 10 sprint planning begins.


## Goals (placeholder — to be measurable when PRD-016 is filled in detail)

- **G-1** — All 7 slices ship together in Wave 10 OR explicitly split into Wave 10.1 / 10.2 etc. if scope exceeds 2 weeks
- **G-2** — `examples/m9s-example-web/` becomes a credible SaaS-template that production teams can fork and ship within 2 weeks
- **G-3** — Backwards compat: every Wave 9 route + flow continues to work post-Wave-10
- **G-4** — No `@gertsai/*` package source modification (Wave 10 stays application-only) UNLESS Slice 1 auth requires new `@gertsai/auth-*` capability — then a separate companion ADR

## Estimated effort

| Slice | LOC est | Risk |
|---|---|---|
| 1. Auth UI | ~400 src + ~80 backend + ~50 test | Medium (JWT lifecycle) |
| 2. CMS admin | ~500 src + minimal backend | Low |
| 3. File upload | ~250 src + ~150 backend + parser deps | Medium (MIME / size limits) |
| 4. SSE streaming | ~200 src + ~150 backend channels | Medium (backpressure handling) |
| 5. i18n | ~200 src + locale files | Low |
| 6. Storybook | ~600 src (stories) + config | Low |
| 7. Error UI | ~300 src + retry middleware | Low |
| **Total** | **~2880 LOC** | Sizeable — likely 2-week sprint or split |

This is large enough to warrant **either** splitting into Wave 10 + Wave 10.1 + Wave 10.2 (each a 1-week sprint) **or** running as a single 2-week Deep depth sprint with PRD + 2 SPECs (auth + CMS) + RFC + 1-2 ADRs.

Decision deferred until PRD-016 is properly filled. Currently DRAFT to capture scope.

## Out of Scope (Wave 11+)

- OAuth providers (Google / GitHub / Microsoft / Apple)
- Magic link / passwordless email auth
- MFA / TOTP
- WebAuthn / passkeys
- Self-service signup
- Billing / subscription UI (Stripe integration)
- Email templates / transactional email
- Audit log UI
- Webhooks management
- API keys management
- Real-time collaboration (CRDT-driven simultaneous editing)
- Search filters / facets / advanced query syntax
- Vector index health dashboard

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-015 / RFC-011 / ADR-014 / EVID-031 | informs — Wave 9 baseline this Wave 10 extends |
| EVID-029 | informs — original Wave 8.2 audit feature coverage requirements |

## Acceptance Gate (TBD)

To be filled when Wave 10 sprint planning begins. PRD-016 must be expanded with per-slice FR/NFR + risks before promotion from DRAFT to ready-for-route.

## Status

**DRAFT** as of 2026-05-13. Will be promoted to full PRD content (Standard or Deep depth — likely Deep given scope size) at the start of Wave 10 sprint planning. The 7 slices are captured here so they don't get lost between Wave 9 ship and Wave 10 kickoff.
