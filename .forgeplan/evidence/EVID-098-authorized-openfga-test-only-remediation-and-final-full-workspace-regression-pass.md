---
depth: standard
id: EVID-098
kind: evidence
last_modified_at: 2026-10-31T13:43:18.687543+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-071
  relation: informs
- target: PRD-072
  relation: informs
- target: RFC-028
  relation: informs
status: active
title: Authorized OpenFGA test-only remediation and final full workspace regression PASS
---

---
assigned_number: 98
created: 2026-10-31
predicted_number: 98
slug: evid-authorized-openfga-test-only-remediation-and-final-full-workspace
updated: 2026-10-31
---

# Authorized test-only remediation

## Structured Fields
verdict: supports
congruence_level: 3
evidence_type: test

## Authorization and scope
After the previous blocked report, user requested “давай доедлывать”, authorizing the explicitly named separately scoped package-test repair. Luna exact selector openai-codex/gpt-6-luna removed only the incidental default API URL assertion in packages/auth-openfga/src/__tests__/constants.test.ts. No production code changed, no replacement assertion that copies defaults, no endpoint unset, no verification skipped. ADR016 restriction on Wave37 production library expansion remains; this is separately authorized test maintenance, not a DSL extension or gate waiver. Failing-before logs remain EVID096/097.

## Actual final commands
pnpm test exit0:5788 passed,105 intentionally skipped,0 failed. auth-openfga154 passed; pg-client storage-provider.integration.test.ts11 executed (213ms), not skipped; example94 passed/3 skipped. pnpm typecheck exit0 includes strict CLI and compile-only brands. Prior workspace build and two27/0/0 live rounds plus both remote NATS smokes remain applicable: only one test case removed since those production pins, no runtime implementation changed.

## Isolation
Fresh task-owned containers: PG42ce7478cd63b94a66a56fa450db3274f50adeee2cd0b40b243073304fb6432a at127.0.0.1:50022; Redis0b5576ba5b5ab09409f2d148f4a2e4dddf6f7c5428bb39919bbd51fcab9d9e48 at50023; OpenFGAdb45725e266cf81799d716dd581c44eb71d807cbf22311d2a1c3c855b9b3f087 at50024. Both FGA_API_URL and OPENFGA_API_URL explicitly use task50024 endpoint. POSTGRES_URL=m9s and PG_TEST_URL=wave37_storage_regression on recorded task server. Node pg driver confirmed same172.17.0.2:5432 and different expected databases. DOTENV_* stripped in child copies before setting absolute task empty fixture and utf8. Parent env unchanged. Root uses memory/mock/local nonproduction defaults; no combined production deployment claimed.

## Source and raw provenance
Test file SHA256 7b253939ed3b093314ada7f54e4a0a6ce8387bcda775aba0bc2d12c042200719
Production/config/source pins unchanged from EVID096; React/storage preserved.
/tmp/wave37-final-root-test.log | 82526 bytes | SHA256 d7844f29e0e21b45f299498a336573dcceac23cc9c76aa9d729f8af74d6ecc09
/tmp/wave37-final-root-typecheck.log | 4137 bytes | SHA256 22003ce3995f93b82948035bc01f5a37c9032212f96c83a5f39224e6190f0f01
/tmp/wave37-final-db-proof.log | 255 bytes | SHA256 a256d14ca7711cb246ba4565a79f598918c3b3ac3aa2c7036be139d4ead5505b

## Gate
Independent Sol review required before retiring EVID095/EVID097 or activation. Historical failing results remain unchanged. No commit/push/PR/merge/npm publication.





