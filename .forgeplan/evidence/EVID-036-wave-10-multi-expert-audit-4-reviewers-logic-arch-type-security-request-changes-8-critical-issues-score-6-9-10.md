---
depth: standard
id: EVID-036
kind: evidence
last_modified_at: 2026-05-14T10:34:05.687377+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-018
  relation: informs
- target: PRD-019
  relation: informs
- target: PRD-020
  relation: informs
status: active
title: Wave 10 multi-expert audit — 4 reviewers (logic/arch/type/security) — REQUEST_CHANGES (8 critical issues, score 6.9/10)
---

## Summary

Multi-expert audit of Wave 10 (sub-waves A + B + C — PRDs 018, 019, 020 + RFCs 013, 014, 015 + EVIDs 033, 034, 035) running 4 mandatory reviewers (logic / arch / type / security) per `fpl-skills:audit` Phase 1 mandatory panel. 22 high-risk files reviewed (auth + JWT + multipart + SSE + admin gate + design system core). Verdict: **REQUEST_CHANGES** — 5 consensus criticals + 3 unique criticals must land before any non-local deployment. Weighted score **6.9/10**. Task completion **~78%** (most FRs delivered with caveats; `?next=` consumption + `refresh_token` clearing partially missing).

## Structured Fields

- **verdict**: weakens
- **congruence_level**: CL3
- **evidence_type**: code_review

`verdict: weakens` because audit surfaced 8 critical issues that prevent activation of "Wave 10 production-ready" claim; the work *delivers* the FRs but with concurrency races, security gates not in place for prod, and a Liskov violation. `congruence_level: CL3` — same-target audit (4 expert lenses on this exact codebase). R_eff contribution = max(0, 0.5 − 0.0) = 0.5 (weakens score × CL3 = 0.5).

## Panel + Scores

| Reviewer | Score | Verdict |
|---|---|---|
| logic-reviewer | 6/10 | REQUEST_CHANGES |
| arch-reviewer | 8/10 | APPROVE_WITH_FIXES |
| type-reviewer | 8/10 | APPROVE_WITH_FIXES |
| security-reviewer | 6/10 | REQUEST_CHANGES |

**Weighted avg (logic 1.3 + arch 1.2 + type 1.0 + security 1.2) = 6.93/10**.

Per skill verdict matrix: any REQUEST_CHANGES → **REQUEST_CHANGES**.

## Task Completion Matrix

| Wave / FR | Status | Detail |
|---|---|---|
| PRD-018 FR-001 (JWT login + cookie) | ✅ | Happy path correct |
| PRD-018 FR-002 (refresh middleware) | ⚠️ | Race conditions in proactive + reactive paths |
| PRD-018 FR-003 (clear tampered cookies) | ❌ | `auth_token` cleared, `refresh_token` left stale |
| PRD-018 FR-004 (error scrubbing) | ✅ | 5xx → generic message, requestId correlation |
| PRD-018 FR-005..006 (i18n) | ✅ | paraglide en/ru parity, locale negotiation |
| PRD-019 FR-001 (multipart 10 MiB cap) | ✅ | busboy streaming + count limits |
| PRD-019 FR-002 (SSE lifecycle) | ⚠️ | Terminal-before-subscribe race in inline mode |
| PRD-019 FR-003 (file upload UI) | ✅ | Dropzone + XHR progress + EventSource |
| PRD-019 FR-004 (admin gate) | ⚠️ | `?next=` captured but never consumed (UX) |
| PRD-019 FR-005 (soft-delete) | ⚠️ | PG impl degrades to hard-delete (Liskov violation) |
| PRD-019 FR-006 (e2e specs) | ✅ | Files exist, RUN_E2E-gated |
| PRD-020 FR-001..006 (Storybook + 10 primitives + migration) | ✅ | All delivered cleanly |

**Completion rate: ~78%** (mostly delivered; 4 FRs with caveats; 1 partial).

## Consensus Issues (2+ reviewers flagged independently)

