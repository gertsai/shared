---
'@gertsai-examples/m9s-example': patch
---

Wave 17 — Migrate `examples/m9s-example` from `bcryptjs` to native `bcrypt` per EVID-053 H-16 (deferred from Wave 12.E-fix-2 per EVID-056 rationale "requires native module which complicates cross-platform builds").

**Pre-fix**: `bcryptjs` (pure JS) had two problems:
1. ~10x slower than native bcrypt → CPU starvation under concurrent login load
2. High variance defeating the anti-enumeration timing-equalize pattern (dummy-hash compare for unknown email)

**Migration**:
- `examples/m9s-example/src/services/auth/src/user-repo.ts` — `import bcrypt from 'bcryptjs'` → `'bcrypt'`
- `examples/m9s-example/src/services/auth/src/actions/login.action.ts` — same
- `examples/m9s-example/tests/user-repo.test.ts` — same (test mirror)
- `package.json` — `-bcryptjs ^2.4.3 / -@types/bcryptjs ^2.4.6` + `+bcrypt ^5.1.1 / +@types/bcrypt ^5.0.2`

API surface identical (`bcrypt.hash(plain, cost)` + `bcrypt.compare(plain, hash)` async signatures match). Anti-enum dummy-hash path in `login.action.ts` continues working with the same code.

**Cross-platform**: native bcrypt has pre-built binaries via node-gyp for macOS/Linux/Windows. GitHub Actions Ubuntu runners include build toolchain. `pnpm approve-builds bcrypt` required on first install per pnpm 10's default-deny postinstall scripts policy.

Tests: m9s-example baseline preserved (15/17 test files pass, 79 tests pass; 2 e2e timeouts are pre-existing ioredis infrastructure failures unrelated to bcrypt — same on main).

EVID-053 H-16 CLOSED. Final outstanding deferral from Wave 12.E now resolved.

Refs: PRD-055, EVID-053 H-16, EVID-056 (12.E-fix-2 deferral rationale).
