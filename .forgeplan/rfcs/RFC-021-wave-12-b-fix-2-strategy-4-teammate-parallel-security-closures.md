---
depth: standard
id: RFC-021
kind: rfc
last_modified_at: 2026-05-16T17:49:39.197161+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-030
  relation: informs
status: active
title: Wave 12.B-fix-2 strategy — 4-teammate parallel security closures
---

# RFC-021 — Wave 12.B-fix-2 execution strategy

## Summary

4 parallel teammates close 7 HIGH security findings from EVID-044 across 4 Tier-1 packages. Teammate A: `@gertsai/utils` (3 findings: DNS rebinding TOCTOU + AbortSignal wiring + getRandomId deprecation). Teammate B: `@gertsai/m9s-cache` (2 findings: Redlock error distinction + validateKeys default inversion). Teammate C: `@gertsai/pg-client` (1 finding: runBatch transaction wrapping). Teammate D: `@gertsai/fetch` (1 finding: body-size limit uniform enforcement). Pre-seed by orchestrator: confirm test surfaces, identify any downstream consumer impacts. All 4 packages get minor SemVer bumps via changesets. Total wallclock target under 2 hours from teammate spawn to PR open.

## Context

PRD-030 requires fixing 7 HIGH-severity issues spread across 4 Tier-1 packages. The work is highly parallel (4 independent packages, no shared files); RFC-021 pins HOW: which teammate works on what files, what fix pattern per finding, what verification command per fix.

The work-shape is the same as Wave 12.B-fix-1 (RFC-020) — surgical fixes following an audit, single PR, multi-package changesets. RFC-020 set the precedent for orchestrator pre-seed + parallel-teammate spawn + Phase 4 downstream patch.

## Motivation

EVID-044 identified these 7 HIGH issues as fixable in 1.5 days. Without the fix:
- Production deploys ship CWE-770 DoS vector (unbounded body acceptance).
- DNS-rebinding guards are broken (CWE-918 with TOCTOU window).
- `getRandomId` invites security misuse (CWE-338) — name suggests "secure random ID" but uses `Math.random()`.
- `validateKeys` default = backwards: production accepts arbitrary keys silently (CWE-20).
- `RedlockLockProvider` swallows Redis-down errors → silent DoS amplification.
- `runBatch` partial commits on N-th op failure leave DB in mixed state (data integrity).

Closing these is precondition for Wave 12.B-fix-3 (HIGH type-system) and eventual v1.0 readiness.

## Proposed Direction

### D-1 — Teammate roster

4 parallel teammates, disjoint package ownership:

| Teammate | Subagent | Scope | LOC budget |
|---|---|---|---|
| **A** | `agents-core:coder` | `packages/utils/**` only | ≤200 LOC |
| **B** | `agents-core:coder` | `packages/m9s-cache/**` only | ≤100 LOC |
| **C** | `agents-core:coder` | `packages/pg-client/**` only | ≤120 LOC |
| **D** | `agents-core:coder` | `packages/fetch/**` only | ≤80 LOC |

Total ≤500 LOC delta across 4 packages.

### D-2 — Per-finding fix patterns

**FR-001 (fetch body-size):** modify `resolveBody` to enforce `maxBodySize` at every branch:
- `string` → `Buffer.byteLength(body, 'utf8')`
- `Uint8Array` / `Buffer` / `ArrayBuffer` / typed-array views → `.byteLength`
- `Blob` → `.size`
- `URLSearchParams` → `.toString().length` (with `Buffer.byteLength` for accuracy)
- `FormData` → skip (size-unknown until materialised) OR estimate via `entries()` iteration
- Iterable / async iterable → existing accumulator path (unchanged)

Throw `BodyTooLargeError` (new exported class extending `Error`) with structured fields `{ size: number; limit: number }`. Update existing tests; add new tests covering each branch.

