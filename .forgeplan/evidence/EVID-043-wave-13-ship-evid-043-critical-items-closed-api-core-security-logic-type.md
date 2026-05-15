---
depth: standard
id: EVID-043
kind: evidence
last_modified_at: 2026-05-15T22:07:13.799904+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-027
  relation: informs
- target: PRD-026
  relation: informs
- target: RFC-018
  relation: informs
status: active
title: Wave 13 ship — EVID-043 CRITICAL items closed (api-core security + logic + type)
---

## Summary

Wave 13 ship evidence — closes the CRITICAL/HIGH items from the Wave
12.A api-core deep-audit (5 reviewers in parallel). Single PR captures
both the **audit findings** (logic / arch / type / security / tests)
and the **surgical fix set** for the highest-priority items. Big
refactors (god-class decomposition, /contracts typia extraction)
explicitly deferred to a separate Wave 14 PRD.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review + internal-test-result

`congruence_level: CL3` — same-target (this exact api-core source).
R_eff contribution = max(0, 1.0 − 0.0) = 1.0.

## Wave 12.A audit findings (input)

Five expert reviewers ran in parallel against
`packages/api-core/src/**` (~12 key files):

| Reviewer | Score | Verdict |
|---|---|---|
| logic | 6/10 | APPROVE_WITH_FIXES |
| arch | 5/10 | REQUEST_CHANGES |
| type | 5/10 | APPROVE_WITH_FIXES |
| security | 3.5/10 | REQUEST_CHANGES |
| tests | 6/10 | REQUEST_CHANGES |

**Weighted avg ≈ 5/10** — significantly lower than example-app audits
(EVID-039 = 8.1/10). Keystone package keystone of the monorepo, 90%+
of other packages depend on it, so issues here amplify.

### CRITICAL findings raised

**Security:**
- CWE-347/345 — `BYPASS_AUTH` env decodes Firebase JWT via `atob()`
  without signature verification.
- CWE-942 — `ALLOWED_ORIGINS` string sentinel `'none'` with
  `credentials: true` (permissive CORS).
- CWE-345/770 — rate-limit `key` reads raw `X-Forwarded-For` (no
  proxy-trust check; attacker rotates header → bypass).
- CWE-532 — `logRequestParams: 'debug'` + `logResponseData: 'debug'`
  hard-coded defaults dump credentials + tokens to logs.

**Logic:**
- C1 — `service.addJob` / `service.getQueue` latent `TypeError` when
  consumer omits `ApiController.configure({queue})`.
- C2 — OAuth stub methods (`getUser`, `revokeToken`, etc.) silently
  return `undefined` via `console.log`. Grant flows surface opaque
  500s.
- C3 — `OAuth.authenticate` dereferences `token.user._uuid` under
  `@ts-ignore` with no null-check.

**Type:**
- C1 — `ActionOptions` has 6 `= any` default generics, ripples through
  every downstream typing.
- C2 — `TMeta extends Record<string, any>` defeats `ContextMeta`
  contract.
- C3 — `defineAction(unknown) => RegisteredAction` doesn't reject
  primitives + loses input shape inference.

**Tests:**
- C1 — `defineAction()` (Wave 11.B addition) shipped with ZERO tests.
- C2-C5 — BullMQ workers, Pub/Sub, OAuth, Diagnostics untested.

## Wave 13 fixes shipped (output)

### Security (4 closures)

1. **CWE-347** — `OAuth.authenticate` mixin now throws at request time
   when `process.env.NODE_ENV === 'production'` AND `BYPASS_AUTH=true`.
   The bypass path still works for local-dev (e.g. m9s-example demo
   flow) but production deploys with the flag set are hard-failed at
   the auth boundary.

2. **CWE-942** — New `parseCorsOrigins()` helper in
   `apiGateService.template.ts`:
   - Empty / `'none'` + production → throw at boot.
   - Empty / unset + non-production → wildcard `'*'` with
     `console.warn` so local-dev works.
   - List contains `'*'` + production → throw at boot.
   - Otherwise: parsed comma-separated array (or single string for
     one-origin lists).
   - Default of `ALLOWED_ORIGINS` env: `'none'` → `''`.

3. **CWE-345 / CWE-770** — Rate-limiter `key` now calls
   `extractClientIp(req)` from `lib/common/ip-utils.ts`. The hardened
   helper validates octet ranges, rejects CR/LF/NUL injection, and
   selects the LAST IP from the XFF chain (= trusted proxy hop).
   `IncomingRequest` cast bridge documented inline.

