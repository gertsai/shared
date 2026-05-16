---
depth: standard
id: RFC-025
kind: rfc
last_modified_at: 2026-05-16T22:19:56.327827+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-037
  relation: informs
status: active
title: Wave 12.E audit strategy — 4-reviewer parallel for example apps (backend + frontend + shared types)
---

# RFC-025 — Wave 12.E audit strategy

## Summary

4 parallel reviewers cover 3 example apps. **Reviewer mix differs from Tier audits:** backend (`code-analyzer`), frontend (`frontend-developer` agent — first time used in audit series), security (`security-expert`), and integration (`code-analyzer` for cross-app contract). 14k LOC total fits comfortably in 4 reviewer budgets. Output schema identical to EVID-044/048/051. Wave 11.A integration verification is the principal new dimension. Wallclock target ≤1.5 hours.

## Context

Example apps differ structurally from Tier-1-5 packages:
- they CONSUME the substrate (not provide it)
- they include frontend concerns (SvelteKit-specific patterns, hydration, i18n)
- they're the canonical integration test for Wave 11.A production hardening
- they have a 3-way contract (backend ↔ shared types ↔ frontend)

RFC-025 adapts the proven Wave 12.B-D 4-reviewer parallel pattern for app-tier concerns.

## Motivation

Wave 10/11 closed dozens of audit findings in m9s-example (EVID-036→039 + Wave 11 closures), but the substrate has churned heavily since: Waves 12.A-D published 4 CRITICAL + 43 HIGH fixes across 39 packages, some with soft-breaking changes (Wave 12.B fix-2 m9s-cache validateKeys default; Wave 12.B-fix-1 m9s-cache moleculer/redis subpath split; Wave 12.D-fix entity $patch __proto__ filter; etc). Does m9s-example still build and run correctly against the latest @gertsai/* versions? Examples are also where Wave 11.A FR-001-005 production hardening actually plays out — easy to regress if a substrate update slipped past.

Without 12.E, Wave 12 audit story is incomplete: the substrate audit isn't validated against any real consumer.

## Proposed Direction

### D-1 — Reviewer agent selection

3-domain reviewers + 1 frontend specialist (different from prior audits):

| Reviewer | Agent | Scope |
|---|---|---|
| **Backend logic + architecture** | `agents-pro:code-analyzer` | m9s-example (Moleculer services, ApiController usage, DI wiring, queue handlers) |
| **Frontend SvelteKit specifics** | `agents-domain:frontend-developer` | m9s-example-web (load, +server.ts, hydration, design system, i18n) |
| **Cross-app contract + types** | `agents-domain:typescript-type-auditor` | m9s-example-api-types + interfaces actually consumed by both apps |
| **Security (Wave 11.A verification)** | `agents-pro:security-expert` | all 3 apps with focus on Wave 11.A FR-001..005 |

### D-2 — Sampling strategy

14k LOC total is small enough for full-read by 4 reviewers, except:
- `examples/m9s-example-web/src/lib/components` may have many Storybook stories — sample core primitives + skip 1-shot stories
- `examples/m9s-example/src/services/{auth,ingest,search}` — full-read; this is the auth substrate-integration code we most want covered

### D-3 — Per-domain checklists

**Backend logic + architecture:**
- Moleculer service wiring (action signatures, meta usage, error propagation)
- ApiController.register usage (post-Wave 13 `defineAction` adoption)
- DI container usage (post-Wave 12.D-fix `'destroyed'` event rename)
- Queue handler boundaries (consume @gertsai/queue post-12.C-fix-2+3)
- Cache usage (post-Wave 12.B-fix-1 @gertsai/m9s-cache subpath split)
- Storage CRUD via @gertsai/entity-storage (post-12.D-fix _destroyed re-check)

**Frontend SvelteKit:**
- `+page.svelte` reactivity (entity-svelte adapter usage post-12.C-fix-1)
- `+server.ts` handlers — auth checks, cookie handling, CSRF
- `+layout.server.ts` session validation
- Load function patterns (parent vs child)
- Hydration boundaries
- Paraglide i18n message extraction
- Storybook story coverage parity with components
- Design system token consistency
- XSS surface via Svelte `{@html}` blocks

**Cross-app types:**
- `m9s-example-api-types` exports match backend response shapes (run `tsc --noEmit` mentally against actual implementations)
- Backend imports types from api-types correctly (no inline duplicates)
- Frontend imports types from api-types correctly
- JwtClaims shape matches what `auth` service emits (Wave 11.B FR-002 verification)

**Security:**
- Wave 11.A FR-001 — real bcrypt + dummy hash anti-enum (verify `examples/m9s-example/src/services/auth/src/jwt.ts` + actions)
- Wave 11.A FR-002 — JWT_SECRET hard-throws, no fallback
- Wave 11.A FR-003 — Redis rotation store (`IRotationStore` port wired)
- Wave 11.A FR-005 — CORS env allowlist + prod fail-fast
- Wave 11.A FR-004 — Per-tenant SSE caps (10/tenant)
- Cookie security (httpOnly, sameSite, secure)
- File-upload validation (m9s-example ingest service)
- Tenant scoping in storage CRUD calls (uses fixed scoping or relies on substrate?)

### D-4 — Output schema per reviewer

Identical to RFC-019 D-4 / RFC-023 D-4 / RFC-024 D-4. Preserves EVID-044/048/051 parser shape for Wave 12.G aggregate.

### D-5 — Aggregation by team-lead

Cross-domain collapse, severity max-merge. 3-app × 4-domain matrix (smaller than 12.B/C/D's 12-15-package matrices).

### D-6 — EVID-053 artifact

`## Structured Fields` per ADR-006. CL3 internal audit.

### D-7 — Read-only

Reviewers read only; tech lead writes EVID via MCP. No code branches.

## Implementation Phases

| Phase | Duration | Owner |
|---|---|---|
| Phase 1 — Pre-seed (recon + Wave 11.A anchor verification) | 5 min | Team lead |
| Phase 2 — Parallel spawn (4 reviewers) | 15–30 min wallclock | reviewers |
| Phase 3 — Aggregation + cross-validation | 15-25 min | team lead |
| Phase 4 — Evidence draft + activate | 10 min | team lead |
| Phase 5 — Branch + commit + PR | 10 min | team lead |

Wallclock target ≤1.5 hour.

## Invariants

- **I-1** — Read-only.
- **I-2** — CRITICAL/HIGH cite `file:line`.
- **I-3** — EVID-053 body contains `## Structured Fields`.
- **I-4** — Per-app summary cards format identical to EVID-044/048/051.
- **I-5** — No fix code in this wave.
- **I-6** — Wave 11.A FR-001..005 verification explicitly performed by security reviewer.
- **I-7** — Cross-app type contract verification (api-types ↔ backend ↔ frontend) explicitly performed by type reviewer.

## Rollback Plan

Same as RFC-019/023/024 — if audit quality low, mark PRD-037 superseded, retry with refined strategy.

## Alternatives Considered

### Alt-1 — Sequential 3-app audit (one app at a time)

**Rejected:** parallel 4-reviewer is proven faster (Wave 12.B/C/D wallclock ~25-30 min); no cross-app benefit from sequential.

### Alt-2 — Skip api-types (only audit consumer apps)

**Rejected:** shared types are the contract; type drift between backend and frontend is exactly what api-types is supposed to prevent. Critical to verify.

### Alt-3 — Add tests-reviewer as 5th

**Rejected:** Wave 12.A-D consistently used 4 reviewers; tests already covered by logic reviewer's "test coverage" pass. Adding 5th adds overhead without proportional return.

## Risks

- **R-1 — m9s-example-web may not have Storybook stories for all design system primitives.** Mitigated: frontend reviewer documents coverage gap as a finding rather than treating it as out-of-scope.
- **R-2 — Frontend reviewer agent may be unfamiliar with Paraglide.** Mitigated: agent is generic `frontend-developer`; Paraglide is documented in m9s-example-web's package.json + READMEs.
- **R-3 — Wave 11.A FR verification depends on EVID-040 audit anchor.** Mitigated: pre-seed phase reads EVID-040 to feed reviewer prompts with exact original-finding `file:line` so reviewers verify rather than re-investigate.

## Open Questions

- **Q-1 — Should m9s-example-web Storybook config audit be folded in?** Yes — frontend reviewer touches `.storybook/main.ts` + `preview.ts` as part of component coverage check.

Refs: PRD-037 (this wave's PRD), EVID-040 + EVID-041 (Wave 11.A/B anchors), RFC-018 (parent strategy), RFC-019/023/024 (sibling patterns).



