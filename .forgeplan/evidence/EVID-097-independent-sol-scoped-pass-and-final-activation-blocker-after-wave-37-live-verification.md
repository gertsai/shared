---
depth: standard
id: EVID-097
kind: evidence
last_modified_at: 2026-10-31T10:02:54.958958+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-072
  relation: informs
- target: RFC-028
  relation: informs
status: deprecated
title: Independent Sol scoped PASS and final activation BLOCKER after Wave 37 live verification
---

---
assigned_number: 97
created: 2026-10-31
predicted_number: 97
slug: evid-independent-sol-scoped-pass-and-final-activation-blocker-after-wave-37
updated: 2026-10-31
---

# Independent Sol final gate

## Structured Fields
verdict: refutes
congruence_level: 3
evidence_type: audit

## Reviewer and provenance
Reviewer openai-codex/gpt-6.1-sol, independent read-only OMP subprocesses bg_14 and bg_15; prompts /tmp/wave37-sol-review.txt and /tmp/wave37-sol-final.txt. Exact command: omp --model openai-codex/gpt-6.1-sol --thinking high --no-prewalk --no-session --no-title --no-extensions --tools read,grep,glob,lsp -p @/tmp/wave37-sol-final.txt. Parent records the observed verdict, not a substitute verdict. Review inspected actual logs and source pins from EVID-096; did not run tests or independently recompute hashes.

## Observed verdict
Scoped repair and Wave37 reconciliation PASS. No new in-scope P1/P2 production defect. Overall activation BLOCKER.

Both live rounds27 passed/0 failed/0 skipped; migration11 each; NATS remote roundtrips through test-only seam; unit11; pg-client31 including actual11 integration cases. Scope2 typed/7 operational raw, diagnostic eighth raw, no aggregator requirement. EVID096 preserves boundaries. React/storage source pins shared with EVID093 match.

Root pnpm test exit1 at packages/auth-openfga/src/__tests__/constants.test.ts:51: hardcoded localhost:8080 expected, explicit isolated OPENFGA_API_URL http://127.0.0.1:51127 actual. No-bail43 workspaces pass/1 fails. SPEC008 requires full-repository/all-CI green. ADR016 prohibits package repair in this task. KNOWN-ISSUES is not a gate waiver.

## Independent lifecycle disposition
EVID094 may retire current applicability in favor of EVID096 actual strict CLI proof; preserve failure. EVID090 may retire incomplete current closure in favor of EVID096 while retaining root-red boundary. EVID095 MUST remain active: activation still blocked. PRD072 and RFC028 MUST remain draft, no force or dependency removal.

## Revisit trigger
Separately authorized package-level remediation of the incidental-default test, or explicit authorized revision/waiver of applicable full-root gate; then actual regression, fresh evidence, independent review and effective-trust reevaluation. No change to failed tests authorized in this Wave37 task.

## Parent post-disposition checks
EVID090 and EVID094 deprecated with explicit EVID096/EVID097 replacement reasons; EVID095 remains active. Actual per-artifact scores: PRD0710.9, ADR0050.7, SPEC0080.7, PRD0720, RFC0280. Both draft targets validate with zero MUST errors, but active refuting EVID095/EVID097 and overall root-red gate prohibit activation. Recorded task containers and both isolated Ollama processes stopped.


## Deprecation

Reason: Dated readiness blocker resolved: EVID-096 proves Wave37/CLI gates; separately authorized test-only maintenance and actual green root regression EVID-098 remove final root blocker; independent Sol guardian EVID-099 explicitly authorizes retirement. Historical failures and links preserved.
Date: 2026-10-31