| # | Severity | Issue | Reviewers | Files |
|---|---|---|---|---|
| CI-1 | CRITICAL | **CWE-798 hardcoded JWT_SECRET fallback** (`'demo-secret-do-not-use-in-prod'`) applied in all envs, identical on web + backend | security C1, (arch implicit) | `examples/m9s-example/src/services/auth/src/jwt.ts:31,40` + `examples/m9s-example-web/src/lib/server/jwt.ts:22,37` |
| CI-2 | CRITICAL | **Module-singleton `tokenProvider` race** — per-request `setJwtTokenProvider` mutates module state shared across concurrent SvelteKit server requests; req A's tokens leak into req B's middleware | arch C2, security W3, (logic C2 implicit) | `examples/m9s-example-web/src/lib/api/client.ts:96` |
| CI-3 | CRITICAL | **PG soft-delete contract violation** — `IDocumentStore.softDelete` documented as soft; PG impl is hard-delete; Liskov broken; auditability lost on PG | arch C1, security W5, (logic implicit) | `examples/m9s-example/src/infrastructure/pg-document.repository.ts:185-194` |
| CI-4 | HIGH | **`?next=` redirect param** — captured by admin guard, never consumed by login (UX) AND open-redirect surface if `next=//evil.com` lands without validation | logic C5, security W1 | `examples/m9s-example-web/src/routes/login/+page.server.ts:105` + `(admin)/admin/+layout.server.ts:21` |
| CI-5 | MEDIUM | **`JwtClaims` interface duplicated** structurally in web + backend; identical today, nothing enforces alignment going forward | arch W6, type W6 | `examples/m9s-example/src/services/auth/src/jwt.ts:48-61` + `examples/m9s-example-web/src/lib/server/jwt.ts:26-34` |

## Unique Criticals (1 reviewer)

| # | Reviewer | Severity | Issue | File:Line |
|---|---|---|---|---|
| U-1 | logic C1 | CRITICAL | **Reactive 401-retry has 3 bugs**: (a) `new Request(url, {body: request.body})` clones already-consumed ReadableStream → POST/PUT retries silently send empty body; (b) raw `fetch()` bypasses tenantHeaderMiddleware → X-Tenant-ID lost; (c) no guard against `/auth/refresh` itself returning 401 | `examples/m9s-example-web/src/lib/api/client.ts:150-167` |
| U-2 | logic C2 | CRITICAL | **Proactive refresh race** — two parallel API calls both detect `exp - now < 60s`, both call refresh, both update token; benign today (no rotation) but breaks once rotation lands (C-3 fixes will collide) | `examples/m9s-example-web/src/lib/api/client.ts:131-146` |
| U-3 | logic C3 | CRITICAL | **`refresh_token` cookie never cleared** when access token tampered/expired; stays valid 24h client-side | `examples/m9s-example-web/src/hooks/auth.ts:36` |
| U-4 | logic C4 | CRITICAL | **SSE terminal-before-subscribe race** — inline mode emits `started → embedding → persisted → done` synchronously inside `useCase.execute` BEFORE client's EventSource connects (client gets docId from POST response, then opens SSE). UI sees nothing, stream idles to 30s timeout | `mol-services/sse-ingest.handler.ts:128-135` + `services/ingest/src/actions/ingest-document.action.ts:116-165` + `services/ingest/src/sse-emitter.ts` (no replay buffer) |
| U-5 | security C2 | CRITICAL | **Login accepts ANY email/password unconditionally** in all envs; combined with CI-1, production deploy = trivial impersonation of any user/tenant | `services/auth/src/actions/login.action.ts:39-48` |
| U-6 | security C3 | HIGH | **No refresh-token rotation, no reuse detection, no deny-list** — a leaked refresh token grants 24h of access; PRD-018 listed as future enhancement but missing residual-risk doc | `services/auth/src/actions/refresh.action.ts:38-47` |

## Warnings (consensus + uniques worth tracking)

