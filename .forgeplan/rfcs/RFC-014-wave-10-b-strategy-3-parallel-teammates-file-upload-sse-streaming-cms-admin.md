---
depth: standard
id: RFC-014
kind: rfc
last_modified_at: 2026-05-14T00:20:11.551627+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-019
  relation: informs
status: active
title: Wave 10.B strategy — 3 parallel teammates (file-upload, sse-streaming, cms-admin)
---

## Summary

Three additive capability slices ship on `examples/m9s-example-web/` (+ supporting backend actions in `examples/m9s-example/`) as a single wave, executed by 3 parallel teammates with disjoint file ownership: **file-upload** (dropzone + multipart action), **sse-streaming** (server-side event source + client EventSource panel), and **cms-admin** (auth-gated `(admin)` route group with list/delete). Total ~1100 LOC. Strategy reuses the proven Wave 10.A pre-seed pattern: team-lead pre-seeds shared files with explicit marker regions before parallel spawn.

## Context

[[PRD-019]] specifies three additive capability slices for `m9s-example-web`: drag-and-drop file upload, Server-Sent Events streaming, and a CMS admin route group. The slices are **strictly additive** — no breaking changes to Wave 9 anonymous routes or Wave 10.A auth surface. Three teammates can work in parallel because their **file ownership disjoints** cleanly:

- **Teammate F (file-upload)** owns dropzone UI, multipart backend action, and the e2e upload spec.
- **Teammate S (sse-streaming)** owns SSE endpoint, status-panel UI fragment, and the event emitter bridge.
- **Teammate C (cms-admin)** owns the `(admin)` layout group, content list/delete routes, and admin backend actions.

Cross-cutting concerns (shared `+page.svelte` for `/ingest`, shared i18n keys, shared backend `api.service.ts`) are pre-seeded by team-lead before parallel spawn so each teammate edits **disjoint regions** of the same file.

## Proposed Direction

**3 parallel teammates, single wave, ~1100 LOC total.** Pre-seed strategy mirrors Wave 10.A: team-lead writes the integration stubs first (slot files for each capability) so teammates fill in implementations without stepping on each other.

### File Ownership Map (wave-level enforcement)

| Path | Owner | Type | LOC est. |
|---|---|---|---|
| `examples/m9s-example/src/services/ingest/src/actions/upload-document.action.ts` | F | NEW | ~80 |
| `examples/m9s-example/src/services/ingest/src/actions/list-documents.action.ts` | C | NEW | ~50 |
| `examples/m9s-example/src/services/ingest/src/actions/delete-document.action.ts` | C | NEW | ~45 |
| `examples/m9s-example/src/services/ingest/src/actions/index.ts` | team-lead pre-seed (add 3 exports) | MODIFY | +3 |
| `examples/m9s-example/src/mol-services/api.service.ts` | team-lead pre-seed (add 3 routes); F+S+C each add their handler body | MODIFY | +90 |
| `examples/m9s-example/src/services/ingest/src/sse-emitter.ts` | S | NEW | ~70 |
| `examples/m9s-example/src/services/ingest/src/multipart-parser.ts` | F | NEW (busboy wrapper or in-house) | ~80 |
| `examples/m9s-example-web/src/routes/ingest/+page.svelte` | F (dropzone + XHR) + S (EventSource panel) — split via comment regions | MODIFY | +130 |
| `examples/m9s-example-web/src/routes/ingest/+page.server.ts` | F (multipart proxy if needed) | MODIFY | +20 |
| `examples/m9s-example-web/src/routes/(admin)/admin/+layout.server.ts` | C | NEW | ~25 |
| `examples/m9s-example-web/src/routes/(admin)/admin/+layout.svelte` | C | NEW | ~45 |
| `examples/m9s-example-web/src/routes/(admin)/admin/content/+page.server.ts` | C | NEW | ~70 |
| `examples/m9s-example-web/src/routes/(admin)/admin/content/+page.svelte` | C | NEW | ~110 |
| `examples/m9s-example-web/src/lib/sse-client.ts` | S | NEW (EventSource wrapper w/ reconnect) | ~60 |
| `examples/m9s-example-web/messages/en.json` | team-lead pre-seed (add keys F+S+C) | MODIFY | +30 |
| `examples/m9s-example-web/messages/ru.json` | team-lead pre-seed (add keys F+S+C) | MODIFY | +30 |
| `examples/m9s-example-web/e2e/upload.spec.ts` | F | NEW | ~50 |
| `examples/m9s-example-web/e2e/admin.spec.ts` | C | NEW | ~70 |