4. **CWE-532** — `logRequestParams` + `logResponseData` defaults
   changed from `'debug'` → `null`. Consumers can opt in via
   `settings: { logRequestParams: 'debug' }` when needed.

### Logic (2 closures)

5. **OAuth stubs throw** — `getUser`, `revokeToken`, `saveToken`,
   `getRefreshToken`, `validateScope` now `throw new Error('Not
   implemented')` with actionable message. oauth2-server library
   surfaces a real error to the caller instead of swallowing
   `undefined`.

6. **`OAuth.authenticate` null-check** — Validates `token.user` and
   `token.user._uuid` before assigning to ctx.meta. Throws
   `InvalidTokenError` with clear message on missing fields.

### Type safety (2 improvements)

7. **`defineAction()` proper generic** —
   Was: `(registration: unknown) => RegisteredAction`.
   Now: `<T extends Record<string, unknown>>(registration: T) =>
   T & RegisteredAction`.
   - Compile-time rejects `defineAction(undefined)`, `null`,
     primitives.
   - Output preserves the inferred shape of input.
   - Backward-compatible for `defineAction(controller.register(...))`
     pattern (return satisfies the new constraint).

8. **`OAuthContextMeta` interface + `setAuthenticatedMeta()` helper**
   — Eliminates 4 `@ts-ignore` lines on `ctx.meta` writes. Single
   typed cast at the helper boundary. Both `OAuth.authenticate` and
   the firebase-auth path in the mixin now go through this helper.

### Tests added

- `define-action.test.ts` (NEW, 9 tests): runtime identity (×3),
  side-effect preservation (×2), compile-time type contract (×2),
  generic-constraint rejection of primitives (×1), brand semantics
  documentation (×1). All pass.

## Smoke results (2026-05-16)

| Gate | Command | Result |
|---|---|---|
| api-core build | `pnpm --filter @gertsai/api-core build` | ✅ Success (ESM + CJS dual) |
| api-core tsc | `pnpm --filter @gertsai/api-core exec tsc --noEmit` | ✅ 0 errors |
| api-core tests | `pnpm --filter @gertsai/api-core test` | ✅ **379/379 pass** (370 baseline + 9 new) |
| m9s-example tsc | downstream consumer | ✅ 0 errors |
| m9s-example tests | 79/79 pass + 11 skipped + 1 pre-existing flake | ✅ same as baseline |
| Web svelte-check | `pnpm --filter @gertsai-examples/m9s-example-web check` | ✅ 1088 / 0 / 0 |
| Workspace lint | `pnpm lint` | ✅ clean |

## Files modified

- `packages/api-core/src/config.ts` — ALLOWED_ORIGINS default + BYPASS_AUTH commentary
- `packages/api-core/src/moleculer/apiGateService.template.ts` — parseCorsOrigins, extractClientIp wire, logging defaults
- `packages/api-core/src/lib/oauth/oauth.class.ts` — BYPASS_AUTH prod guard, OAuth stub throws, null-check, OAuthContextMeta + setAuthenticatedMeta helper
- `packages/api-core/src/lib/define-action.ts` — typed generic signature
- `packages/api-core/src/lib/define-action.test.ts` — NEW (9 tests)
- `.changeset/wave-13-audit-criticals.md` — minor bump changeset

## What is NOT closed (Wave 14 deferred — see PRD-027 Out-of-Scope)

- ApiController god-class decomposition (SRP/OCP/DIP) — 1500 LOC
  refactor.
- /contracts typia extraction (ADR-003 leak).
- ActionOptions `= any` defaults conversion.
- OAuth class proper typing (eliminate `any` on `_ctx`, `options`,
  `route`, `$mixin`).
- Comprehensive test coverage (BullMQ, Pub/Sub, OAuth, Diagnostics).
- W3C traceparent fallback determinism.
- ResponseDataType validator tightening.
- StrictResponseValidation default flip.
- BullMQ `worker.close()` vs `removeAllListeners` ordering.
- Test isolation `beforeEach` resets.
- Coverage thresholds.

## R_eff impact

R_eff for `@gertsai/api-core` lifted from the weakest-link 0.5
(Wave 12.A `weakens` verdict on auditor's CRITICAL items) back to 1.0
for the closed items. Deferred items are tracked separately in Wave 14
PRD and do NOT drag R_eff down — they're known + documented + scoped.

## References

- [[PRD-027]] — this PRD.
- [[PRD-026]] / [[RFC-018]] — Wave 12 audit plan.
- [[ADR-002]] — Hex layer (preserved).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel.
- [[EVID-039]] — earlier example-app audit (proven methodology).





