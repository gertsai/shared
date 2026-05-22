#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Pipeline runner perf check.
 *
 * Wave 29.B (PRD-065 NFR perf / RFC-027 §Bench plan replacement).
 * Wave 32.F (EVID-083 HIGH-3): hardened against JIT noise + baseline tampering.
 *
 * Replaces the vitest-bench harness (which produces NaN samples in vitest 3.x
 * experimental bench mode). Standalone Node perf script captures p50/p95/p99
 * via `performance.now()` over N samples, then either:
 *  - prints results (no baseline) — first-time baseline capture
 *  - compares against committed `perf-baseline.json` and exits non-zero if p95
 *    regresses beyond the gate threshold (CI mode)
 *
 * Usage:
 *   node scripts/perf-check.mjs                      # capture mode (prints, no write)
 *   node scripts/perf-check.mjs --update             # overwrite perf-baseline.json
 *   node scripts/perf-check.mjs --update --dry-run   # print what would be written
 *   node scripts/perf-check.mjs --gate               # CI mode: exit 1 on regression
 *
 * Env (all validated as finite positive numbers, NaN/empty rejected):
 *   PERF_N         (default 10000) — sample count
 *   PERF_WARMUP    (default 1000)  — warmup iterations
 *   PERF_GATE_PCT  (default 30)    — regression gate percentage
 *
 * The pipeline runner is consumed from the built `dist/` (so the check measures
 * what consumers actually get, including tsup bundling overhead).
 */

import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Wave 32.F (EVID-083 HIGH-3) — __dirname needed for dist freshness check below
// (computed early so the guard can run before importing from dist/).
const __dirname = dirname(fileURLToPath(import.meta.url));

// Wave 32.F (EVID-083 HIGH-3) — fail-fast if dist/ is stale or missing.
// The bench imports from `../dist/lib/controller/pipeline/index.js` to measure
// what consumers actually get post-build. Running on a stale dist/ produces
// meaningless numbers. CI should always `pnpm build` before this script;
// this guard catches the local-dev case where someone forgets.
const DIST_INDEX = resolve(__dirname, '..', 'dist', 'lib', 'controller', 'pipeline', 'index.js');
if (!existsSync(DIST_INDEX)) {
  console.error(
    `[perf-check] dist/ not found at ${DIST_INDEX}\n` +
    `Run \`pnpm --filter @gertsai/api-core build\` before perf-check.`,
  );
  process.exit(8);
}
// Best-effort freshness: if src/ is newer than dist/, warn (don't fail — CI may
// preserve a fresh dist/ via cache while src/ mtime is also fresh).
const distMtime = statSync(DIST_INDEX).mtimeMs;
const srcDir = resolve(__dirname, '..', 'src', 'lib', 'controller', 'pipeline');
try {
  const srcIndexMtime = statSync(resolve(srcDir, 'index.ts')).mtimeMs;
  if (srcIndexMtime > distMtime + 1000) {
    console.warn(
      '[perf-check] WARNING: src/lib/controller/pipeline/index.ts is newer than dist/.\n' +
      '  Consider running `pnpm --filter @gertsai/api-core build` to refresh.',
    );
  }
} catch { /* src missing — published-only mode */ }

import {
  PipelineRunner,
  DEFAULT_STAGES,
} from '../dist/lib/controller/pipeline/index.js';
import { defaultSession, UserType } from '@gertsai/core';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// Wave 32.F (EVID-083 HIGH-3) — explicit env parsing with NaN/non-finite/negative
// rejection. The previous `Number(env ?? default)` form silently propagated
// `NaN` (e.g. when PERF_GATE_PCT='abc'), which made every regression check
// vacuously pass — a hostile-contributor / fat-finger footgun.
function parseFiniteIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(
      `perf-check: env ${name}='${raw}' is not a positive finite integer — refusing to run`,
    );
  }
  return parsed;
}

function parseFiniteNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `perf-check: env ${name}='${raw}' is not a non-negative finite number — refusing to run`,
    );
  }
  return parsed;
}

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const GATE = args.includes('--gate');
// Wave 32.F (EVID-083 HIGH-3) — `--dry-run` lets contributors preview baseline
// rewrites without committing to a JIT-noise-poisoned snapshot.
const DRY_RUN = args.includes('--dry-run');

const N = parseFiniteIntEnv('PERF_N', 10_000);
// Wave 32.F (EVID-083 HIGH-3) — warmup raised from 200 → 1000 to clear V8
// TurboFan's tier-up threshold (~1000 invocations). 200 warmup samples
// produced noisy baselines because optimised code only arrived mid-measurement.
// 1000 × ~µs-scale pipeline run is still <1s wall-clock.
const WARMUP = parseFiniteIntEnv('PERF_WARMUP', 1000);
// Allow 30% drift by default (single-machine variance is high; CI tightens via env)
const REGRESSION_GATE_PCT = parseFiniteNumberEnv('PERF_GATE_PCT', 30);

const BASELINE_PATH = resolve(__dirname, '..', 'perf-baseline.json');

// ---------------------------------------------------------------------------
// Synthetic pipeline fixtures (zero I/O)
// ---------------------------------------------------------------------------

const sessionFactory = () =>
  defaultSession('bench', UserType.USER, 'api', 'v0.0.0');

// validateRequest stage calls getValidator(action.options.params) which expects
// either a typia validator function `(input) => { success, data, errors }` OR
// a TypiaParamsWithSchema object. Use the function form — minimal overhead.
const passingValidator = () => ({ success: true, data: {} });

const action = {
  name: 'bench.action',
  rest: 'GET /bench',
  path: 'bench.action',
  options: {
    auth: 'none',
    rest: 'GET /bench',
    handler: async (ctx) => ctx.respond({ ok: true }),
    params: passingValidator,
    response: passingValidator,
  },
};

const ctx = {
  params: {},
  meta: {},
  call: async () => undefined,
};

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
};

// Wave 35.D (EVID-087 arch-W4) — `controller: {}` removed; Wave 32.C HIGH-5
// dropped the `controller` field from PipelineDeps. Dead key deleted here.
const deps = {
  action,
  service: { logger: noopLogger },
  logger: noopLogger,
  sessionFactory,
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function runOnce() {
  const runner = new PipelineRunner(DEFAULT_STAGES);
  return runner.run({ ctx }, deps);
}

// Warmup — let V8 JIT settle
for (let i = 0; i < WARMUP; i++) {
  try {
    await runOnce();
  } catch (err) {
    console.error('[perf-check] WARMUP FAIL:', err.message, '\n', err.stack);
    process.exit(2);
  }
}

const samples = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  await runOnce();
  samples[i] = performance.now() - t0;
}

const sorted = Array.from(samples).sort((a, b) => a - b);
const pct = (q) => sorted[Math.min(N - 1, Math.floor(N * q))];

const result = {
  samples: N,
  warmup: WARMUP,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  p50_ms: +pct(0.5).toFixed(4),
  p95_ms: +pct(0.95).toFixed(4),
  p99_ms: +pct(0.99).toFixed(4),
  mean_ms: +(sorted.reduce((s, x) => s + x, 0) / N).toFixed(4),
  generated_at: new Date().toISOString().slice(0, 10),
};

console.log(JSON.stringify(result, null, 2));

// ---------------------------------------------------------------------------
// Baseline write
// ---------------------------------------------------------------------------

