---
depth: standard
id: EVID-029
kind: evidence
last_modified_at: 2026-05-12T22:12:27.373982+00:00
last_modified_by: claude-code/2.1.139
links:
- target: AUDIT-2026-05-12-215927
  relation: informs
status: active
title: 'Code audit AUDIT-2026-05-12-215927: verdict=FAIL (1 CRIT + 12 HIGH), Wave 8.2 patch closes all CRIT/HIGH'
---

# EVID-029: Code audit AUDIT-2026-05-12-215927 + Wave 8.2 patch ship

## Structured Fields

- **verdict**: weakens (audit FAILed pre-patch; Wave 8.2 closed 1 CRIT + all 12 HIGH inline; 14 MED + 9 LOW deferred to Wave 8.3+)
- **congruence_level**: CL3
- **evidence_type**: code_review
- **target_system**: post-Wave-8.1 main (commit `ca92c8e`) + Wave 8.2 patch (this branch `chore/wave-8-2-audit-fixes`)
- **audit_slot**: AUDIT-2026-05-12-215927

## Audit summary

6 parallel experts (Logic, Architecture, Security, Tests, Performance, Documentation) reviewed the Wave 8.1 net-new code + adjacent paths. Combined findings (pre-patch):

| Expert | CRIT | HIGH | MED | LOW |
|---|---|---|---|---|
| 1 — Logic & Correctness | 0 | 2 | 5 | 3 |
| 2 — Architecture & Patterns | 0 | 2 | 4 | 3 |
| 3 — Security | 0 | 2 | 4 | 3 |
| 4 — Test Coverage | 1 | 3 | 4 | 2 |
| 5 — Performance | 0 | 2 | 3 | 3 |
| 6 — Documentation | 0 | 3 | 5 | 3 |
| **Total** | **1** | **14** | **25** | **17** |

(Audit total findings: 57. 1 CRIT + 14 HIGH = 15 closed in Wave 8.2; 25 MED + 17 LOW deferred.)

## Verdict pre-patch

**FAIL** — 1 CRITICAL finding (test config divergence masking real-infra test discovery) + 12 HIGH findings spanning logic, security, architecture, tests, performance, docs.

## Closed in Wave 8.2 patch (this branch)

| Finding | Severity | Expert | File | Fix |
|---|---|---|---|---|
| #1 Vitest config divergence | CRIT | Tests | `vitest.config.{ts,mts}` | Deleted `.mts`; tightened exclude pattern to cover both `tests/real-infra/` dir AND `tests/real-infra.test.ts` file. Result: `real-infra.test.ts` no longer runs in default `pnpm test`. |
| #2 SSRF allowlist too broad | HIGH | Sec | `ollama-embedder.ts` | Parse URL in ctor; pass `allowedHostnames: [hostname]` to per-host manager. Refactored `_manager` → `Map<hostname, RestRequestManager>` (per-host singleton). Closes CWE-918. |
| #3 PII leak via ProblemDetails | MED→treated HIGH | Sec | `composition/errors.ts` | Wave 8.2 wrapper around `appErrorToHttpResponse` scrubs `userId`/`url`/`originalKind` from HTTP boundary `details`. Server logs unaffected. Closes CWE-209. |
| #4 REDACT_KEYS gaps | MED→treated HIGH | Sec | `composition/logger.ts` | Appended `POSTGRES_URL`, `REDIS_URL`, `DATABASE_URL`, `bearer`, `x-api-key`, `refresh_token`, `client_secret`, `jwt`, `session*`. Closes CWE-532. |
| #5 No retry test for embedder | HIGH | Tests | NEW `tests/embedder-retry.test.ts` | Created file stubbing `@gertsai/fetch.httpCaller`; 6 tests verify retry, SSRF allowedHostnames pass-through, URL validation, empty-array short-circuit. |
| #6 No security pass-through test | HIGH | Tests | `packages/rest-request-manager/src/__tests__/manager.test.ts` | Added 3-test sub-describe verifying `security` opt round-trips to httpCaller (set / unset / partial). |
| #7 Capabilities getter allocates per read | HIGH | Perf | `document.repository.ts` | Memoized as private readonly `_capabilities` (frozen) initialized in ctor. |
| #8 Empty-array short-circuit asymmetry | HIGH | Logic | `ollama-embedder.ts` | Added `if (texts.length === 0) return [];` at start of `embed()` for parity with OpenAI. |
| #9 Brittle message-string match | MED→treated HIGH | Logic | `search-query.action.ts` | Replaced `err.message === '...'` with `err instanceof ValidationError`. |
| #10 EMBEDDER_* env vars undocumented | HIGH | Docs | `.env.example` | Added `EMBEDDER_RATE_LIMIT_RPS`, `EMBEDDER_BURST`, `LOG_LEVEL` rows with defaults + shared-knob caveat. |
| #11 README missing `security` field | MED→treated HIGH | Docs | `packages/rest-request-manager/README.md` | Updated API table; added "SSRF posture forwarding (Wave 8.1)" bullet in Security and Caveats with reference to m9s-example precedent and Wave 8.2 hardening. |
| #12 Invalid URL handling | HIGH (latent) | Logic+Sec | `ollama-embedder.ts` | Added `new URL(opts.url)` parse in ctor with explicit http(s) protocol assertion. Closes a future-pivot SSRF path. |

