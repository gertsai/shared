---
depth: standard
id: PRD-030
kind: prd
last_modified_at: 2026-05-16T17:48:41.490151+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-044
  relation: based_on
status: active
title: Wave 12.B-fix-2 — close 7 HIGH security findings from EVID-044
---

# PRD-030 — Wave 12.B-fix-2 — close 7 HIGH security findings from EVID-044

## Target Audience

- **Primary:** downstream npm consumers of `@gertsai/fetch`, `@gertsai/utils`, `@gertsai/m9s-cache`, `@gertsai/pg-client` (currently `gertsai_codex`, `GertsHub`, internal services). HIGH findings cover exploit vectors that exist in published artifacts today.
- **Secondary:** future security audit teams — closes security closures from EVID-044 before they age into MEDIUM-drifted code.
- **Tertiary:** Wave 12.B-fix-3 (HIGH type-system) team — same fix-wave pattern, sequential after this PRD.

## Problem Statement

EVID-044 surfaced 7 distinct HIGH-severity security/data-integrity findings across 4 Tier-1 packages. Wave 12.B-fix-1 closed the 2 CRITICAL items; this PRD closes the next-tier issues:

| # | Package | CWE | Finding |
|---|---|---|---|
| 1 | `@gertsai/fetch` | CWE-770 | Body-size limit bypass via `Blob`/`ArrayBuffer`/`Uint8Array`/`string`/`URLSearchParams` paths — `maxBodySize` only enforced for sync/async iterables; large in-memory bodies bypass the DoS guard at `packages/fetch/src/fetchers/undiciFetcher.ts:62-92` (Logic L-1 + Security S-1 collapsed). |
| 2 | `@gertsai/utils` | CWE-918 | `validateWebhookUrlAsync` DNS rebinding TOCTOU — resolved IP not pinned for subsequent fetch (`packages/utils/src/security/url-validator.ts:443-499`). |
| 3 | `@gertsai/utils` | CWE-400 | `resolveHostname` AbortController never wired to `dns.resolve4`/`resolve6` calls — timeout `clearTimeout` in finally block is dead code (`packages/utils/src/security/url-validator.ts:388-422`). |
| 4 | `@gertsai/utils` | CWE-338 | `getRandomId` uses `Math.random()` + publicly exported with generic name inviting security misuse (`packages/utils/src/generators/getRandomId.ts:18-30`). |
| 5 | `@gertsai/m9s-cache` | (defense-in-depth) | `RedlockLockProvider.tryAcquire` swallows ALL errors as "lock unavailable" — Redis-down silently amplifies to DoS (`packages/m9s-cache/src/lock-provider.ts:136-144`). |
| 6 | `@gertsai/m9s-cache` | CWE-20 | `validateKeys` default = `NODE_ENV !== 'production'` — production silently accepts unvalidated keys (`packages/m9s-cache/src/cache-store.ts:49`). Inverted from safe default. |
| 7 | `@gertsai/pg-client` | (data-integrity) | `runBatch` does NOT wrap ops in transaction — partial commit on Nth-op failure leaves DB in mixed state (`packages/pg-client/src/storage-provider.ts:438-443`). |

