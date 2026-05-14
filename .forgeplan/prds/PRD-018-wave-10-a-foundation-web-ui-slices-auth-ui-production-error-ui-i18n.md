---
depth: standard
id: PRD-018
kind: prd
last_modified_at: 2026-05-13T23:31:35.761313+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-016
  relation: based_on
status: active
title: Wave 10.A — foundation web UI slices (auth UI + production error UI + i18n)
---

# PRD-018: Wave 10.A — foundation web UI slices (auth UI + error UI + i18n)

## Problem Statement

PRD-016 (Wave 10 stub, DRAFT) lists 7 deferred capability slices. This sprint promotes 3 foundation slices to active scope:

1. **Auth UI flow** — Wave 9 m9s-example-web has no login surface. Adopters cannot demonstrate end-to-end auth lifecycle. Backend has no `/api/v1/auth/*` endpoints.
2. **Production-grade error UI** — Wave 9 shipped basic toasts only. No skeletons, no error boundaries, no offline detection, no optimistic UI patterns. Adopters copying the example inherit a demo-grade UX.
3. **i18n** — Wave 9 is English-only. Russian user base + future enterprise customers need locale switching. No locale negotiation infrastructure exists.

Wave 10.B (file upload + SSE + CMS) and Wave 10.C (Storybook) ship in subsequent sub-waves. Wave 10.A is the foundation that 10.B/10.C build on (CMS gates require auth; design system stories may use i18n strings).

## Target Audience

| Persona | Pain |
|---|---|
| Adopter evaluating m9s-example for production SaaS | "Where's the login flow? How do I gate routes? Can users see error states?" |
| Frontend engineer copying reference | Must invent auth middleware, error UI, i18n setup from scratch |
| QA / UX reviewer | Wave 9 demo shows happy path only; no production-shaped error scenarios |
| Non-English user | English-only UI; cannot copy as template for localized product |

## Goals

1. **G-1**: `/login` + `/logout` SvelteKit routes exist; form action POSTs to backend `/api/v1/auth/login`; JWT stored in httpOnly cookie. Logout clears cookie + redirects. Verified by: HTTP smoke `GET /login` 200 + POST login form sets cookie.
2. **G-2**: Backend exposes `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/refresh`. Demo HS256 JWT signed with env-configurable secret. Verified by: curl returns valid JWT with `sub`, `exp`, `tenantId` claims.
3. **G-3**: openapi-fetch client middleware refreshes token proactively 60s before expiry + retries 401 reactively once. Verified by: unit test mocks expired token + asserts refresh fired before original request retried.
4. **G-4**: Error UI primitives ship: `+error.svelte` per route (catch errors with toast + retry CTA), skeleton placeholders during `+page.server` load (data-loading indicator), offline banner via `navigator.onLine` listener, `Toast` component with 5 variants (success/info/warning/error/loading). Verified by: visual inspection + 1 playwright test simulating offline.
5. **G-5**: i18n via paraglide-js. 2 locales (`en` default, `ru`). All UI strings tagged. Server-side `Accept-Language` negotiation in `hooks.server.ts`. Cookie override `lang=ru`. Verified by: HTTP smoke with `Accept-Language: ru` returns Russian text.
6. **G-6**: Backwards compat — all Wave 9 routes (`/`, `/ingest`, `/search`, `/docs`) continue to work. 71/71 m9s-example tests pass + 0/0 m9s-example-web check errors.
7. **G-7**: Strict floor — tsc + lint + svelte-check + build all exit 0.

## Functional Requirements

