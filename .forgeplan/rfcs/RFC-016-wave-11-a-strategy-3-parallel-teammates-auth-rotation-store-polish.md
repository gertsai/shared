---
depth: standard
id: RFC-016
kind: rfc
last_modified_at: 2026-05-14T12:10:29.102370+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-023
  relation: informs
status: active
title: Wave 11.A strategy — 3 parallel teammates (auth + rotation-store + polish)
---

## Summary

Three parallel teammates ship Wave 11.A production-hardening on `feat/wave-11-a-production-hardening` atop main. ~700 LOC across ~15 files. Pre-seed phase establishes file ownership boundaries so teammates touch disjoint regions.

## Motivation

After Wave 10 closure, `m9s-example` is audit-clean but carries three deployment-blocking shortcuts (open login, hardcoded secret fallback, in-memory rotation store) plus three smaller P3-backlog items (SSE tenant caps, CORS wildcard, inline-button markup). Each is small enough to ship in one teammate's context, but they touch enough shared surface (auth files, SSE handler, route components) that serialising would be slow. Three teammates with strict file ownership ship in parallel ~30-45 min wall clock.

## Context

PRDs and audit chain so far (Wave 10): PRD-016 super-PRD → 5 sub-waves A/B/C/D/E + 2 audits → all merged on main as of `38c1cb4`. Today (PR #22 merged) closes the audit follow-ups. Wave 11.A is the next focused wave — production-hardening only, no new feature surface.

## Proposed Direction

### File ownership

| Path | Owner | Type | LOC |
|---|---|---|---|
| `services/auth/src/user-repo.ts` | T1 (auth) | NEW | ~80 |
| `services/auth/src/actions/login.action.ts` | T1 | MODIFY (remove demo gate, bcrypt verify) | +30 |
| `services/auth/src/jwt.ts` | T1 | MODIFY (hard-remove DEFAULT_SECRET) | -15 |
| `examples/m9s-example-web/src/lib/server/jwt.ts` | T1 | MODIFY (same) | -15 |
| `examples/m9s-example/.env.example` | T1 | MODIFY (require JWT_SECRET) | +5 |
| `examples/m9s-example/package.json` | team-lead pre-seed (bcryptjs dep) | MODIFY | +2 |
| `domain/ports/IRotationStore.ts` | T2 (rotation) | NEW | ~50 |
| `infrastructure/in-memory-rotation.store.ts` | T2 | NEW (extracts existing) | ~100 |
| `infrastructure/redis-rotation.store.ts` | T2 | NEW (Lua eval + TTL) | ~150 |
| `services/auth/src/rotation-store.ts` | T2 | MODIFY (re-export from infra) | refactor |
| `services/auth/src/actions/{login,refresh}.action.ts` | team-lead pre-seed (inject store via ctx.service) | MODIFY | +10 |
| `composition/infrastructure.ts` | T2 | MODIFY (wire Redis or in-memory) | +30 |
| `services/ingest/src/sse-emitter.ts` | T3 (polish) | MODIFY (per-tenant caps) | +50 |
| `mol-services/sse-ingest.handler.ts` | T3 | MODIFY (tenant from query / locals) | +20 |
| `mol-services/api.service.ts` | T3 | MODIFY (CORS allowlist) | +25 |
| `routes/login/+page.svelte` | T3 | MODIFY (Button) | +5 |
| `routes/ingest/+page.svelte` | T3 | MODIFY (Button × 2) | +5 |
| `routes/(admin)/admin/content/+page.svelte` | T3 | MODIFY (Button × 1) | +3 |
| `tests/user-repo.test.ts` | T1 | NEW | ~50 |
| `tests/redis-rotation-store.test.ts` | T2 | NEW (mocked ioredis) | ~80 |

**Total**: ~700 LOC across 3 teammates.

### Pre-seed by team-lead

1. Add `bcryptjs@^2.4.3` (+ `@types/bcryptjs@^2.4.6`) to `examples/m9s-example/package.json`.
2. Create `examples/m9s-example/src/domain/ports/IRotationStore.ts` skeleton (interface declaration only; T2 fills impls).
3. Run `pnpm install`.
4. Document teammate boundaries in spawn prompts.

### Spawn protocol

3 `Agent` calls in single message (parallel). Each gets:
- File ownership table (only their slice).
- "Follow CLAUDE.md project rules" + ADR-002 hex layer reminder.
- Smoke commands to verify before reporting back.

## Implementation Phases

**Phase 1 — Pre-seed (team-lead, ~5 min)**
1. Branch + dep install (bcryptjs).
2. Stub `domain/ports/IRotationStore.ts` so teammates compile.

**Phase 2 — Parallel teammates (~30-45 min wall clock)**
- T1, T2, T3 spawn simultaneously.
- Each claims PRD-023 via `forgeplan claim`.
- Each runs smoke on their slice before reporting back.

**Phase 3 — Integration + smoke (team-lead, ~10 min)**
- Run full smoke: backend tsc + web check + lint + tests.
- Fix any cross-teammate friction (e.g. composition root wiring).

**Phase 4 — Evidence + activate (~5 min)**
- Create EVID-040 with structured fields.
- Link + activate PRD-023, RFC-016, EVID-040.

**Phase 5 — Commit + PR**
- Two commits (feat + docs activate).
- `gh pr create --base main`.

## Decisions

**D-1: bcryptjs vs. argon2**
- `bcryptjs` chosen because pure-JS (no native build), wide adoption, sufficient for the reference demo. argon2 is theoretically stronger but requires `node-pre-gyp` builds on consumer machines — friction for "clone and run".

**D-2: Redis Lua eval for atomic consume**
- The `consumeJti` semantic requires atomic check-then-set. Two roundtrips (GET + SETEX) would race. Lua EVAL is the canonical Redis primitive for atomic compare-and-swap. ~10-line script.

**D-3: Per-tenant SSE map vs. global**
- Map structure: `Map<tenantId, Set<docId>>`. Capacity check: `set.size >= MAX`. Default 10. Adds a Map.delete on connection close to prevent leak.

**D-4: CORS env shape**
- `CORS_ALLOWED_ORIGINS=https://a.com,https://b.com` — comma-separated. Empty / unset + dev → wildcard with warning. Empty / unset + prod → throw at boot.

**D-5: User repo seeding**
- In-memory map seeded with 2 users (`admin@m9s.example` / hash + `user@m9s.example` / hash). Passwords from env (`DEMO_ADMIN_PASSWORD`, `DEMO_USER_PASSWORD`) with `.env.example` defaults. Avoids hardcoded plaintext in source.

## Invariants

- **I-1**: No `M9S_DEMO_AUTH` env handle in source.
- **I-2**: No `DEFAULT_SECRET` constant in source.
- **I-3**: Composition root selects rotation store impl based on `REDIS_URL` env presence.
- **I-4**: All previous tests (81/82) continue to pass + new tests added.
- **I-5**: `IRotationStore` port lives in `domain/ports/`; impls live in `infrastructure/`. ADR-002 respected.

## Rollback Plan

- **Per-feature**: each teammate's slice is isolated. Drop one without affecting others.
- **Full revert**: `git revert <merge-sha>` restores Wave 10.E surface (demo auth, etc.).
- **Production gate via env**: if real auth breaks in CI, set `JWT_SECRET=test-secret` + redirect login traffic — no source changes needed.

## Consequences

**Positive**
- m9s-example becomes a true production-template — can be cloned and deployed with `JWT_SECRET=$(openssl rand -hex 32)` + `REDIS_URL=redis://...`.
- Audit P3 backlog drops from 9 → 5 items.
- Real bcrypt user repo + Redis rotation store demonstrate two more `@gertsai/*` patterns (hex DI + persistent state).

**Negative**
- Adds 2 deps to `examples/m9s-example/package.json` (`bcryptjs`, types). Both pure-JS, ~50KB.
- Without `REDIS_URL`, in-memory store still runs (no breaking change for local-dev path), but the in-memory path now lives in `infrastructure/` instead of `services/auth/src/`.
- CORS allowlist requires env config for prod — friction for first-deploy. Mitigated by clear boot-time error message.

## Alternatives Considered

**A-1: Real PG user DB instead of in-memory**
- Rejected for this wave: requires migration + Prisma wiring + seed script. Out of scope. In-memory user repo with seeded creds is enough for the "reference template" claim.

**A-2: passport-local + express-style middleware**
- Rejected: Moleculer/api-core uses its own action lifecycle. Passport would be a 3rd auth abstraction (typia + session-guard + passport). Hand-rolled bcrypt-verify in the login action is simpler.

**A-3: argon2id instead of bcrypt**
- Rejected: native build friction (see D-1). Demo prefers wide compatibility.

**A-4: Keep DEFAULT_SECRET with env-required runtime check**
- Rejected: the public string in the repo is an attack surface even when gated. Removing it forces every deploy to set a real secret.

## Validation Plan

1. Pre-flight: read `EVID-039` (Wave 10.E re-audit) to confirm post-fix baseline.
2. Per-teammate: spawn with file-ownership table + smoke commands.
3. Smoke after teammates return:
   - `pnpm --filter @gertsai-examples/m9s-example exec tsc --noEmit` → 0 errors
   - `pnpm --filter @gertsai-examples/m9s-example-web check` → 1087 / 0 / 0
   - `pnpm lint` → clean
   - `pnpm --filter @gertsai-examples/m9s-example test` → 81+ / 82 (+ new)
4. Manual verify: try login with admin@m9s.example / admin123 → 200. Wrong password → 401. Restart with Redis configured + active refresh → still works.

## References

- [[PRD-022]] / [[EVID-038]] / [[EVID-039]] — Wave 10.E ship + re-audit.
- [[ADR-002]] — Hex layer enforcement.
- [[ADR-006]] — `@gertsai/errors` Shared Kernel.
- [[RFC-015]] — Wave 10.C 2-teammate strategy (template for this wave).



