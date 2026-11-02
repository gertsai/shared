---
depth: standard
id: EVID-111
kind: evidence
last_modified_at: 2026-11-02T17:12:15.721230+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
status: active
title: 'Independent native3 release-plan V8 coverage: PASS (single helper, 80 percent thresholds)'
---

---
assigned_number: 111
created: 2026-11-02
predicted_number: 111
slug: evid-independent-native3-release-plan-v8-coverage-pass-single-helper-80-percent
updated: 2026-11-02
---


# Independent native3 release-plan V8 coverage

## Verdict

**PASS — bounded single-helper coverage measurement.**

The independently executed, explicitly scoped V8 coverage command exits 0 with **28 passed, 0 failed, 0 skipped** tests. The actual JSON summary contains exactly **one instrumented source file**, `.github/scripts/release-plan.cjs`, with nonzero line/statement/branch/function totals. All four task-specified 80% thresholds pass: statements/lines **88.39%**, branches **88.23%**, functions **100.00%**. This is not an empty-collection or all-zero report.

This new record supplements, and does **not** rewrite or relabel, EVID-108's historical uninstrumented local PASS. No source file, test, tracked package manifest, lockfile, or EVID-108 body was changed by this tester. No other build/lint/formatter/check suite, registry query, push, or publication was executed for this assignment.

## Findings

1. **F1 — Nonempty, single-helper instrumentation observed.** The recorded raw V8 summary contains exactly one non-total file key: `/private/tmp/shared-changesets-20261102/.github/scripts/release-plan.cjs`. Every required metric has a nonzero denominator, and the per-file records equal the total records. The explicit helper include and node_modules exclusion produced actual instrumentation; earlier default dot-directory exclusion/empty-collection reports are not counted as valid coverage evidence.
2. **F2 — All four measured thresholds met.** The independently recorded run measured **99/112 lines and statements (88.39%)**, **60/68 branches (88.23%)**, and **3/3 functions (100.00%)**. Each of the four required metrics exceeds its task-specified **80%** threshold, with deltas of +8.39 percentage points for lines/statements, +8.23 for branches, and +20.00 for functions. The recorded command exited 0 with 28 passed, 0 failed and 0 skipped tests; these observations justify retaining the bounded PASS.
3. **F3 — Remaining coverage and scope are explicitly bounded.** **13/112 lines/statements and 8/68 branches remain uncovered.** This is coverage of the one named helper only, not the whole monorepo or all release behavior. It is not publication authorization or byte-level owner attestation of release artifacts. These are genuine observed findings and measurement limits, not fabricated defects; this metadata-only addition introduces no new test execution or measurement.

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: test

## Context and scope

- Parents: PRD-073 and RFC-029, linked with `informs`.
- Workspace: `/tmp/shared-changesets-20261102` (physical `/private/tmp/shared-changesets-20261102`).
- Source branch: `fix/changesets-approved-publication-plan`.
- Frozen source and actual local HEAD: `604b88b870e32da949d41d80370106d6faee4707`.
- Frozen pre-native base: `262fc20a5d328ff937a47d011954a7a62ca6c40d`.
- Dispatch identity: `claude-code/version-not-provided/tester-task-NativeReleaseTest`; no Claude Code version was supplied, so one is not invented.
- Target: only `.github/scripts/release-plan.cjs`, the newly introduced native approval/candidate/packed-plan helper. **Not** all `.github/scripts`, `release-preflight.cjs`, workflow YAML, all release behavior, or the monorepo.
- Existing suite: `.github/scripts/release-plan.test.mjs`, 28 cases. No new tests authored.
- Task acceptance threshold: ≥80% **each** for lines, statements, branches and functions, explicitly supplied by Main for this follow-up. The read PRD/RFC bodies do not themselves specify a numeric code-coverage percentage; the table below does not invent one.
- Hindsight recall and mental-model checks were already unavailable earlier in this same assignment session because the compatibility `/version` check failed; no memory content is substituted for the present measurements.

## Ground-truth verification

- Base..head: `262fc20a5d328ff937a47d011954a7a62ca6c40d..604b88b870e32da949d41d80370106d6faee4707`.
- Source: local git object store, resolved independently in a clean `bash --noprofile --norc -c` shell.
- Diff state: **DELTA=PRESENT** — 12 files changed, 834 insertions, 571 deletions. The cached diff is empty.
- The actual measured helper, its test file, root `package.json`, and `pnpm-lock.yaml` have no working-tree delta from the frozen source; the explicit `git diff --exit-code` returns 0.
- Expected new-source tokens: `verifyCandidate`, `requireApprovedPlan`, `describePlan`; derived from the native3 parent contract and the helper named in this coverage assignment.
- Token probe: **FOUND**, using the specialized Grep tool with the exact parameters and literal result below.
- Ground-truth verdict gate: **PASS-eligible**, not a green result over an empty claimed change.