**FR-002 (DNS rebinding TOCTOU):** simpler approach — don't pin IPs across separate operations. Update `validateWebhookUrlAsync` JSDoc to clarify: "Validates URL **at call time**. DNS results may change between validate and use — for true rebinding protection, callers should use the returned `resolvedIp` field with explicit `Host` header on the subsequent fetch." Return type extended:
```ts
interface ValidationResultAsync {
  valid: boolean;
  url: URL;
  resolvedIp?: string;    // NEW — IP that satisfied the validator
  error?: SsrfError;
}
```
Backward compat: existing callers reading `valid`/`url`/`error` unchanged. New field is additive.

**FR-003 (AbortSignal in DNS resolve):** wrap `dns.resolve4`/`resolve6` in `Promise.race` with an abort-signal-attached rejector:
```ts
async function abortableResolve(fn: () => Promise<string[]>, signal: AbortSignal): Promise<string[]> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('DNS resolution aborted')));
    }),
  ]);
}
```
Or migrate to `dns.lookup` with `{ signal }` option (Node 18+). Simpler if `lookup` semantics work for the use case.

**FR-004 (getRandomId deprecation):**
1. Add `@deprecated` JSDoc + console.warn-once gated by `process.env.NODE_ENV !== 'test'` (don't pollute test output).
2. Add `getSecureRandomId(length?: number)` new export, using `randomBytes` from `node:crypto` → base62-encoded.
3. Keep `getRandomId` runtime behaviour unchanged.

**FR-005 (Redlock error distinction):**
```ts
async tryAcquire(key: string, ttlMs: number): Promise<UnlockFunction | null> {
  try {
    const lock = await this._redlock.acquire([key], ttlMs);
    return () => lock.release();
  } catch (err: unknown) {
    if (this._isLockHeldError(err)) return null;  // expected — lock-unavailable
    throw err;  // unexpected — Redis-down, misconfigured, etc.
  }
}

private _isLockHeldError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: string }).name;
  return name === 'ResourceLockedError' || name === 'ExecutionError';
  // (Redlock raises these for lock-already-held)
}
```

**FR-006 (validateKeys default-inversion):**
```ts
// Before
this.validateKeys = options.validateKeys ?? (process.env.NODE_ENV !== 'production');

// After
this.validateKeys = options.validateKeys ?? true;
```
Update test fixtures explicitly using `validateKeys: false` where they rely on lax validation (e.g., test keys with special chars).

**FR-007 (pg-client runBatch atomic):**
```ts
async _apply() {
  await this._client.$executeRaw`BEGIN`;
  try {
    for (const op of this._ops) {
      // existing per-op logic
    }
    await this._client.$executeRaw`COMMIT`;
  } catch (err) {
    try {
      await this._client.$executeRaw`ROLLBACK`;
    } catch (rollbackErr) {
      // Attach to thrown error
      Object.assign(err as object, { rollbackError: rollbackErr });
    }
    throw err;
  }
}
```
Add `capabilities.batches: 'atomic'` if other adapters need to distinguish; otherwise leave the bool. Add `mockPgClient`-driven test that simulates failure on op N and verifies rollback.

### D-3 — Cross-validation by orchestrator

After all 4 teammates report:
1. Verify each `file:line` cited in EVID-044 is now fixed (read each file, confirm pattern).
2. Run `pnpm --filter <pkg> test typecheck` for each of the 4 packages.
3. Run full `pnpm build` to confirm no cross-package breakage.
4. Inspect any new exported types — confirm no externals leak (Wave-13-pattern regression check).

### D-4 — Changesets

Each affected package: minor bump body cites finding numbers from EVID-044.
- `.changeset/wave-12-b-fix-2-fetch-body-size.md`
- `.changeset/wave-12-b-fix-2-utils-ssrf-hardening.md`
- `.changeset/wave-12-b-fix-2-m9s-cache-security-defaults.md`
- `.changeset/wave-12-b-fix-2-pg-client-batch-atomic.md`

OR one combined changeset per package (4 changesets total). RFC chooses 4 separate to make publish-history clear.

### D-5 — Branch and PR

```bash
git checkout -b fix/wave-12-b-fix-2-high-security
# (teammate work)
git commit -m "fix(*): Wave 12.B-fix-2 — close 7 HIGH security findings"
gh pr create --base main --title "..." --body "Refs: PRD-030, EVID-044"
```

### D-6 — Stop condition (per CLAUDE.md red line)

After merge: release.yml fires, Version Packages PR auto-created. Orchestrator STOPS at this point — user provides explicit Y for IRREVERSIBLE publish per CLAUDE.md.

## Implementation Phases

| Phase | Duration | Owner | Output |
|---|---|---|---|
| Phase 1 — Pre-seed | 5 min | Orchestrator | Test surface inventory; identify downstream impacts |
| Phase 2 — Parallel teammates | 20–40 min wallclock | 4 × coder agents | Per-package fixes |
| Phase 3 — Verification | 10 min | Orchestrator | Tests + typecheck + full build green; spot-check `file:line` fixes |
| Phase 4 — Downstream patch (if any) | 5 min | Orchestrator | Patch consumer imports if API surface changed |
| Phase 5 — Evidence + changesets | 10 min | Orchestrator | EVID-046 + 4 changesets |
| Phase 6 — Activate + commit + PR | 10 min | Orchestrator | Activate PRD-030 + RFC-021 + EVID-046; branch + commit + PR |
| Phase 7 — STOP | 0 min | User | Y on Version Packages PR (IRREVERSIBLE publish) |

Wallclock budget: ≤2 hours.

## Invariants

- **I-1** — Each teammate touches ONLY its assigned package directory.
- **I-2** — Each EVID-044 cited `file:line` for the closed HIGH findings is verifiably patched by reading the file post-fix.
- **I-3** — No external library types leak into emitted `dist/index.d.ts` (Wave-13-pattern regression check).
- **I-4** — All existing tests pass; new tests added for security-significant behaviour.
- **I-5** — No new dependencies in any `package.json`.
- **I-6** — `.forgeplan/*` mutations only via MCP.
- **I-7** — Backward-compatibility: `getRandomId` keeps working; `validateKeys` keeps working with explicit `false`; `validateWebhookUrlAsync` return type is additive (new `resolvedIp` field).
- **I-8** — `BodyTooLargeError` is a new exported class — additive surface.

## Rollback Plan

If any teammate's fix causes downstream breakage discovered in Phase 3:

1. Read the affected file, identify minimum-viable patch.
2. Re-spawn that teammate with narrowed prompt.
3. Re-run.

Worst-case: close PR, mark PRD-030 superseded, split into sub-waves per package.

## Alternatives Considered

### Alt-1 — Bundle all 7 fixes into a single teammate prompt

Rejected — 4 packages, 7 distinct fix patterns, mixing them dilutes domain focus per teammate.

### Alt-2 — One teammate per finding (7 teammates)

Rejected — 4 of the 7 findings share package (utils #2/3/4, m9s-cache #5/6) and benefit from single-context fixes. 7 spawns is wasteful.

### Alt-3 — Sequential teammate work (one at a time)

Rejected — 3× wallclock penalty for no benefit since packages are independent.

## Risks

- **R-1 — `getRandomId` deprecation warning floods test output.** Mitigated by gating on `NODE_ENV !== 'test'`.
- **R-2 — `pg-client runBatch` transaction may conflict with existing transaction context.** Use savepoint pattern if a transaction is already active (check via `this._client` state, if exposed).
- **R-3 — `validateKeys` default flip may surface previously-silent bad keys in production.** This is the desired outcome but caller code may break. Document loudly in changeset.

## Refs

- PRD-030 (this wave's PRD)
- EVID-044 (sources all 7 HIGHs)
- PRD-029 + RFC-020 + EVID-045 (Wave 12.B-fix-1 precedent)



