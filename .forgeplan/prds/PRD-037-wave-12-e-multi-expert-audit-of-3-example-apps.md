---
depth: standard
id: PRD-037
kind: prd
last_modified_at: 2026-05-16T22:19:11.610620+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 12.E — multi-expert audit of 3 example apps
---

# PRD-037 — Wave 12.E — multi-expert audit of 3 example apps

## Target Audience

- **Primary:** new contributors to the repo using `examples/m9s-example*` as reference for how to wire `@gertsai/*` packages into a real Moleculer + SvelteKit application. Bugs here propagate to anyone who copy-pastes.
- **Secondary:** maintainers of the `@gertsai/*` substrate — example apps are the canonical integration test for Wave 12.A-D fixes (Wave 11.A production hardening + auth + SSE + CMS + file upload + i18n + Storybook + 38-package consumer).
- **Tertiary:** Wave 12.F (cross-package consistency) team — findings here surface integration-tier issues that don't appear at single-package level.

## Problem Statement

After Wave 12.A (api-core) + 12.B (15 Tier-1) + 12.C (12 Tier-2) + 12.D (12 packages), the 3 example apps remain unaudited:

| App | Tier | LOC | Stack |
|---|---|---|---|
| `examples/m9s-example` | backend | 7985 | Moleculer + auth + ingest + search services |
| `examples/m9s-example-web` | frontend | 4470 | SvelteKit + Paraglide i18n + Storybook + design system |
| `examples/m9s-example-api-types` | shared | 1323 | TypeScript types shared between backend + frontend |

Total ~13.8k LOC. **Different scope from Tier-1-5 audits:** example apps integrate the substrate, so audit focuses on:
- Integration correctness (does Wave 11.A production hardening actually work end-to-end?)
- Front-end specifics (XSS, CSRF, hydration boundaries, design system tokens)
- Backend-frontend contract (api-types parity, SSE message shape)
- Shared-kernel reuse (do examples consume @gertsai/* in idiomatic Wave 12.A-D patterns?)

## Goals

1. **Coverage:** all 3 apps reviewed across 4 expert domains adapted for app-tier concerns.
2. **Integration verification:** confirm Wave 11.A FRs (production-grade auth, Redis rotation, CORS, SSE caps, JWT_SECRET removal) still hold post-Wave 12.B/C/D substrate updates.
3. **Front-end specifics:** SvelteKit-specific concerns (load functions, form actions, hydration, +server.ts handlers); Paraglide i18n correctness; design system token consistency.
4. **Cross-app consistency:** shared `m9s-example-api-types` matches actual backend response shapes.

## Non-Goals

- **NG-001 — No fixes in this wave.** Findings recorded; remediation in Wave 12.E-fix sub-waves (if any).
- **NG-002 — Out of scope:** Wave 12.F (cross-package consistency), Wave 12.G (aggregate).
- **NG-003 — No re-audit of @gertsai/* packages** — only their usage from the examples.
- **NG-004 — No public-API redesign of examples** — they're reference implementations; only correctness/security issues, not stylistic suggestions.
- **NG-005 — No publish during audit.**

## Functional Requirements

- [ ] **FR-001 — Reviewer roster:** 4 parallel (`code-analyzer` ×2 + `frontend-developer` ×1 + `security-expert` ×1). Frontend specialist replaces 1 generic reviewer to handle SvelteKit-specific concerns.
- [ ] **FR-002 — App set:** `m9s-example` (backend Moleculer) + `m9s-example-web` (SvelteKit frontend) + `m9s-example-api-types` (shared types).
- [ ] **FR-003 — Per-app output:** structured report with severity-ranked findings, `file:line` references, suggested remediation. Identical schema to EVID-044/048/051.
- [ ] **FR-004 — Cross-validation:** 3-app × 4-domain finding-density matrix.
- [ ] **FR-005 — Single `EVID-053`** with `## Structured Fields` per ADR-006.
- [ ] **FR-006 — Wave 11.A integration verification:** explicit checklist:
  - JWT_SECRET hardcoded fallback removed (FR-002 EVID-040)
  - Real bcrypt auth (FR-001)
  - Redis rotation store (FR-003)
  - CORS env allowlist (FR-005)
  - Per-tenant SSE caps (FR-004)
- [ ] **FR-007 — Cross-app contract check:** verify `m9s-example-api-types` `JwtClaims` + REST response types match actual backend implementations.
- [ ] **FR-008 — Acceptance:** activate when EVID-053 linked via `informs`, R_eff ≥ 0.5, 3 cards present, ≥ 4 reviewer outputs synthesised.

## Non-Functional Requirements

- **NFR-001 — Read-only.**
- **NFR-002 — Token budget:** 4 reviewers × ~5000 LOC = 20k LOC inspection — within ~14k LOC total scope, comfortably fits.
- **NFR-003 — Time bound:** single session, ≤2 hours wallclock.
- **NFR-004 — Findings traceability:** every CRITICAL/HIGH has concrete `file:line`.
- **NFR-005 — Safety:** MCP for `.forgeplan/*`.
- **NFR-006 — Reuse Wave 12.A-D output format** for Wave 12.G aggregate parser compatibility.

## Related Artifacts

- **EVID-040** — Wave 11.A production hardening (audit anchor for FR-006 verification)
- **EVID-041** — Wave 11.B `defineAction` + JwtClaims lift (audit anchor for FR-007)
- **EVID-039** — Wave 10.E re-audit (m9s-example baseline reference)
- **EVID-043/044/048/051** — Wave 12.A-D precedents (output format + reviewer pattern)
- **PRD-028/032/035** — sibling audit-wave PRDs
- **CLAUDE.md** — Wave 10-11 status + KNOWN-ISSUES.md residual risk list

Refs: EVID-051 (most-recent precedent), RFC-025 (execution), EVID-040/041 (Wave 11.A/B anchors).