### Literal frozen-delta command and output

```bash
set +u
R="/tmp/shared-changesets-20261102"
BASE=$(git -C "$R" rev-parse 262fc20)
HEAD=$(git -C "$R" rev-parse HEAD)
printf 'BASE=%s
HEAD=%s
' "$BASE" "$HEAD"
git -C "$R" diff --no-ext-diff --stat "$BASE".."$HEAD"
git -C "$R" diff --cached --stat
if git -C "$R" diff --quiet "$BASE".."$HEAD" && git -C "$R" diff --cached --quiet; then echo DELTA=EMPTY; else echo DELTA=PRESENT; fi
git -C "$R" diff --no-ext-diff --exit-code 604b88b870e32da949d41d80370106d6faee4707 -- .github/scripts/release-plan.cjs .github/scripts/release-plan.test.mjs package.json pnpm-lock.yaml
printf 'SOURCE_MANIFEST_LOCK_DIFF_EXIT=%s
' "$?"
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Measured process wall time: `0.054304` seconds.

```text
BASE=262fc20a5d328ff937a47d011954a7a62ca6c40d
HEAD=604b88b870e32da949d41d80370106d6faee4707
 .changeset/README.md                      |  24 +-
 .changeset/native-peer-contract-majors.md |   6 +
 .github/scripts/release-plan.cjs          | 119 ++++
 .github/scripts/release-plan.test.mjs     | 186 +++++++
 .github/workflows/ci.yml                  |   3 +
 .github/workflows/publish.yml             | 123 ++++-
 .github/workflows/release.yml             |  29 +-
 AGENTS.md                                 |   2 +-
 CONTRIBUTING.md                           |  33 +-
 README.md                                 |   6 +-
 package.json                              |   4 +-
 pnpm-lock.yaml                            | 870 ++++++++++++------------------
 12 files changed, 834 insertions(+), 571 deletions(-)
