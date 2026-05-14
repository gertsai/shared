---
depth: standard
id: PRD-023
kind: prd
last_modified_at: 2026-05-14T12:09:45.397429+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-039
  relation: based_on
status: active
title: Wave 11.A production-hardening — real auth + Redis rotation store + SSE caps + CORS + button migration
---

## Problem Statement

After Wave 10 closure (PRDs 016-022, EVIDs 033-039), the `m9s-example` reference application is functionally complete + audit-clean but still **carries three demo-grade shortcuts** that prevent it from being usable as a starter for actual production deployments:

1. **Open auth path** — `login.action.ts` gated behind `M9S_DEMO_AUTH=true` env, but the path itself accepts ANY email+password. No real user verification.
2. **Hardcoded `JWT_SECRET` fallback** — `'demo-secret-do-not-use-in-prod'` is the default in both backend and web jwt.ts. Production hard-fail is gated by `NODE_ENV === 'production'` + `M9S_ALLOW_DEMO_SECRET !== '1'` — defensible but the public string itself stays in the repo.
3. **In-memory rotation store** — `rotation-store.ts` wipes on restart; every active refresh token becomes `unknown` post-restart, force-logging-out the whole user base.

Plus three smaller items from the audit P3 backlog that materially affect production fit:

4. **Per-tenant SSE caps missing** (W-Security-2 / W-Logic-3) — current global `setMaxListeners(50)` on a shared emitter; no per-tenant DoS protection.
5. **CORS wildcard** (`origin: '*'` in api.service.ts) — acceptable for demo, but production needs env-driven allowlist.
6. **Inline-button markup** in 3 routes uses raw `<button class="bg-blue-...">` — Wave 10.C shipped the `<Button>` primitive but only Toast import migration landed (FR-005 letter not yet honored).

This PRD closes all six as a single production-hardening wave atop Wave 10.E.

## Goals

1. Replace demo auth with **bcrypt-hashed in-memory user repo + Passport-Local strategy** (or hand-rolled bcrypt verify — passport-light is plenty). Seed 2 demo users (`admin@m9s.example` / `user@m9s.example`) with bcrypt-hashed passwords. Remove `M9S_DEMO_AUTH` env gate entirely.
2. **Hard-remove `DEFAULT_SECRET` fallback** in both jwt.ts files — JWT_SECRET is REQUIRED, throw at module load if absent. No `M9S_ALLOW_DEMO_SECRET` escape hatch.
3. Persistent **Redis-backed `IRotationStore`** with composition root selecting `RedisRotationStore` when `REDIS_URL` is set, else `InMemoryRotationStore` (current impl). Per ADR-002 hex layer.
4. Per-tenant SSE subscriber cap (default 10) + 503 response on exceed. CORS allowlist via `CORS_ALLOWED_ORIGINS` env (comma-separated). 3 routes (login, ingest, admin/content) replace raw `<button>` with `<Button>` primitive.

## Target Audience

- **Primary:** external developers cloning m9s-example as a SvelteKit + `@gertsai/*` starter — these fixes are what differentiate "you can deploy this to staging" from "this is demo code".
- **Secondary:** internal contributors hardening m9s-example for the OSS launch (this is the layer that unlocks "production-ready reference template" claim).

## Functional Requirements

- [ ] **FR-001 (real auth)**: `services/auth/src/actions/login.action.ts` no longer accepts any credentials. New `user-repo.ts` exports an `IUserRepo` port + `InMemoryUserRepo` impl with 2 seeded users (bcrypt-hashed via `bcryptjs`). Login handler calls `userRepo.findByEmail(email)` → `bcrypt.compare(password, hash)` → returns 401 on failure. `M9S_DEMO_AUTH` env gate removed.
  - **Acceptance:** `curl -d '{"email":"admin@m9s.example","password":"admin123"}' /api/v1/auth/login` returns 200; wrong password returns 401; unknown email returns 401 with same message (no enumeration).
- [ ] **FR-002 (hardcoded secret removed)**: `getSecret()` throws unconditionally if `process.env.JWT_SECRET` is unset or empty string. `DEFAULT_SECRET` constant + `M9S_ALLOW_DEMO_SECRET` env escape removed from both `services/auth/src/jwt.ts` and `m9s-example-web/src/lib/server/jwt.ts`. `.env.example` updated with `JWT_SECRET=` required line.
  - **Acceptance:** `unset JWT_SECRET && pnpm dev` throws clearly at boot (`Error: JWT_SECRET must be set...`).