- **W-Logic-1** — `multipart-parser.ts:107` `fields: 8` cap too tight, no `'fieldsLimit'` listener → silent reject under graceful path.
- **W-Logic-2** — `multipart-parser.ts:180-187` `req.on('aborted')` attached AFTER `req.pipe(bb)` → microtask race.
- **W-Logic-3** — `sse-emitter.ts:50` `setMaxListeners(50)` global on shared emitter (not per-docId) → burst load hits ceiling.
- **W-Logic-4** — `upload-document.action.ts:179` vs `delete-document.action.ts:38` docId regex inconsistent (`[a-z0-9-]` upload vs `[A-Za-z0-9_-]` delete) → uppercase IDs don't round-trip.
- **W-Security-2** — `sse-emitter.ts` no per-tenant/per-IP listener cap; 50+ subscribers = unbounded memory.
- **W-Security-7** — `login.action.ts:55-59` logs `email` (PII per CWE-532); PRD-018 didn't forbid; PRD-019 did. Inconsistency.
- **W-Security-9** — `upload-document.action.ts:179` honors caller-supplied docId with `auth: 'none'` → anonymous attacker can **overwrite any document** by guessing IDs.
- **W-Arch-1** — `auth.ts` hook imports concrete `verifyToken` — DIP not applied (acceptable demo trade-off, document for production).
- **W-Arch-2** — `IDocumentStore` widening 2 → 5 methods, ISP smell; split into `IDocumentStore` (write) + `IDocumentQuery` (read).
- **W-Arch-3** — `pg-document.repository.ts:207` lazy `import()` of `@gertsai/auth-openfga` crosses hex boundary inside infrastructure (ADR-002 violation).
- **W-Arch-7** — 2-tier JWT refresh middleware (proactive + reactive) over-engineered for reference app; reactive alone would suffice and remove the C-2 race surface.
- **W-Type-1** — auth action exports `: any` lack inline `// reason:` (rationale lives only in `api.service.ts:132` far away).
- **W-Type-3** — `interface UploadDocumentEnvelope {}` is empty (matches anything); prefer `Record<string, unknown>` per project convention.

## Positive Findings (cross-reviewer highlights)

- **JWT verifier** (`lib/server/jwt.ts`): `timingSafeEqual` + length check before compare + exhaustive `typeof` narrowings on payload (no `as` cast). Textbook unknown-at-boundary handling. (security P1, type P1)
- **Multipart parser** belt-and-braces: `settled` guard against double-resolve, inline byte counter, `req.unpipe()` + `req.resume()` drains socket on reject. (logic P2, security P5)
- **Native `<dialog>` Modal** (RFC-015 I-5): correctly uses top layer, focus trap, ARIA, `event.target === dialog` distinguishes backdrop vs content. (logic P3, arch P-implicit)
- **SSE handler cleanup**: single `cleanup()` function, idempotent via `closed` guard, dual close listeners (req + res). SRP-clean. (arch P3)
- **`tokens.ts` design**: textbook OCP. New variant = 1-file edit; consumers get autocomplete via barrel re-exports. (arch P2)
- **Pagination math**: `Math.max(1, Math.ceil(total/safePageSize))` correctly handles `total=0`; `goTo` clamps both ends. (logic P4)
- **SseEvent discriminator**: closed union with `as const`, exhaustive switch in handler synthesises `kind: 'error'` for idle timeout (no string widening). (type P2)
- **Hex direction**: action → port (`IDocumentStore`) → adapter (`DocumentRepository`). Read-side `toSummary` is pure projection outside class. (arch P1)
- **Error hook**: returns user-safe `{message, code, requestId}`, stack stays server-side. CWE-209 mitigated. (security P6)
- **PII discipline (ingest-side)**: upload action logs `bytes` + `docId` only, no body content. CWE-532 (security P5)

## Action Plan (priority order)

### P0 — Block deployment (must fix before prod)
1. **CI-1: Hard-fail on missing JWT_SECRET in production**. Throw at module load when `process.env.JWT_SECRET` absent AND `NODE_ENV === 'production'`. Add `M9S_ALLOW_DEMO_SECRET=1` opt-in for non-prod demos. Update both `examples/m9s-example/src/services/auth/src/jwt.ts` + `examples/m9s-example-web/src/lib/server/jwt.ts`. (~10 LOC)
2. **U-5: Gate "any-password-accepted" login**. `if (process.env.M9S_DEMO_AUTH !== 'true') throw new APIError(...)` at top of `login.action.ts` handler. (~5 LOC)
3. **W-Security-9: Reject caller-supplied docId on anonymous upload**. When `session === undefined`, force `randomUUID()` and ignore form-field docId. Or assert authenticated. (~3 LOC)

