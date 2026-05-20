---
depth: standard
id: PRD-055
kind: prd
last_modified_at: 2026-05-20T08:43:33.700991+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 17 — m9s-example bcryptjs → native bcrypt (EVID-053 H-16 deferred closure)
---

## Problem Statement

EVID-053 H-16 (deferred from Wave 12.E-fix-2 per EVID-056): `examples/m9s-example` uses `bcryptjs` (pure JS) which is ~10x slower than native bcrypt under load. Two consequences:
1. **CPU starvation under load** — pure JS hashing blocks event loop on every login.
2. **Anti-enumeration timing break** — pure JS variance is too high to reliably time-equalize a missing-user dummy-hash compare vs a real bcrypt compare.

Wave 12.E-fix-1 implemented the anti-enum dummy-hash pattern but kept bcryptjs (cross-platform binary concern flagged at the time). This wave migrates to native `bcrypt` (npm package) with conditional fallback if native binary unavailable.

## Goals

1. Migrate `examples/m9s-example/src/services/auth/src/{user-repo.ts, actions/login.action.ts}` from `bcryptjs` to native `bcrypt`.
2. Preserve anti-enum timing semantics (login.action.ts dummy-hash path).
3. Update package.json deps.
4. Verify build + test green (native bcrypt requires Node binary install on Linux/Mac/Win).

## Functional Requirements

**FR-001** — `import bcrypt from 'bcryptjs'` → `import bcrypt from 'bcrypt'` in both call sites.
**FR-002** — API surface differences (if any) addressed. Native `bcrypt.hash`/`compare` have async/sync variants; pick async to match existing usage.
**FR-003** — package.json: `+bcrypt` (+ `@types/bcrypt`), `-bcryptjs` (+ `-@types/bcryptjs` if present).
**FR-004** — Build + test green. If native bcrypt binary fails on CI runner, document the fallback / runner config needed.

## Non-Functional Requirements

**NFR-001** — Cross-platform: bcrypt has pre-built binaries for macOS/Linux/Windows via node-gyp. Should work on GitHub Actions runners (Ubuntu).
**NFR-002** — m9s-example tests pass. Test suite likely doesn't exercise actual hash performance — just that hash/compare work.
**NFR-003** — Patch bump on m9s-example (private package — no publish).

## Out of Scope

- Wave 15.D ApiController action-pipeline extraction (separate, larger work)
- Hardening other example apps (m9s-example-web has no bcryptjs)
- bcrypt → argon2 migration (further future work)

## Related Artifacts

- EVID-053 H-16 (Wave 12.E audit source — flagged deferral)
- EVID-056 (Wave 12.E-fix-2 — explicit deferral rationale: "requires native module which complicates cross-platform builds")

## Target Audience

- Maintainers of `examples/m9s-example` reference app
- Future tutorial readers (m9s-example is the canonical reference for `@gertsai/*` consumers)