- [ ] **FR-003 (Redis rotation store)**: New `domain/ports/IRotationStore.ts` port (registerJti / consumeJti / revokeUser / pruneJtiStore). `infrastructure/in-memory-rotation.store.ts` extracts existing module-singleton into a class. `infrastructure/redis-rotation.store.ts` (NEW) implements port via `ioredis` SETNX + TTL pattern: each jti stored as `jti:{id}` with value `userId:used`, TTL = exp - now. `consumeJti` uses Lua eval for atomic check-and-set. Composition root wires `RedisRotationStore` when `REDIS_URL` set, else falls back to in-memory.
  - **Acceptance:** with REDIS_URL set, restart preserves active refresh tokens (replay still detected); without REDIS_URL, in-memory continues to work as before.
- [ ] **FR-004 (SSE per-tenant cap)**: `sse-emitter.ts` gains `Map<tenantId, Set<docId>>` subscriber registry; `subscribe(docId, tenantId, fn)` enforces `MAX_SUBSCRIBERS_PER_TENANT = 10`. Excess returns a synthetic `{kind: 'error', detail: 'tenant subscriber cap exceeded'}` event then closes the connection (HTTP 503 from sse-ingest.handler.ts). Global `setMaxListeners` lifted to 200 for headroom.
  - **Acceptance:** opening 11 concurrent SSE connections for one tenant — 11th gets `503 Service Unavailable` immediately.
- [ ] **FR-005 (CORS allowlist)**: `api.service.ts` reads `CORS_ALLOWED_ORIGINS` env (comma-separated). When set, only listed origins are honored; when unset AND `NODE_ENV !== 'production'`, falls back to `*` with warning log; when unset AND `NODE_ENV === 'production'`, fails at boot.
  - **Acceptance:** `CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com pnpm dev` — only those origins succeed CORS preflight.
- [ ] **FR-006 (inline-button migration)**: `routes/login/+page.svelte`, `routes/ingest/+page.svelte`, `routes/(admin)/admin/content/+page.svelte` — replace 5+ raw `<button class="...">` instances with `<Button variant="..." size="...">`. Form submission buttons use `type="submit"`. Test parity: visual smoke (manual or screenshot) matches pre-migration.
  - **Acceptance:** `grep -rn "<button class" examples/m9s-example-web/src/routes/{login,ingest,(admin)}/` returns nothing.

## Non-Functional Requirements

**NFR-1 — Security regression prevention**
  - No demo-grade shortcut remains in `services/auth/`. `M9S_DEMO_AUTH` and `M9S_ALLOW_DEMO_SECRET` env handles are deleted (not just gated — gone). `DEFAULT_SECRET` constant gone.
  - Bcrypt cost factor ≥ 10 (default), ≤ 12 (latency cap for the demo's single login flow).
  - User enumeration via login error messages — same 401 message + same response time bucket regardless of email-found vs password-wrong (constant-time bcrypt compare path).

**NFR-2 — Backward compatibility**
  - In-memory rotation store path still works when `REDIS_URL` unset (so local dev without Docker stays one-command).
  - Existing `<Toast>`, `<Skeleton>`, etc. consumers in routes unaffected.
  - All previous routes (login, ingest, search, admin) functional with new `<Button>` consumers.

**NFR-3 — Test gates**
  - Backend `tsc --noEmit`: 0 errors.
  - Web `svelte-check`: 0 errors / 0 warnings.
  - Workspace lint clean.
  - Backend tests: 81+ (+ N new for bcrypt user repo + Redis rotation store).
  - 11 existing rotation-store tests continue to pass (now against `IRotationStore` port via `InMemoryRotationStore`).

**NFR-4 — Forgeplan discipline**
  - EVID-040 records ship; `verdict: supports`, `congruence_level: CL3`, `evidence_type: code_review + internal-test-result`.

## Stakeholders

- **Owner:** `examples/m9s-example/` backend + `examples/m9s-example-web/` web.
- **Reviewers:** Wave 11.B re-audit (planned follow-up).

## Related Artifacts

- [[PRD-022]] / [[EVID-038]] / [[EVID-039]] — Wave 10.E ship + re-audit (this builds on).
- [[ADR-002]] — Hex layer (cited for `IRotationStore` port placement).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel (continuity).

## Out of Scope

- OIDC integration (Passport with Google/GitHub strategy) — Wave 11.C or later.
- Real user DB (Prisma/PG) — in-memory user repo with seeded users is enough for the reference template.
- Persistent session table — JWT-only is the demo's design; sticky session opt-in is future work.
- Storybook CI deploy — separate small PR.
- oxlint 1511 warning sweep — separate effort.
- `defineAction` → `@gertsai/api-core` upstream — Wave 11.B scope.
- `JwtClaims` shared package extraction — Wave 11.B scope.