if (UPDATE) {
  // Wave 32.F (EVID-083 HIGH-3) — assemble the new baseline payload once so
  // both the dry-run preview and the real write emit identical bytes.
  const newBaseline = JSON.stringify(
    { gate_pct: REGRESSION_GATE_PCT, baseline: result },
    null,
    2,
  ) + '\n';

  if (DRY_RUN) {
    console.log('\n[perf-check] --dry-run mode: would write the following to', BASELINE_PATH);
    console.log(newBaseline);
    process.exit(0);
  }

  // Wave 32.F (EVID-083 HIGH-3) — surface the delta vs current baseline so a
  // mistaken --update (e.g. on a slow CI runner) doesn't silently poison the
  // committed baseline with a 10× regression.
  if (existsSync(BASELINE_PATH)) {
    try {
      const current = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
      const currentP95 = current.baseline?.p95_ms;
      if (Number.isFinite(currentP95)) {
        const deltaNum = (result.p95_ms / currentP95 - 1) * 100;
        const sign = deltaNum >= 0 ? '+' : '';
        console.log(
          `[perf-check] OVERWRITING baseline. p95 delta: ${sign}${deltaNum.toFixed(2)}% (current ${currentP95}ms → new ${result.p95_ms}ms)`,
        );
      }
    } catch {
      console.warn('[perf-check] WARNING: current baseline file unreadable; overwriting without comparison');
    }
  }

  writeFileSync(BASELINE_PATH, newBaseline);
  console.log(`[perf-check] baseline written → ${BASELINE_PATH}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Gate (CI mode)
// ---------------------------------------------------------------------------

if (GATE) {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `[perf-check] BASELINE NOT FOUND at ${BASELINE_PATH} — run with --update first`,
    );
    process.exit(3);
  }

  // Wave 32.F (EVID-083 HIGH-3) — guard JSON.parse; tampered/malformed baseline
  // previously crashed with an unhelpful stack trace. Now: explicit error code
  // + remediation hint.
  let file;
  try {
    file = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (parseErr) {
    console.error(`[perf-check] BASELINE PARSE FAILED at ${BASELINE_PATH}: ${parseErr.message}`);
    console.error('[perf-check] The file may be tampered or malformed. Verify integrity, then re-run --update.');
    process.exit(4);
  }

  // Wave 32.F (EVID-083 HIGH-3) — schema validation on parsed baseline.
  // Without these checks, a baseline with `p95_ms: null` (or missing entirely)
  // would compute `result.p95_ms / null` → Infinity, which then either
  // passes the gate (NaN comparison) or reports nonsense numbers.
  const baseline = file?.baseline;
  if (!baseline || typeof baseline !== 'object') {
    console.error(`[perf-check] BASELINE SCHEMA: missing 'baseline' object`);
    process.exit(5);
  }
  if (!Number.isFinite(baseline.p95_ms) || baseline.p95_ms <= 0) {
    console.error(`[perf-check] BASELINE SCHEMA: baseline.p95_ms must be positive finite (got: ${baseline.p95_ms})`);
    process.exit(6);
  }

  const gatePct = parseFiniteNumberEnv('PERF_GATE_PCT', file.gate_pct ?? REGRESSION_GATE_PCT);
  // Wave 35.D (EVID-087 logic-W3) — gate_pct === 0 makes any drift a regression
  // (DoS-via-bad-baseline). Reject zero with a separate diagnostic exit code.
  if (!Number.isFinite(gatePct) || gatePct <= 0 || gatePct > 10_000) {
    console.error(`[perf-check] GATE SCHEMA: gate_pct must be in (0, 10000] (got: ${gatePct})`);
    process.exit(7);
  }

  const ratio = (result.p95_ms / baseline.p95_ms - 1) * 100;
  const sign = ratio >= 0 ? '+' : '';
  console.log(
    `[perf-check] p95 delta vs baseline: ${sign}${ratio.toFixed(2)}% (gate: ±${gatePct}%)`,
  );
  console.log(
    `[perf-check] baseline p95 ${baseline.p95_ms}ms · current p95 ${result.p95_ms}ms · node ${result.node} · platform ${result.platform}`,
  );

  if (ratio > gatePct) {
    console.error(
      `[perf-check] REGRESSION: p95 ${result.p95_ms}ms is ${ratio.toFixed(2)}% slower than baseline ${baseline.p95_ms}ms (gate +${gatePct}%)`,
    );
    process.exit(1);
  }
  console.log('[perf-check] OK — within regression gate');
}
