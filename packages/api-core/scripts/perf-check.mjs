#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Pipeline runner perf check.
 *
 * Wave 29.B (PRD-065 NFR perf / RFC-027 §Bench plan replacement).
 *
 * Replaces the vitest-bench harness (which produces NaN samples in vitest 3.x
 * experimental bench mode). Standalone Node perf script captures p50/p95/p99
 * via `performance.now()` over N samples, then either:
 *  - prints results (no baseline) — first-time baseline capture
 *  - compares against committed `perf-baseline.json` and exits non-zero if p95
 *    regresses beyond the gate threshold (CI mode)
 *
 * Usage:
 *   node scripts/perf-check.mjs               # capture mode (prints + writes baseline if --update)
 *   node scripts/perf-check.mjs --update      # overwrite perf-baseline.json
 *   node scripts/perf-check.mjs --gate        # CI mode: exit 1 on regression
 *
 * The pipeline runner is consumed from the built `dist/` (so the check measures
 * what consumers actually get, including tsup bundling overhead).
 */

import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  PipelineRunner,
  DEFAULT_STAGES,
} from '../dist/lib/controller/pipeline/index.js';
import { defaultSession, UserType } from '@gertsai/core';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const GATE = args.includes('--gate');
const N = Number(process.env.PERF_N ?? 10_000);
const WARMUP = Number(process.env.PERF_WARMUP ?? 200);
// Allow 30% drift by default (single-machine variance is high; CI tightens via env)
const REGRESSION_GATE_PCT = Number(process.env.PERF_GATE_PCT ?? 30);

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const deps = {
  action,
  controller: {},
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
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      { gate_pct: REGRESSION_GATE_PCT, baseline: result },
      null,
      2,
    ) + '\n',
  );
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
  const file = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const baseline = file.baseline;
  const gatePct = file.gate_pct ?? REGRESSION_GATE_PCT;

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
