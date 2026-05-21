---
'@gertsai/session': minor
'@gertsai/entity-audit': patch
'@gertsai/api-core': patch
---

Wave 29 — final pre-v1.0 polish: M4 uuid rename + bench harness fix + perf gate.

**@gertsai/session MINOR bump — surface-breaking** (pre-1.0 minor per CLAUDE.md semver policy):

- **M4 (EVID-080)** — `OperatorRef._uid → OperatorRef.uuid` rename. Parity with the rest of `@gertsai/*` ecosystem (the underscore-prefix was Orchestra-legacy carryover).
  - Type: `interface OperatorRef { readonly uuid: string; readonly type: OperatorType }` (was `_uid`)
  - `Session.$switchOperator(operator)` reads `operator.uuid` (was `operator._uid`)
  - `operator-switched` event emits `{ prev: { uuid, type }, current: { uuid, type } }` (was `_uid`)

Migration: replace `{ _uid: x, type: y }` with `{ uuid: x, type: y }` at all call-sites passing `OperatorRef` to `Session.$switchOperator`, and update event listeners reading `prev._uid` to `prev.uuid`. No other surface changes.

**@gertsai/entity-audit patch cascade** — depends on session; behaviour unchanged.

**@gertsai/api-core patch — bench harness fix + perf gate**:

- Removed broken vitest experimental `bench` harness (produced NaN samples with vitest 3.x). Replaced with standalone Node perf-check script at `scripts/perf-check.mjs`.
- New baseline at `packages/api-core/perf-baseline.json` — 10000 samples post-warmup, captured on darwin-arm64 Node 22.18:
  - p50: 1.6μs
  - p95: 3.6μs
  - p99: 6.8μs
- New npm scripts:
  - `pnpm --filter @gertsai/api-core perf:check` — run + print (no gate)
  - `pnpm --filter @gertsai/api-core perf:update` — capture new baseline (overwrites `perf-baseline.json`)
  - `pnpm --filter @gertsai/api-core perf:gate` — CI regression gate (exits 1 if p95 regression > `PERF_GATE_PCT` env, default 30%)
- Default gate is **±30%** (not ±2% per RFC-027) because: single-machine variance is high without dedicated bench hardware; baseline is post-extraction (no pre-extraction baseline exists). Future infra can tighten via `PERF_GATE_PCT=5 pnpm perf:gate` on dedicated CI runners.

**Wave 29.C (m9s-example real-infra smoke)** intentionally NOT bundled into this changeset — requires live Docker stack (Postgres + Redis + NATS + OpenFGA + Ollama). Documented as manual verification step pre-v1.0 release. Per-stage unit tests + integration tests (75+ from Wave 27 + 30+ from session) cover behaviour preservation at the granular level.

Closes EVID-080 M4 last open finding. After Wave 26 + 28 + 29: **100% of EVID-080 audit findings closed** (HIGH 5/5, MED 7/7, LOW 10/10). v1.0 audit ledger is clean.

Refs: PRD-064, EVID-080 (Wave 25 audit M4), PRD-065 NFR perf, RFC-027 §Bench plan replacement.