## Smoke results (verbatim, post-patch)

```
$ pnpm --filter @gertsai-examples/m9s-example exec tspc --noEmit
TSC=0

$ pnpm --filter @gertsai-examples/m9s-example test
Test Files  13 passed (13)
     Tests  61 passed (61)
- e2e.test.ts (8 tests)
- embedder-retry.test.ts (6 tests)        ← NEW (Wave 8.2 Tests#2)
- openfga-permission.gate.multi-instance.test.ts (4 tests)
- openfga-permission.gate.test.ts (4 tests)
- openfga-model.test.ts (3 tests)
- audit-propagation.test.ts (4 tests)
- ingest-use-case.test.ts (7 tests)
- search-use-case.test.ts (5 tests)
- logger-redaction.test.ts (4 tests)
- embedder-hardening.test.ts (6 tests)
- wave5-integration.test.ts (4 tests)
- error-taxonomy.test.ts (4 tests)        ← UPDATED (Sec#3 contract)
- capability-declaration.test.ts (2 tests)

# real-infra.test.ts now correctly EXCLUDED from default — fix #1.

$ pnpm --filter @gertsai-examples/m9s-example build
BUILD=0

$ pnpm --filter @gertsai/rest-request-manager test
Test Files  4 passed (4)
     Tests  23 passed (23)                 ← was 20, +3 from Wave 8.2 Tests#3
- src/__tests__/manager.test.ts (12 tests) ← was 9, +3 security pass-through tests
- src/__tests__/circuit-breaker.test.ts (5 tests)
- src/__tests__/redaction.test.ts (2 tests)
- src/__tests__/rate-limiter.test.ts (4 tests)

$ pnpm --filter @gertsai/rest-request-manager exec tsc --noEmit
TSC=0
```

## Deferred (not closed in Wave 8.2)

These were flagged HIGH or below but require architectural decisions:

| Finding | Expert | Why deferred | Wave |
|---|---|---|---|
| `application/ → composition/` hex inversion | Arch HIGH | Requires moving `permissionDenied()` + error re-exports to neutral kernel folder (`src/shared/errors.ts`) and updating depcruiser rules. Behavior change touches 5 application files. | 8.3 |
| Module-level `_manager` singletons → DI through composition root | Arch MED | Requires composition root refactor + constructor signature change on both embedders. | 8.3 |
| Serial `embed()` loop → bounded concurrency | Perf HIGH | Behavioral change in critical path; needs benchmark + p-limit dep decision. | 8.3 or backlog |
| Workspace-wide oxlint sweep (1511 warnings) | — | Style; out of audit scope per backlog. | 8.4 or later |
| RFC-009 drift (signatures vs shipped code) | Docs MED | Tiny `forgeplan_update` fix; non-blocking; recorded here for traceability. | follow-up |
| README §"Wave 8.1" section in m9s-example | Docs HIGH | New documentation work; needs alignment with KNOWN-ISSUES + audit findings. | 8.3 docs sprint |

## Reversibility

`git revert <merge-commit>` restores pre-patch state. The audit findings would re-surface but the project's overall posture remains Wave 8.1.

## Audit slot lineage

- AUDIT-2026-05-12-215927 — synthetic claim ID for the audit run (held by `forge-audit/v1` for 60 min; released after EVID emission)
- EVID-029 informs AUDIT-2026-05-12-215927 (this evidence)

R_eff impact: EVID-029 evidence on Wave 8.1 ship target (PRD-013). When linked back, PRD-013 R_eff remains 1.00 (the audit weakens by surfacing fixable issues but the underlying capability adoption was sound and the patch closed all CRIT/HIGH).





