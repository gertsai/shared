---
depth: standard
id: PRD-016
kind: prd
last_modified_at: 2026-05-14T14:13:52.136612+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-015
  relation: based_on
status: active
title: Wave 10 — production-grade web UI (auth UI / CMS / file upload / SSE / i18n / Storybook / error UI)
---

## Status

**ACTIVE — closed.** All 7 originally-planned capability slices shipped via 5 sub-waves (10.A through 10.E) + audit remediation. Independently re-audited (EVID-039). Wave 11.A added production hardening on top. Wave 11.C (PRD-025) layers the ops + extension roadmap on top of that.

## Problem Statement

Wave 9 shipped m9s-example-web as a functional but minimal full-stack reference: 4 routes, allow-all gate, text-only ingest, no UI for auth/i18n/file upload/etc. This was sufficient to demonstrate the end-to-end type-safe RPC pattern, but insufficient to demonstrate production-grade SaaS UX.

Wave 10 closed that gap by adding 7 capability slices across 5 sub-waves.

## Target Audience

| Persona | Pain after Wave 9, addressed by Wave 10 |
|---|---|
| New `@gertsai/*` adopter | Has a complete auth/CMS/i18n reference to copy from |
| Product owner | Sees login, file upload, multi-language all working in the same demo |
| Frontend engineer | Storybook + 10 primitives + tokens.ts give a real design system to fork |
| Security reviewer | JWT rotation + reuse detection + multi-layer audit trail documented |

## Final delivery — 7 slices × 5 sub-waves

| Original slice | Closed by | Audit trail |
|---|---|---|
| Slice 1 — Auth UI | Wave 10.A (PRD-018, EVID-033) + hardened Wave 11.A (PRD-023, EVID-040) | bcrypt auth + JWT refresh rotation + reuse detection |
| Slice 2 — CMS admin | Wave 10.B (PRD-019, EVID-034) | `/admin/content` route group + list + soft-delete |
| Slice 3 — File upload | Wave 10.B (PRD-019, EVID-034) | busboy multipart + 10 MiB cap + dropzone UI |
| Slice 4 — SSE streaming | Wave 10.B (PRD-019, EVID-034) + hardened Wave 11.A | per-doc replay buffer + per-tenant cap |
| Slice 5 — i18n | Wave 10.A (PRD-018, EVID-033) | paraglide-js en/ru with 60+ keys |
| Slice 6 — Storybook | Wave 10.C (PRD-020, EVID-035) | 10 primitives (5 atoms + 5 molecules) + tokens.ts + 60 stories |
| Slice 7 — Error UI | Wave 10.A (PRD-018, EVID-033) | Toast 5-variants + Skeleton + OfflineBanner + ErrorBoundary + error hook |

## Audit + closure

Wave 10.D (PRD-021, EVID-037) closed audit P0+P1+P2 from EVID-036. Wave 10.E (PRD-022, EVID-038) closed remaining audit backlog (U-6 rotation + CI-3 deleted_at migration + W-Arch-2 ISP split + W-Type-1/2 defineAction). EVID-039 independent re-audit (4 reviewers) confirmed APPROVE_WITH_FIXES with 0 critical issues. Re-audit warnings closed by Wave 10.E follow-up commit. R_eff = 1.0 across the chain.

## Effort actual

| Sub-wave | LOC actual | vs estimate |
|---|---|---|
| 10.A | ~750 | within estimate |
| 10.B | ~1300 | larger than estimate (split into 3 slices) |
| 10.C | ~1300 | matched (added Storybook framework cost) |
| 10.D | ~250 | audit fixes |
| 10.E | ~600 | backlog closure |
| Re-audit fixes | ~240 | warning closures |
| **Total** | **~4440 LOC** | **vs ~2880 LOC estimate** |

54% over original LOC estimate, driven by audit + re-audit polish that wasn't in the initial scope estimate.

## R_eff final

```
EVID-033/034/035 (Waves 10.A/B/C ship)     → 1.0 each
EVID-036 (initial audit)                    → 0.5 [superseded]
EVID-037 (Wave 10.D P0+P1+P2)               → 1.0 [superseded]
EVID-038 (Wave 10.E backlog)                → 1.0
EVID-039 (independent re-audit)             → 1.0
EVID-040 (Wave 11.A production hardening)   → 1.0
EVID-041 (Wave 11.B helpers upstream)       → 1.0
```

Aggregate R_eff = **1.0** — Wave 10 functionally + security + architecturally complete + independently re-audited.

## Successor

PRD-025 (Wave 12 design) lays out the Production ops layer + 4 extensions + doc cleanup roadmap that builds on Wave 10's reference webapp.

## Original scope (preserved for history)

The original DRAFT body listed 7 capability slices with effort estimates and a single-PRD plan. Actual delivery split this into 5 focused sub-waves with separate forgeplan artifacts per wave, providing finer-grained audit trail than a single mega-PRD would have. The Out-of-Scope items from the original (OAuth providers, magic-link, MFA, WebAuthn, billing, audit log UI, etc.) remain out of scope — partly addressed by Wave 13 (Phase B per PRD-025: OIDC integration), the rest deferred to future waves.

## Related Artifacts

- [[PRD-017]] / [[EVID-032]] — Wave 9.0.1 maintenance (predecessor).
- [[PRD-018]] / [[RFC-013]] / [[EVID-033]] — Wave 10.A.
- [[PRD-019]] / [[RFC-014]] / [[EVID-034]] — Wave 10.B.
- [[PRD-020]] / [[RFC-015]] / [[EVID-035]] — Wave 10.C.
- [[PRD-021]] / [[EVID-037]] — Wave 10.D audit remediation.
- [[PRD-022]] / [[EVID-038]] / [[EVID-039]] — Wave 10.E backlog + re-audit.
- [[PRD-023]] / [[RFC-016]] / [[EVID-040]] — Wave 11.A.
- [[PRD-024]] / [[EVID-041]] — Wave 11.B.
- [[PRD-025]] / [[RFC-017]] — Wave 12 design (successor).