- **FR-1**: `examples/m9s-example-web/src/routes/login/+page.svelte` + `+page.server.ts` — form with email/password fields, form action POSTs to backend, on success sets cookie + redirects to `/`.
- **FR-2**: `examples/m9s-example-web/src/routes/logout/+page.server.ts` — form action POSTs to backend logout endpoint, clears cookie, redirects to `/login`.
- **FR-3**: `examples/m9s-example-web/src/hooks.server.ts` — SvelteKit hook reads JWT from cookie on every request; populates `event.locals.user` if valid; redirects to `/login` for protected routes (anything except `/login`).
- **FR-4**: `examples/m9s-example-web/src/lib/api/client.ts` — middleware decodes JWT exp; if <60s remaining, calls `/api/v1/auth/refresh`; intercepts 401 responses, refreshes once, retries original request.
- **FR-5**: `examples/m9s-example/src/services/auth/` — new service with 3 actions (`login`, `logout`, `refresh`). HS256 JWT via `jsonwebtoken` lib. Secret from `JWT_SECRET` env (default for demo: `change-me-on-deploy`).
- **FR-6**: `examples/m9s-example-web/src/lib/components/` — new components: `Skeleton.svelte`, `Toast.svelte` (existing — add variants), `OfflineBanner.svelte`, `ErrorBoundary.svelte`.
- **FR-7**: `examples/m9s-example-web/src/routes/+error.svelte` + per-route `+error.svelte` files for `ingest`, `search`, `docs`, `login`.
- **FR-8**: `examples/m9s-example-web/messages/en.json` + `ru.json` — paraglide message catalog. All UI strings tagged via `m()` runtime calls.
- **FR-9**: `examples/m9s-example-web/project.inlang/settings.json` — paraglide config with 2 locales.
- **FR-10**: `examples/m9s-example-web/src/hooks.server.ts` — locale negotiation (cookie > Accept-Language > default `en`).
- **FR-11**: New e2e test: `e2e/auth-flow.spec.ts` (login → access protected route → logout). Gated `RUN_E2E=1`.

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` restores Wave 9 state | Manual smoke |
| NFR-2 | Compat | Wave 9 routes + 71/71 backend tests pass | Test exit 0 |
| NFR-3 | LOC budget | ≤900 production LOC + ≤80 test LOC + ≤30 markdown | `git diff --stat` |
| NFR-4 | Strict floor | tsc + lint + check exit 0 | CI gates |
| NFR-5 | New deps | `jsonwebtoken` runtime (backend) + `paraglide-js` runtime (web) + `@inlang/paraglide-js` devDep. No more than 3 net new deps | package.json diff |
| NFR-6 | Security | JWT_SECRET env-configurable; demo default explicitly marked for dev only | README + .env.example doc |
| NFR-7 | Demo simplicity | Login form accepts ANY email/password in dev mode (no user DB) — backend returns fixed demo JWT. Real auth flow defered to PRD-019+ | Documented |

## Out of Scope (Wave 10.B/10.C/Wave 11+)

- OAuth providers (Google/GitHub/Apple) — Wave 11
- Magic-link email login — Wave 11
- MFA / TOTP / WebAuthn — Wave 11
- Self-service signup — Wave 11
- Real user database — Wave 11 (Wave 10.A uses hardcoded demo accounts)
- Password hashing (bcrypt/argon2) — Wave 11 (demo accepts any password)
- Email verification flow — Wave 11
- Password reset — Wave 11
- File upload, SSE, CMS — Wave 10.B
- Storybook — Wave 10.C
- More than 2 locales — adopters extend

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | paraglide-js requires Vite plugin + build-time codegen; might conflict with SvelteKit's vite config | Medium | Medium | Use `@inlang/paraglide-js-adapter-sveltekit` (first-party integration); pin compatible versions |
| R-2 | JWT in cookie + openapi-fetch middleware refresh race condition (multiple tabs) | Medium | Low | Demo only; document in README that production needs proper session-store-shared refresh logic |
| R-3 | Demo `JWT_SECRET` hardcoded leaks into committed `.env` | Low | High | `.env` gitignored; `.env.example` has placeholder; README warns about prod rotation |
| R-4 | Backend `services/auth` introduction conflicts with Wave 5+ session-guard package surface | Low | Medium | Backend issues plain JWT only; session-guard package surface unchanged. Auth service is a thin issuer, not a replacement for runtime-context |
| R-5 | All 3 teammates touch `hooks.server.ts` (locale + auth check) | Medium | High | Pre-seed by team-lead creates `hooks.server.ts` skeleton with explicit slot comments; each teammate edits its own slot |

## Strategy (high-level — RFC-013 details)

3 parallel teammates with disjoint file ownership after pre-seed. Pre-seed installs `paraglide-js` + `jsonwebtoken` deps + skeleton files.

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-016 | based_on — Wave 10 deferred-scope stub |
| PRD-015 / RFC-011 / ADR-014 / EVID-031 | informs — Wave 9 foundation |
| RFC-013 (next) | refines |
| EVID-033 (next) | informs |

## Acceptance Gate

PRD-018 satisfied when all 7 goals PASS, all 11 FRs verified, all 7 NFRs spot-checked, EVID-033 records HTTP smoke + auth flow + locale switch + svelte-check 0 errors + workspace gates green.





