---
depth: standard
id: PRD-027
kind: prd
last_modified_at: 2026-05-15T22:06:12.014290+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-043
  relation: based_on
status: active
title: Wave 13 — fix CRITICAL audit findings from EVID-043 (api-core security + logic + type)
---

## Problem Statement

EVID-043 (Wave 12.A) deep-audited `@gertsai/api-core` with 5 expert
reviewers. Findings: 22+ CRITICAL/HIGH items across security, logic,
type, and tests. Per RFC-018 invariant I-2, CRITICAL findings BLOCK
remaining audit waves (12.B–F across other 37 packages) until closed.

This PRD ships **surgical fixes for the highest-priority items**
(security holes, runtime crashes, type leaks). Big refactors (god-class
decomposition, /contracts typia extraction) deferred to a separate
Wave 14 PRD because they cannot be done in a single focused PR without
risking churn.

## Goals

1. Close **all 4 SECURITY criticals**: BYPASS_AUTH prod-fail, CORS
   allowlist with prod-throw, XFF rate-limit via hardened helper,
   logging defaults off (no token leak).
2. Close **LOGIC C2 + C3**: OAuth stubs throw (loud failure), token.user
   null-check.
3. Improve `defineAction()` to **type-preserving generic** —
   `<T extends Record<string, unknown>>(registration: T) =>
   T & RegisteredAction`. Add 9 unit tests (Test C1 closure).
4. Eliminate 4 `@ts-ignore` lines on `ctx.meta` writes via typed
   `setAuthenticatedMeta()` helper.
5. All 379 api-core tests + downstream m9s-example tests + workspace
   lint stay green.

## Target Audience

- **Primary:** anyone consuming `@gertsai/api-core` in production —
  security holes here propagate to every downstream service.
- **Secondary:** Wave 12.B–F audit waves — blocked until this lands.

## Functional Requirements

- [ ] **FR-001 Security CWE-347** — `OAuth.authenticate` checks
  `NODE_ENV === 'production'` + `BYPASS_AUTH=true` → throw at request
  time with clear error.
  - Acceptance: integration test sends bypass token with prod NODE_ENV → 401 with error message mentioning CWE-347.

- [ ] **FR-002 Security CWE-942** — `parseCorsOrigins()` helper:
  prod + empty/`'none'` → throw at boot; prod + `'*'` → throw at boot;
  non-prod + empty → wildcard with warn; otherwise return array/string.
  - Acceptance: starting api-gateway in prod without `ALLOWED_ORIGINS`
    throws clear error.

- [ ] **FR-003 Security CWE-345** — rate-limiter key uses
  `extractClientIp(req)` from `lib/common/ip-utils.ts`.
  - Acceptance: requests with spoofed XFF chain rate-limited correctly.

- [ ] **FR-004 Security CWE-532** — `logRequestParams` +
  `logResponseData` defaults changed from `'debug'` to `null`.
  - Acceptance: default boot config doesn't log request bodies.

- [ ] **FR-005 Logic C2** — `OAuth.{getUser,revokeToken,saveToken,
  getRefreshToken,validateScope}` throw `Error('Not implemented')`
  instead of silent `console.log`.
  - Acceptance: any grant flow that hits these methods returns an
    actionable error instead of opaque 500.

- [ ] **FR-006 Logic C3** — `OAuth.authenticate` checks `token.user`
  and `token.user._uuid` before assigning to ctx.meta.
  - Acceptance: tokens without user object produce
    `InvalidTokenError`, not `TypeError`.

- [ ] **FR-007 Type C3** — `defineAction()` signature is
  `<T extends Record<string, unknown>>(registration: T) =>
  T & RegisteredAction`. Constraint rejects primitives + nullish at
  compile time. Output preserves input shape.
  - Acceptance: 9 unit tests pass, including `@ts-expect-error`
    assertions for primitive rejection.

- [ ] **FR-008 Type-safety helper** — `OAuthContextMeta` interface +
  `setAuthenticatedMeta(ctx, user)` replace 4 `@ts-ignore` lines on
  ctx.meta writes.
  - Acceptance: zero `@ts-ignore` in `oauth.class.ts` for meta writes.

## Non-Functional Requirements

**NFR-1 — Backward compatibility within 0.x SemVer**
  - Minor version bump (0.2.0 → 0.3.0). Behavior changes (CORS default,
    logging default) are justified under 0.x SemVer flexibility.
  - All `@gertsai-examples/*` consumers continue to build + test.

**NFR-2 — Test gates**
  - api-core tests: 379+ (370 baseline + 9 new for defineAction).
  - m9s-example tests: 79+ unchanged (1 pre-existing pg-vector flake).
  - Web svelte-check, workspace lint, all builds: clean.

**NFR-3 — Audit chain**
  - EVID-043 (Wave 12.A audit) → EVID-044 (this PR's evidence).
  - EVID-044 supersedes the CRITICAL items from EVID-043. Wave 12.B+
    can resume after this PR merges.

## Stakeholders

- **Owner:** `@gertsai/api-core` package.
- **Reviewers:** anyone running this in prod; Wave 12 audit chain.

## Related Artifacts

- [[EVID-043]] — Wave 12.A audit (input).
- [[PRD-026]] / [[RFC-018]] — comprehensive audit plan (Wave 12).
- [[ADR-002]] — Hex layer (preserved).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel.

## Out of Scope (deferred to Wave 14 PRD)

- ApiController god-class decomposition (1500 LOC → 5 collaborators):
  ActionRegistry, QueueRuntime, PubSubRuntime, WorkflowRegistry,
  HealthRegistry. SOLID compliance.
- /contracts typia extraction (ADR-003 leak in
  `lib/apiResponse/types.ts`).
- ActionOptions `= any` defaults → `unknown` / `never` (6 generic
  params). Requires full downstream consumer audit.
- `OAuth` class proper typing (eliminate `any` on `_ctx`, `options`,
  `route`, `$mixin`).
- Comprehensive test coverage for `registerWorker`, `subscribeOnTopic`,
  `setChannels`, `setWorkflows`, `addStartedHandler`, OAuth flow,
  DiagnosticRegistry.
- W3C traceparent zero-trace fallback determinism.
- ResponseDataType<Code> validator tightening.
- StrictResponseValidation default flip.
- BullMQ worker `close()` ordering vs `removeAllListeners`.
- Test isolation `beforeEach(() => { ApiController['_controllers'] = {}; })`.
- Coverage thresholds in `vitest.config.ts`.