**Total**: ~1100 LOC across 3 teammates.

### Why no shared-file conflict in `+page.svelte` (ingest)?

Team-lead pre-seeds 3 marker comments (`<!-- WAVE-10-B/F:DROPZONE -->`, `<!-- WAVE-10-B/S:STATUS-PANEL -->`) inside the existing svelte file. F and S only insert at their respective markers — no overlap.

## Implementation Phases

**Phase 1 — Pre-seed (team-lead, ~10 minutes)**
1. Add `busboy` dep to `examples/m9s-example/package.json`.
2. Pre-seed `messages/en.json` + `messages/ru.json` with ~30 new keys (`upload_*`, `sse_*`, `admin_*`).
3. Add 3 stub routes in `api.service.ts` with TODO markers per teammate.
4. Add 3 export stubs in `services/ingest/src/actions/index.ts`.
5. Insert marker comments in `routes/ingest/+page.svelte`.
6. Create directory skeleton for `routes/(admin)/admin/content/`.

**Phase 2 — Parallel teammates (single wave, ~30-60 min wall-clock)**
- F, S, C spawn simultaneously via TeamCreate.
- Each claims `PRD-019` with their own agent identity.
- Each fills their owned files; releases on completion.

**Phase 3 — Integration smoke (team-lead, ~5 min)**
- `pnpm --filter @gertsai-examples/m9s-example tsc --noEmit`
- `pnpm --filter @gertsai-examples/m9s-example-web check`
- `pnpm --filter @gertsai-examples/m9s-example-web build`
- `pnpm --filter @gertsai-examples/m9s-example test`
- `pnpm lint`

**Phase 4 — Evidence + activate**
- Create EVID-034 with structured fields (verdict + congruence + evidence_type).
- Link to PRD-019, RFC-014.
- `forgeplan activate PRD-019 RFC-014 EVID-034`.

**Phase 5 — Commit + PR**
- Two commits: feat code + docs activate (Wave 10.A pattern).
- `gh pr create --base main` with structured body.

## Decisions

**D-1: Multipart parser — busboy vs. in-house**
- Default to busboy (~80 KB add, battle-tested, streaming).
- Fallback to ~50 LOC in-house parser **only if** busboy add fails (lockfile churn risk).
- F decides at start; reports back which path was taken.

**D-2: SSE event source — Moleculer broker.emit vs. per-process EventEmitter**
- Use Moleculer `broker.localEmit('ingest.progress.<docId>', {kind, ts})` from inside `ingest-document` pipeline; subscribe in SSE handler.
- For test seam: in-memory `EventEmitter` fallback when `QUEUE_ENABLED=false` (consistent with Wave 9.0.1 e2e seam pattern).

**D-3: CMS auth gate**
- `+layout.server.ts` in `(admin)` group with `throw redirect(302, '/login?next=' + url.pathname)` if `!locals.user`.
- Group route ensures **every** `/admin/*` page inherits the gate without per-route duplication.
- After Wave 10.A, `locals.user` is already populated for valid cookies; no new auth wiring.

**D-4: CSRF for delete**
- SvelteKit form actions auto-include the `__csrf_token` from `<form>` action POSTs; rely on built-in protection (no custom token).
- Delete is `?/delete` form action, not REST DELETE — same pattern as Wave 9 ingest form.

## Invariants

- **I-1**: No `@gertsai/*` package surface changes in this wave — only example-app code mutates.
- **I-2**: Wave 9 + Wave 10.A routes (`/`, `/ingest`, `/search`, `/docs`, `/login`, `/logout`) remain functional with **zero behavioral change** for anonymous users.
- **I-3**: All admin routes redirect via **server-side** 302 if `!locals.user` — never via client-side guard.
- **I-4**: Upload size cap enforced **server-side first** (busboy `limits: {fileSize: 10 * 1024 * 1024}` or equivalent); client-side check is UX-only.
- **I-5**: i18n key parity invariant from Wave 10.A holds — `en.json` and `ru.json` keysets stay identical.

## Rollback Plan

If the wave introduces regressions after merge:

