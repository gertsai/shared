---
depth: standard
id: EVID-091
kind: evidence
last_modified_at: 2026-10-30T21:53:56.086834+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-003
  relation: informs
status: active
title: 'useEntity stable snapshot regression: HEAD fails, working tree passes'
---

---
assigned_number: 91
created: 2026-10-30
predicted_number: 91
slug: evid-useentity-stable-snapshot-regression-head-fails-working-tree-passes
updated: 2026-10-30
---

# useEntity stable snapshot regression

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: test

## Scope and provenance

Observed on 2026-10-30 in gertsai/shared, branch feat/write-rules-getafter-claims, HEAD 2f0327f2eb208cd024b68249d35bce992f139096. Implementation/test author: openai-codex/gpt-6-luna. Independent reviewer: openai-codex/gpt-6.1-sol. Commands and browser interactions executed by the parent session. Evidence describes the uncommitted working tree, not a published release. Parent requirement: PRD-003 framework adapter behavior.

## Reproduction

The HEAD useEntity implementation returns a fresh {data, version} on every getSnapshot call. A throwaway React 18.3.1 browser fixture bundled the HEAD hook in memory without overwriting repository source. Baseline exceeded a 30-render guard. The permanent React renderer tests, run against HEAD through a throwaway Vite pre-transform, failed 2/2 with 'EntityView exceeded its render safety bound'; React also reported 'The result of getSnapshot should be cached to avoid an infinite loop'. The negative proof completed normally, without a timeout or compile/import error. Command: pnpm exec vitest run --config /tmp/shared-react-baseline.config.mts (from repository root).

## Working-tree result

The preexisting WeakMap snapshot fix is preserved: stable object while data identity/version are unchanged, new snapshot after mutation, independent snapshot for another entity at equal version. Replaced mocked wiring tests with real Entity + React test renderer cases. Tests have per-instance render bounds and afterEach cleanup.

- pnpm --filter @gertsai/entity-react test: 7 files, 28 tests passed, including 2 real-renderer regression cases; final run after review remediation.
- Actual browser: initial Ada:0; switch at equal version to Grace:0; increment/rename to Grace!:1; switch back to Ada:0; increment/remount preserved Ada:1; empty error display and no page errors.
- Affected dependency build: 15 packages completed successfully, including entity-react ESM/CJS/declarations.
- Affected typecheck: 7 packages passed, including entity-react; package tsconfig excludes tests.
- publint --strict and attw --pack . --ignore-rules cjs-resolves-to-esm passed for entity-react and 4 related storage packages.
- pnpm install --frozen-lockfile --ignore-scripts passed. Compared lockfile importers before/after installation: only packages/entity-react changed, none removed.
- Root CI lint command pnpm run lint passed. Package lint scripts fail because root ESLint config supplies no matching TypeScript package scope; this is not claimed as a package-source lint pass.

## Independent review

Sol initially returned CONCERNS on test termination, failure-path cleanup, and an overstated unsubscription test name. Luna corrected all three. Final Sol verdict PASS: no remaining scoped findings, no production defect identified in snapshot caching. The stale-data test does not claim to prove subscriber disposal.

## Changes and limits

Scoped files: packages/entity-react/src/use-entity.ts (preexisting cache fix retained), src/__tests__/useEntity.test.ts, package.json (dev-only React renderer dependencies), README.md, .changeset/fresh-entities-remember.md, and pnpm-lock.yaml dependency entries. Browser/config scratch files are temporary and removed after verification. No commit, push, PR, merge, publication, or full-workspace CI claim. Write-rules readiness is recorded separately.