Without these fixes, downstream consumers ship with: DoS amplification vector (#5), production-only unvalidated cache-key acceptance (#6), unbounded large-body acceptance (#1), weak PRNG in a generically-named "ID generator" (#4), broken DNS-rebinding guards (#2/3), partial-batch data corruption (#7).

## Goals

1. **All 7 HIGH findings closed** — each fix lands in the canonical owning package; orchestrator's verification matrix shows `passed` for each finding's `file:line`.
2. **No regression** — every package's existing test suite continues green; new tests added for security-significant behaviour where reasonable.
3. **Migration cost minimised** — backward-compatible by default. `getRandomId` deprecation is a soft warning (JSDoc + console.warn on first call in non-prod), not a removal. `validateKeys` default-inversion is the only "soft breaking change" — but only behaviour in production gets stricter, which is the desired direction.

## Non-Goals

- **NG-001** — Other EVID-044 HIGHs ship in Wave 12.B-fix-3 (type-system: `collection` `any`, brand factories, `typesVersions` wiring, `ws-rpc` headers split).
- **NG-002** — MEDIUM and LOW findings from EVID-044 defer to a polish sprint or Wave 14 cleanup.
- **NG-003** — No tier-table reconciliation here.
- **NG-004** — No public-npm-vs-GitHub-Packages migration.
- **NG-005** — No new dependencies added to any package.
- **NG-006** — `ws-rpc` `connect()` race condition (also a HIGH in EVID-044) is technically "logic" not "security". Moved to Wave 12.B-fix-3 to keep this PRD scope-clean on security domain.

## Functional Requirements

- [ ] **FR-001** — `@gertsai/fetch` body-size limit applied uniformly. `resolveBody` MUST check `maxBodySize` against `body.size` (Blob), `body.byteLength` (ArrayBuffer/typed array views/Buffer), `body.length` (string), and iterable-accumulated bytes. Throw with consistent error type (e.g., `BodyTooLargeError extends Error` or use `AbortError` semantics).
- [ ] **FR-002** — `@gertsai/utils` `validateWebhookUrlAsync` returns the resolved IP list AND callers MUST use that resolved IP for the actual fetch (documented contract). Implement by returning `{ valid: true; resolvedIp: string }` from validator and updating the docstring to require IP-pinning by consumers. Default fallback: validator becomes a pure validator (no fetch contract change); the TOCTOU is documented and consumers responsible for pinning. **Alternative simpler fix:** ship a `validateWebhookUrlAndFetch(url, init)` companion that pins IP internally. **Decision in RFC-021 D-2.**
- [ ] **FR-003** — `@gertsai/utils` `resolveHostname` wires AbortSignal to `dns.resolve4`/`resolve6` via `Promise.race` with the abort signal, OR migrates to `dns.lookup` with `signal` option. Timeout MUST actually abort the resolution, not just `clearTimeout` after the fact.
- [ ] **FR-004** — `@gertsai/utils` `getRandomId`: add JSDoc `@deprecated` + console.warn-once on first call mentioning "use `crypto.randomUUID()` for security-significant identifiers". Add new export `getSecureRandomId(length?: number)` backed by `crypto.randomInt`. Don't remove the old export (backward-compatibility).
- [ ] **FR-005** — `@gertsai/m9s-cache` `RedlockLockProvider.tryAcquire` distinguishes "lock-held" (return null) from "Redis-unreachable / Redlock-misconfigured" (rethrow). Use Redlock's `ResourceLockedError` (or string-match its error message) as the only-allowed swallow case; all others propagate. Update tests.
- [ ] **FR-006** — `@gertsai/m9s-cache` `validateKeys` default = `true` (strict). Test isolation: only with explicit `validateKeys: false` does the package accept arbitrary keys. Update the `MoleculerSerializerAdapter` test fixture that may rely on the old default.
- [ ] **FR-007** — `@gertsai/pg-client` `runBatch` wraps all ops in BEGIN/COMMIT/ROLLBACK. On error: ROLLBACK + propagate. Add capability marker if `batches: 'atomic'` needs to disambiguate from non-atomic. Update existing tests; add integration test for the rollback path (uses `mockPgClient` to simulate Nth-op failure).
- [ ] **FR-008** — All 4 affected packages get changesets:
  - `@gertsai/fetch: minor` (0.3.0 → 0.4.0) — FR-001
  - `@gertsai/utils: minor` (current → next minor) — FR-002 to FR-004
  - `@gertsai/m9s-cache: minor` (0.3.0 → 0.4.0) — FR-005 + FR-006
  - `@gertsai/pg-client: minor` (current → next minor) — FR-007

## Non-Functional Requirements

- **NFR-001 — Backward compatibility preserved.** No public type names removed. No breaking signature changes except `validateKeys` default. Migration documented in changeset bodies.
- **NFR-002 — Test budget.** Each package's existing test count cannot decrease. New tests added for: FR-001 (body-size limit on each body type), FR-003 (DNS abort), FR-005 (Redis-unreachable distinct from lock-held), FR-006 (default-strict), FR-007 (rollback on partial batch failure).
- **NFR-003 — File ownership disjoint per teammate.** 4 teammates work on 4 packages — no shared files.
- **NFR-004 — Forgeplan safety.** Mutations only via MCP.
- **NFR-005 — Time bound.** Single session, ≤2 hours wallclock including spawn, teammate work, cross-validation, verification, evidence, commit + PR.
- **NFR-006 — Reuse Wave 12.B-fix-1 pattern.** Same shape: PRD + RFC + EVID; teammate prompts include exact file:line citations + verification commands.
- **NFR-007 — getRandomId deprecation soft, not hard.** No version that throws on use — only warns. Aggressive removal can wait for v1.0.

## Related Artifacts

- **EVID-044** — Wave 12.B audit; sources all 7 HIGH findings.
- **PRD-028** — Wave 12.B audit plan (parent — suggested follow-up §"Sub-wave 12.B-fix-2").
- **PRD-029 + EVID-045** — Wave 12.B-fix-1 (sibling — sets precedent for 2-teammate parallel; this PRD scales to 4 teammates).
- **RFC-018** — Wave 12 audit strategy.
- **RFC-021** — execution strategy for this PRD (4-teammate parallel, file-ownership matrix, security-test additions).
- **CLAUDE.md** — tier table + IRREVERSIBLE publish red line.

Refs: PRD-029 (precedent), EVID-044 (sources), RFC-021 (execution).





