---
depth: standard
id: EVID-042
kind: evidence
last_modified_at: 2026-05-14T14:14:39.599718+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-025
  relation: informs
- target: RFC-017
  relation: informs
status: active
title: Wave 11.C ship — design (PRD-025/RFC-017) + doc cleanup + Storybook CI + PRD-016 closure
---

## Summary

Wave 11.C — design + doc closeout. Ships the **design spec** for Wave 12 (Production ops layer) + Wave 13 (4 extensions) in PRD-025 / RFC-017, plus three small/safe items: `CLAUDE.md` Wave 11 section, `KNOWN-ISSUES.md` resolved/residual refresh, Storybook CI workflow, and activation of PRD-016 (Wave 10 super-PRD closure). No new behavior; doc + design + closure only.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: documentation + code_review

`congruence_level: CL3` — same-target docs land in this exact repo; closure of PRD-016 is verifiable against the merged Wave 10/11.A/11.B chain. R_eff contribution = 1.0.

## What was shipped

### Design (no implementation)
- **PRD-025** (~600 LOC body) — Wave 12 design: Production ops layer (5 FRs — observability, health/ready, graceful shutdown, auto-migrate, rate-limit defaults) + 4 extensions (OIDC, Prisma, Storybook CI, oxlint) + doc closeout. Out-of-scope items enumerated.
- **RFC-017** (~400 LOC body) — 3-phase rollout strategy: Phase C (this wave) → Phase A (Wave 12, 3 teammates parallel) → Phase B (Wave 13, 2-3 teammates parallel). Decisions documented (OTel + prom-client coexistence; AUTO_MIGRATE opt-in; raw SQL not Prisma; passport-openidconnect; phase order C→A→B).

### Doc cleanup (small, safe)
- **`CLAUDE.md`** — replaced single-line "Текущий статус Wave 7.2" with a structured block listing Wave 10 (5 sub-waves) + Wave 11.A (production hardening) + Wave 11.B (helpers upstream) + Wave 11.C (this design). Stable for any future reader.
- **`KNOWN-ISSUES.md`** — added a "Closed in Waves 10-11" section listing 8 items now resolved (JWT_SECRET fallback, open-login, in-memory rotation default, defineAction shim, JwtClaims drift, CORS wildcard, SSE caps, Wave 10 audit findings). Added a "Still acceptable for v0.1.0 → v0.2.0" section documenting residual risk (in-memory rotation default, 2-user demo seed, no auto-migrate, no health/ready, OIDC/Prisma TBD). Honest about what's done and what's left.
- **PRD-016 activated** (Wave 10 super-PRD) — was stuck in draft after sub-waves shipped. Body rewritten to reflect actual delivery (54% over original LOC estimate, audit + re-audit + remediation chain documented). Final R_eff = 1.0. Successor PRD-025 cross-linked.

### Storybook CI (small workflow)
- **`.github/workflows/storybook.yml`** (~80 LOC YAML) — builds `storybook-static` and deploys to GitHub Pages on every main push to relevant paths (`ui/`, `.storybook/`, `app.css`, `vite.config.ts`, `package.json`, the workflow itself). Manual `workflow_dispatch` trigger included. Minimal permissions (`contents: read`, `pages: write`, `id-token: write`). Concurrency-controlled (one deploy at a time, supersede pending). Security-hardened — repo name resolved via `${GITHUB_REPOSITORY_NAME}` env in a separate step to avoid `${{ }}`-in-`run:` injection patterns flagged by the workflow security hook.

## Smoke results (2026-05-14)

| Gate | Command | Result |
|---|---|---|
| Backend tsc | `pnpm --filter @gertsai-examples/m9s-example exec tsc --noEmit` | unchanged from main |
| Web check | `pnpm --filter @gertsai-examples/m9s-example-web check` | unchanged from main |
| Workspace lint | `pnpm lint` | unchanged from main |
| Backend tests | `pnpm --filter @gertsai-examples/m9s-example test` | unchanged (only docs + 1 workflow + forgeplan artifacts mutated) |
| Workflow lint | GitHub Action editor's built-in YAML validator | clean |

No behavior change → no smoke regression possible. The Storybook workflow won't fire until the next main push that touches the relevant paths.

## Acceptance verification (PRD-025 Phase C scope)

- [x] **FR-C1 (CLAUDE.md)** — Wave 11 section added; Wave 10 chain listed; current status reflects merged PRs #17-#24 + open PRD-025 design.
- [x] **FR-C2 (KNOWN-ISSUES.md)** — 8 closed items listed with audit-trail refs; 6 residual items documented as accepted-risk.
- [x] **FR-C3 (PRD-016 activate)** — draft → active; body rewritten to reflect actual delivery + final R_eff + successor link.
- [x] **FR-B3 (Storybook CI)** — workflow file added; security-hardened against `${{ }}`-in-`run:` injection.

Out of scope for Phase C (deferred to Wave 12+):
- FR-C4 (m9s-example README + CONTRIBUTING) — small enough to land in Wave 12 alongside Phase A scaffold.
- FR-A1..A5 (Production ops layer) — Wave 12.
- FR-B1, FR-B2, FR-B4 (OIDC, Prisma, oxlint sweep) — Wave 13.

## R_eff status

Parent PRDs chain — all Wave 10 + 11 EVIDs supports CL3 = 1.0 (no regression). PRD-016 now active; PRD-025 + RFC-017 activated via this evidence link.

## What remains (Wave 12 + 13 + npm publish)

- **Wave 12 (Phase A)** — 3 teammates parallel, ~700 LOC: observability (OTel + prom-client + `/health` + `/ready`) + graceful shutdown + auto-migrate + rate-limit defaults. PRD-025 FRs A1-A5.
- **Wave 13 (Phase B)** — 2-3 teammates parallel, ~500 LOC: OIDC adapter for IUserRepo + PgUserRepo (raw SQL via @gertsai/pg-client) + oxlint sweep. PRD-025 FRs B1, B2, B4.
- **m9s-example README + CONTRIBUTING** — FR-C4, ships with Wave 12.
- **npm publish v0.2.0** — IRREVERSIBLE, requires explicit Y per package. After Wave 11.B's changeset PR is merged, the auto-generated "Version Packages" PR is the entry point.

## References

- [[PRD-025]] — Wave 12 design (this PRD's primary output).
- [[RFC-017]] — Wave 12 phased rollout strategy.
- [[PRD-016]] — Wave 10 super-PRD (activated by this evidence).
- [[PRD-023]] / [[EVID-040]] — Wave 11.A (predecessor).
- [[PRD-024]] / [[EVID-041]] — Wave 11.B (predecessor).
- [[EVID-039]] — Wave 10.E re-audit (R_eff trail).