### P1 — Pre-merge correctness (must fix this wave)
4. **CI-2: Per-request tokenProvider**. Replace module singleton with `AsyncLocalStorage<JwtTokenProvider>` or pass per-call via openapi-fetch options. (~50 LOC refactor)
5. **U-1: Fix reactive 401-retry** — clone request body via `request.clone()` before first send, reuse middleware-injected headers, skip 401 handling when URL ends with `/auth/refresh`. (~20 LOC)
6. **U-2: Single-flight refresh** — cache refresh promise in module scope, deduplicate concurrent calls. (~15 LOC)
7. **U-3: Clear `refresh_token` cookie** alongside `auth_token` in tampered branch. (~2 LOC)
8. **U-4: SSE replay buffer** — keep last 8 events per docId in sse-emitter.ts; on new subscribe, replay buffered events synchronously. (~25 LOC)
9. **CI-3: PG soft-delete decision** — either add `deleted_at` migration NOW (recommended) or split port into `IDocumentStore` + `ISoftDeletableDocumentStore` and surface 501 on PG path. (~40 LOC)

### P2 — UX + hardening (this wave or 10.D follow-up)
10. **CI-4: Honor `?next=` on login** — read `url.searchParams.get('next')`, validate `startsWith('/') && !startsWith('//') && !includes(':')`, use as redirect target. (~8 LOC)
11. **U-6: Document refresh-token reuse risk** in `KNOWN-ISSUES.md` until rotation lands; OR implement rotation now (~80 LOC). At minimum log refresh-token usage with `jti`.
12. **W-Logic-4: Unify docId regex** between upload/delete actions (~2 LOC).
13. **W-Security-7: Drop `email` from login logs** (CWE-532). (~1 LOC)
14. **W-Logic-1: busboy fieldsLimit listener** + raise cap to 16. (~5 LOC)

### P3 — Tracked as backlog (Wave 10.D / 9.0.2 / arch-fixup)
15. **CI-5: Extract `JwtClaims`** to a shared types package. Wave 9.0.2 / new `@gertsai-examples/m9s-example-shared-types`.
16. **W-Arch-2: ISP split** of `IDocumentStore` (read vs write).
17. **W-Arch-3: Move OpenFGA tuple write** out of `pg-document.repository.ts` into use-case decorator (ADR-002 layer respect).
18. **W-Arch-7: Reconsider 2-tier JWT refresh** — drop proactive if reactive (post-C2 fix) is sufficient.
19. **W-Type-1/2: `defineAction()` typed helper** in `@gertsai/api-core` to retire `: any` annotations across services (Wave 9.0.2 backlog).
20. **W-Logic-3: Per-docId EventEmitter** map vs shared with `setMaxListeners(50)`.

## Files reviewed (22 total)

Auth (10): `hooks.server.ts`, `hooks/{auth,error,locale}.ts`, `lib/server/jwt.ts`, `lib/api/client.ts`, `services/auth/{index,lifecycle,types}.ts`, `services/auth/src/jwt.ts`, `services/auth/src/actions/{login,refresh,logout}.action.ts`.

Backend content (8): `services/ingest/src/multipart-parser.ts`, `actions/{upload,list,delete,ingest}-document.action.ts`, `services/ingest/src/sse-emitter.ts`, `mol-services/sse-ingest.handler.ts`, `domain/ports/IDocumentStore.ts`, `infrastructure/{document,pg-document}.repository.ts`.

Web admin + login (4): `routes/(admin)/admin/+layout.{server.ts,svelte}`, `routes/(admin)/admin/content/+page.server.ts`, `routes/login/+page.server.ts`.

Design system core (5): `lib/components/ui/{tokens,index}.ts`, `lib/components/ui/{Button,Input,Modal,Table,Pagination}.svelte`.

## R_eff contribution

`R_eff = max(0, 0.5 weakens − 0.0 CL3) = 0.5`. Aggregated parent PRD R_eff drops from 1.0 (each individual EVID-033/034/035 supports CL3) to weakest-link **0.5** until P0+P1 action items close.

## References

- [[PRD-016]] — Wave 10 super-PRD (parent).
- [[PRD-018]] / [[EVID-033]] — Wave 10.A foundation.
- [[PRD-019]] / [[EVID-034]] — Wave 10.B content.
- [[PRD-020]] / [[EVID-035]] — Wave 10.C design system.
- [[RFC-013]] / [[RFC-014]] / [[RFC-015]] — sub-wave strategies.
- [[ADR-002]] — Hex layer enforcement (W-Arch-3 cross-ref).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel (W-Arch-6 error model parity).