1. **Per-slice revert**: each slice (file-upload, sse-streaming, cms-admin) is isolated in its owned files; team-lead can revert the offending teammate's commits without touching the other two. Revert order: e2e specs → routes → backend actions.
2. **Full wave revert**: `git revert <merge-commit>` restores Wave 10.A surface; no DB migration to undo (entity-storage soft-delete is reversible).
3. **Feature flag fallback**: if rollback is mid-flight, hide the dropzone behind `if (env.PUBLIC_ENABLE_UPLOAD === '1')` and `/admin` behind a server-side env check; ship hotfix.

## Consequences

**Positive**
- All three slices ship in one wave (≤ 4 hours team-lead time, parallel teammate execution).
- No breaking changes: Wave 9 + 10.A surface untouched.
- Demonstrates 5+ `@gertsai/*` capabilities in one slice: entity-storage soft-delete (C), session-guard (F+C), runtime-context (S — per-request emitter scoping), errors taxonomy (all 3 via HTTP boundary), logger-factory (S).

**Negative**
- Bundle size grows ~20 KB for SvelteKit (EventSource polyfill not needed — browser-native; XHR not needed — also native).
- One new backend dep (`busboy` ~80 KB) — acceptable, MIT-licensed, zero transitive deps.
- 3 teammates × 3 e2e specs = total Playwright run time grows ~30s.

**Mitigation**
- Bundle: keep new components plain Svelte 5 runes, no fat dependencies.
- Dep: busboy is widely vetted; pin to `^1.6.0` (latest stable).
- Playwright: parallelize via project config (already done in Wave 10.A).

## Alternatives Considered

**A-1: WebSockets instead of SSE**
- Rejected: SSE is one-way (server → client) which exactly matches our progress-update use case; no client-to-server channel needed mid-stream; SSE has built-in auto-reconnect in `EventSource`; WS would require explicit ping/pong + reconnect logic; SSE survives HTTP/2 cleanly.

**A-2: Long-polling**
- Rejected: 2-3× more HTTP requests, no live progress feel, fights against the existing demo's "instant feedback" UX.

**A-3: WebSocket upgrade via @gertsai/ws-rpc**
- Rejected for THIS slice (PRD-019 explicitly scopes SSE). Future Wave 10.C may demo ws-rpc for a bidirectional flow (e.g., live editing in CMS). Tracked as backlog.

**A-4: Single mono-teammate**
- Rejected: ~1100 LOC + 3 e2e specs would push single-agent context past comfortable bounds (~400 LOC per agent CLAUDE.md guideline). 3 parallel teammates is the right granularity.

**A-5: REST DELETE instead of form-action**
- Rejected: form-action POST gives free CSRF protection via SvelteKit; REST DELETE would require manual token validation; matches Wave 9 ingest form pattern.

## Validation Plan

1. **Pre-flight**: team-lead reads `EVID-033` to confirm Wave 10.A scaffolding is in place (`locals.user`, paraglide `m.*`, `Toast.svelte` 5 variants).
2. **Per-teammate**: each spawns with explicit "Follow CLAUDE.md project rules" + their file-ownership table + the marker-comment regions in shared files.
3. **Smoke after teammates return**:
   - `pnpm --filter @gertsai-examples/m9s-example tsc --noEmit` → 0 errors
   - `pnpm --filter @gertsai-examples/m9s-example-web check` → 0 errors
   - `pnpm --filter @gertsai-examples/m9s-example-web build` → success
   - `pnpm --filter @gertsai-examples/m9s-example test` → all green (or only the 1 known infra-flake)
4. **Evidence**: EVID-034 records the above smoke + the 3 new e2e specs (run if Playwright browsers available locally; otherwise document deferred).
5. **Activate**: EVID-034 links to PRD-019 and RFC-014; `forgeplan activate PRD-019 RFC-014` after R_eff ≥ 0.5.

## Open Questions

- **busboy version pinning**: latest stable is `^1.6.0`. F confirms at task start; if mismatch, switch to in-house parser.
- **paraglide message-key linter**: Wave 10.A added the i18n.spec.ts that validates key parity. Team-lead pre-seeds keys so all 3 teammates skip the parity step.

## References

- [[PRD-019]] — this wave's requirements doc.
- [[PRD-018]] / [[EVID-033]] — Wave 10.A scaffolding being built upon.
- [[RFC-013]] — Wave 10.A 3-teammate strategy (proven blueprint).
- [[ADR-005]] — `@gertsai/storage-core` IStorageProvider used by `ingest.list-documents` / `ingest.delete-document`.
- [[ADR-006]] — `@gertsai/errors` Shared Kernel; HTTP boundary scrub applies to new routes.



