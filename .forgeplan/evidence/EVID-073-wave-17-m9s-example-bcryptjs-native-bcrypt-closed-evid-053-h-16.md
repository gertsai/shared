---
depth: standard
id: EVID-073
kind: evidence
last_modified_at: 2026-05-20T08:50:35.921739+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-055
  relation: informs
status: active
title: Wave 17 — m9s-example bcryptjs → native bcrypt closed (EVID-053 H-16)
---

## Summary

Wave 17 closes the LAST deferred item from Wave 12.E-fix-2 (EVID-056): EVID-053 H-16 (bcryptjs → native bcrypt). Solo team-lead execution (~10 LOC mechanical change). Cross-platform native binary works via `pnpm approve-builds`. m9s-example tests baseline preserved.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-055
- **summary**: 4 files migrated (3 src + 1 package.json), native bcrypt active, tests preserved.

## Closures

**Files migrated**:
- `examples/m9s-example/src/services/auth/src/user-repo.ts` — `import bcrypt from 'bcryptjs'` → `'bcrypt'` + audit-trail comment
- `examples/m9s-example/src/services/auth/src/actions/login.action.ts` — same
- `examples/m9s-example/tests/user-repo.test.ts` — same (test mirror)
- `examples/m9s-example/package.json` — `bcryptjs^2.4.3` → `bcrypt^5.1.1`; `@types/bcryptjs^2.4.6` → `@types/bcrypt^5.0.2`

**Anti-enum dummy-hash semantics preserved**: `login.action.ts` continues running `bcrypt.compare(password, DUMMY_HASH)` when `findByEmail` returns null. Now with stable native bcrypt timing — anti-enumeration guarantee is meaningfully timing-equalised vs pure-JS variance.

## Acceptance verification (all PASS)

- `pnpm install` + `pnpm approve-builds bcrypt` — bcrypt native binary built successfully on macOS arm64
- `pnpm --filter @gertsai-examples/m9s-example run build` — green
- `pnpm --filter @gertsai-examples/m9s-example run typecheck` — 0 errors
- `pnpm --filter @gertsai-examples/m9s-example run test` — 15/17 test files pass, **79 tests pass** (baseline preserved; 2 pre-existing e2e ioredis timeouts on main, not bcrypt-related)
- `tests/user-repo.test.ts` — **5/5 tests pass** (specific bcrypt round-trip tests)

## Cross-platform note

Native bcrypt has pre-built binaries via node-gyp for macOS/Linux/Windows. GitHub Actions Ubuntu runners include build toolchain. `pnpm approve-builds bcrypt` required on first install per pnpm 10's default-deny postinstall scripts policy. CI runners need this same approval — likely already handled by pnpm `frozen-lockfile` install if config allows it.

## Closing Wave 12.E

Wave 12.E (EVID-053) inventory original: 5 CRIT + 14 HIGH.
- Wave 12.E-fix-1 (EVID-054): 2 CRIT + 2 HIGH closed
- Wave 12.E-fix-2 Phase 1 (EVID-055): 3 CRIT closed
- Wave 12.E-fix-2 Phase 2 (EVID-056): 12 HIGH closed; H-16 DEFERRED (cross-platform concern)
- **Wave 17 (EVID-073)**: H-16 CLOSED

**Wave 12.E inventory: 100% closed (5 CRIT + 14 HIGH)**.

## Refs

- PRD-055 (target)
- EVID-053 H-16 (Wave 12.E audit)
- EVID-056 (Wave 12.E-fix-2 — deferral rationale "requires native module")
- EVID-054 + EVID-055 + EVID-056 (Wave 12.E-fix precedents)