DELTA=PRESENT
SOURCE_MANIFEST_LOCK_DIFF_EXIT=0
```


### Exact token probe and literal output

Tool: `functions.grep`.

```json
{
  "i": "Checking measured source tokens",
  "pattern": "^async function verifyCandidate|^function requireApprovedPlan|^async function describePlan|^module\\.exports",
  "path": "/tmp/shared-changesets-20261102/.github/scripts/release-plan.cjs",
  "case": true,
  "gitignore": true,
  "skip": 0
}
```

```text
[/tmp/shared-changesets-20261102/.github/scripts/release-plan.cjs#CF0B]
 11:
*12:async function verifyCandidate({ github, context, expectedSha }) {
 13:  if (typeof expectedSha !== 'string' || !SHA_PATTERN.test(expectedSha)) {
 14:    throw new Error('Preview requires a full 40-character expected_sha.');
 15:  }
...
 24:
*25:function requireApprovedPlan(expected, actual) {
 26:  if (
 27:    typeof expected !== 'string' || !DIGEST_PATTERN.test(expected) ||
 28:    typeof actual !== 'string' || !DIGEST_PATTERN.test(actual) ||
...
 34:
*35:async function describePlan({ core, planPath, candidateSha, workspacePackages, summary = true, packed = false }) {
 36:  const document = JSON.parse(fs.readFileSync(planPath, 'utf8'));
 37:  if (document?.version !== 1 || !Array.isArray(document.plan)) {
 38:    throw new Error('Unsupported native Changesets publication plan.');
...
 118:
*119:module.exports = { verifyCandidate, requireApprovedPlan, describePlan };
```

The real frozen helper diff was independently read in full with this command (exit 0), not inferred from a worker's report:

```bash
git -C /tmp/shared-changesets-20261102 diff --no-ext-diff --unified=2 262fc20a5d328ff937a47d011954a7a62ca6c40d..604b88b870e32da949d41d80370106d6faee4707 -- .github/scripts/release-plan.cjs
```

It introduces the complete 119-line helper and its three exported functions; the coverage file identity below refers to that actual file.

## Runner detected

- Ecosystem: Node/TypeScript.
- Node: `v22.18.0`; pnpm: `10.29.2`.
- Runner: Vitest `3.2.4`, V8 coverage enabled.
- Coverage provider: `@vitest/coverage-v8@3.2.4`, independently resolved to the external `/private/tmp/changesets-coverage-tools-20261102/node_modules/.pnpm/...` installation, not newly added to a tracked manifest by this tester.
- Root config source: `package.json` has `vitest: ^3.0.0`, exact Changesets CLI `3.0.3`, packageManager `pnpm@10.29.2`, and no newly tracked coverage-provider dependency. Ground-truth diff confirms package manifest/lock unchanged from source604b.
- Output formats: Vitest text test summary + text coverage table + actual JSON coverage summary.

```bash
node --version && pnpm --version && pnpm exec vitest --version && node -e 'const fs=require("node:fs"); const p=require("@vitest/coverage-v8/package.json"); console.log(JSON.stringify({coverageProvider:p.name,version:p.version,resolvedPackage:fs.realpathSync(require.resolve("@vitest/coverage-v8/package.json"))}));' 
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Measured process wall time: `0.498883` seconds.

```text
v22.18.0
10.29.2
vitest/3.2.4 darwin-arm64 node-v22.18.0
{"coverageProvider":"@vitest/coverage-v8","version":"3.2.4","resolvedPackage":"/private/tmp/changesets-coverage-tools-20261102/node_modules/.pnpm/@vitest+coverage-v8@3.2.4_vitest@3.2.4/node_modules/@vitest/coverage-v8/package.json"}
```


## Command run

The exact dispatcher-requested command was run once. It explicitly includes the normally dot-directory-hidden helper and overrides coverage exclusions to exclude node_modules rather than silently excluding the entire `.github` path. This **narrows the asserted coverage scope** to one helper; it does not claim repository-wide coverage.

```bash
pnpm exec vitest run --dir .github/scripts --coverage.enabled --coverage.provider v8 --coverage.include .github/scripts/release-plan.cjs --coverage.exclude '**/node_modules/**' --coverage.reporter text --coverage.reporter json-summary --coverage.reportsDirectory /tmp/changesets-independent-coverage-20261102 --coverage.thresholds.lines 80 --coverage.thresholds.functions 80 --coverage.thresholds.branches 80 --coverage.thresholds.statements 80
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Measured process wall time: `1.021014` seconds.

```text

 RUN  v3.2.4 /private/tmp/shared-changesets-20261102
      Coverage enabled with v8

 ✓ .github/scripts/release-plan.test.mjs (28 tests) 81ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Start at  20:02:41
   Duration  435ms (transform 19ms, setup 0ms, collect 18ms, tests 81ms, environment 0ms, prepare 46ms)

 % Coverage report from v8
------------------|---------|----------|---------|---------|--------------------
File              | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s  
------------------|---------|----------|---------|---------|--------------------
All files         |   88.39 |    88.23 |     100 |   88.39 |                    
 release-plan.cjs |   88.39 |    88.23 |     100 |   88.39 | ...0,53-54,109-115 
------------------|---------|----------|---------|---------|--------------------
```


Exit code: **0**. Vitest reports one passed file and 28 passed cases; no instrumentation error or threshold failure occurred.

## Summary

| Metric | Value |
|---|---|
| Passed | 28 |
| Failed | 0 |
| Skipped | 0 |
| Flaky (observed passed on retry) | 0 observed; retries not requested |
| Total unique test cases | 28 |
| Test files | 1 passed |
| Instrumented source files | 1 |
| Runner-reported duration | 0.435 seconds |
| Test-body duration | 0.081 seconds |
| Measured process wall time | 1.021014 seconds |
| Required coverage metrics with nonzero totals | 4/4 |
| Thresholds met | 4/4 |
| Required metric records skipped by provider | 0 |

## AC coverage delta

Acceptance target: **80.00% for each required metric**, from the explicit bounded coverage follow-up assignment, against the native helper implementing portions of PRD-073 FR-003/FR-007 and RFC-029's candidate/approval/packed-plan contract.

| Metric | Covered / total | Provider skipped | Actual | Task target | Delta | Result |
|---|---|---|---|---|---|---|
| Statements | 99/112 | 0 | 88.39% | 80.00% | +8.39 pp | PASS |
| Lines | 99/112 | 0 | 88.39% | 80.00% | +8.39 pp | PASS |
| Branches | 60/68 | 0 | 88.23% | 80.00% | +8.23 pp | PASS |
| Functions | 3/3 | 0 | 100.00% | 80.00% | +20.00 pp | PASS |

The minimum measured required metric is branches at88.23%, **+8.23 percentage points** above its threshold. All four measured totals are nonzero. No numerical before/after code-coverage improvement is claimed: EVID-108 did not instrument coverage, so a previous percentage and temporal percentage delta are unavailable. The deltas above are explicitly **actual minus acceptance target**, not an invented change from the historical record.

The raw JSON also includes an optional `total.branchesTrue` entry with zero totals and `pct="Unknown"`; it is not one of the four requested Vitest threshold metrics, is not used to inflate coverage, and is not claimed to be measured. The per-file and total records agree for every required metric.

## Actual instrumented-file verification

Actual non-`total` summary keys:

```text
/private/tmp/shared-changesets-20261102/.github/scripts/release-plan.cjs
```

Python Eval parsed the actual raw JSON returned by the specialized read tool and asserted:

- exactly one non-`total` file key;
- the file key ends with `/.github/scripts/release-plan.cjs`;
- the command exit code is0;
- each of lines/statements/branches/functions has `total > 0` and `pct >= 80`;
- each per-file required-metric record equals its corresponding total record.

All assertions completed successfully. This directly rejects empty instrumentation or a report covering only tests/unrelated modules. It does not infer success merely from the text table's `All files` row.

## Raw coverage summary

Path: `/tmp/changesets-independent-coverage-20261102/coverage-summary.json` (644 bytes as listed by the reader). Verbatim read with `functions.read(path="/tmp/changesets-independent-coverage-20261102/coverage-summary.json:raw")`:

```json
{"total": {"lines":{"total":112,"covered":99,"skipped":0,"pct":88.39},"statements":{"total":112,"covered":99,"skipped":0,"pct":88.39},"functions":{"total":3,"covered":3,"skipped":0,"pct":100},"branches":{"total":68,"covered":60,"skipped":0,"pct":88.23},"branchesTrue":{"total":0,"covered":0,"skipped":0,"pct":"Unknown"}}
,"/private/tmp/shared-changesets-20261102/.github/scripts/release-plan.cjs": {"lines":{"total":112,"covered":99,"skipped":0,"pct":88.39},"functions":{"total":3,"covered":3,"skipped":0,"pct":100},"statements":{"total":112,"covered":99,"skipped":0,"pct":88.39},"branches":{"total":68,"covered":60,"skipped":0,"pct":88.23}}
}
```

### Raw summary SHA256

```bash
shasum -a 256 /tmp/changesets-independent-coverage-20261102/coverage-summary.json
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Measured process wall time: `0.027781` seconds.

```text
5dbdfb827f2e50158d959295128cf2c632c9f3561beb7e4f69d61979619eac69  /tmp/changesets-independent-coverage-20261102/coverage-summary.json
```


Expected raw summary SHA256: **`5dbdfb827f2e50158d959295128cf2c632c9f3561beb7e4f69d61979619eac69`**.

## Failing tests

None observed. The single requested coverage run exits0; all28 cases pass. There is no runner-unavailable, suite-empty, threshold-failed or instrumentation-failed condition in this independent report.

## Slow tests (top 5)

Individual assertion timings are not emitted by the requested default text reporter. They were not fabricated or copied from the earlier uninstrumented EVID-108 run. The only measured suite duration in this run is81ms for `.github/scripts/release-plan.test.mjs` (28 cases), with435ms runner duration and the process wall time recorded above. No extra suite execution was added solely to gather per-assertion timings for this bounded coverage assignment.

## Flaky candidates

No retry or inconsistent-result event was observed. The requested command does not enable retries; a single coverage run is not a flakiness investigation. The count is **0 observed**, not a guarantee about future runs. No skips are collapsed into passes.

## Limitations and next steps

- This PASS supports only the **single native helper's measured coverage** and its existing 28-case suite. It does not mean all branches are tested: 13/112 statements/lines and8/68 branches remain uncovered despite exceeding the task thresholds.
- The text report truncates its uncovered-line display; no precise uncovered-line list is invented from that truncated field.
- Earlier default-exclusion/empty-collection or external c8 attempts mentioned by the dispatcher are not this run's results and are not used as valid measurement evidence or as code-regression claims. This record is grounded in the actual one-file V8 report above.
- EVID-108 remains an honest historical **uninstrumented** record and was not modified. This EVID is the new canonical numeric coverage measurement.
- No source/test changes, dependency installation, tracked manifest/lock edit, build, typecheck, lint, formatter, native registry preview, pack/publish operation, push, tag/release creation, or publication was performed by this tester during this follow-up. The real publication destination remains GitHub Packages, not npmjs; no owner publication approval is implied.
- Hand this evidence to Main/guardian for the parent gate. Parent activation, historical-record reconciliation and any real publication remain outside this tester's authority.

