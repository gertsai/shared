---
depth: standard
id: RFC-009
kind: rfc
last_modified_at: 2026-05-12T20:36:38.288802+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-013
  relation: refines
- target: ADR-013
  relation: informs
- target: RFC-006
  relation: informs
- target: RFC-007
  relation: informs
status: active
title: Wave 8.1 m9s-example modernization — implementation strategy
---

# RFC-009: Wave 8.1 strategy — pre-seeded skeletons + 4 parallel teammates with disjoint file ownership

## Summary

Adopt 5 Wave 5/6/7 capabilities into `examples/m9s-example/` via the AgentsTeam pattern refined in Waves 7.4/7.5: team-lead pre-seeds shared skeletons + package.json deps, then spawns 4 teammates in parallel with disjoint file ownership. No teammate touches another's files. Sprint completes in a single wave (no sequential dependencies between A/B/C/D after pre-seed lands).

## Motivation

PRD-013 specifies WHAT (5 capabilities, 6 goals, 10 FRs). RFC-009 specifies HOW: file ownership boundaries, pre-seed contents, teammate prompts, and the test taxonomy.

Reality after audit recon (vs audit estimate):

| Capability | Audit est. | Recon reality |
|---|---|---|
| #16 Wave 7.2 capability declaration | 15 LOC | 15 LOC ✓ (DocumentRepository extends BaseEntityStorageService, just needs `capabilities` getter) |
| #8 logger-factory | 50 LOC | **30 LOC** (only 10 console.* sites in 3 files: `src/index.ts:7×`, `src/services/index.ts:2×`, `src/infrastructure/ollama-embedder.ts:1×`) |
| #1 errors taxonomy | 40 LOC | **70 LOC** (5 throw sites + 3 instanceof catch blocks + class deletion + ProblemDetails mapper) |
| #10 rest-request-manager | 60 LOC | 60 LOC ✓ (httpCaller wrap in 2 embedders, replace handcrafted error mapping with AppError translation) |
| #7 async-utils | 30 LOC | 30 LOC ✓ (withTimeout to replace `timeout:` httpCaller option, retry primitive for transient HTTP errors) |
| **Total production** | 195 LOC | **205 LOC** |
| Tests (new) | est. 100 LOC | **120 LOC** (3 new test files: capability, error-taxonomy, embedder-hardening) |

Total ≤ 325 LOC including tests. Production code at 205 LOC fits PRD-013 NFR-3 budget of ≤260 production LOC.

## Goals

- **RG-1**: Single-wave execution — no inter-teammate dependencies after pre-seed merges.
- **RG-2**: File ownership disjoint — each path in ownership table belongs to exactly one teammate.
- **RG-3**: Teammates implement Wave 7.3a/b strict-floor compliant code (canonical EOPT patterns from RFC-006).
- **RG-4**: All NEW tests in `examples/m9s-example/__tests__/` directory or alongside source — no global side-effects on other packages.

## Non-Goals

- Modifying any `@gertsai/*` package source — Wave 8.1 is application-side adoption only.
- Adding new public types — m9s-example is `private: true` (not published).
- Changing existing test fixtures — backwards-compat NFR-2 means current 42+ tests pass unmodified.

## Options Considered

### Option A — Single AgentsTeam wave, 4 teammates, full pre-seed (CHOSEN)

**Description**: Team-lead writes `composition/logger.ts` + `composition/errors.ts` skeletons + updates `package.json` deps **before** spawning. Teammates own disjoint paths and have stable contracts from minute zero.

**Pros**:
- Wave 7.4/7.5 pattern proven: pre-seed eliminates "skeleton race" where teammate B waits for teammate A's exports.
- 4 teammates × ~50–70 LOC each fits AgentsTeam ceiling (≤ 5 teammates, ≤ 400 LOC each).
- Single-wave means no orchestration tax — spawn once, await, merge.

**Cons**:
- Pre-seed work serializes ~30 LOC into team-lead overhead.
- Requires upfront contract decisions (REDACT_KEYS list, AppError→ProblemDetails mapping shape).

### Option B — Two sequential waves: deps + logger first, then errors + embedder

**Description**: Wave-1 = teammates A (capability) + B (logger). Wave-2 = teammates C (errors) + D (embedder), spawned after Wave-1 merges.

**Pros**: Smaller blast per wave; clearer recovery if Wave-1 has issues.

**Cons**: 2× orchestration cost; no real dependency between waves justifies the split; Wave-1 wait blocks the whole sprint by ~30 min teammate runtime.

### Option C — Single mega-teammate doing everything sequentially

**Description**: One general-purpose agent does all 5 capabilities in sequence.

**Pros**: No coordination needed; single review surface.

**Cons**: 200+ LOC + 120 LOC tests violates the ≤400 LOC AgentsTeam ceiling for sustained quality; loses parallelism gains (Waves 7.3b/7.4/7.5 each demonstrated 3–5× wall-clock improvement with parallel teammates).

**Decision**: Option A. Pre-seed cost is ~30 LOC for team-lead; parallel teammate gain is ≥ 3× wall-clock.

## Proposed Direction

### Pre-seed (team-lead, before spawn, ~50 LOC total)

1. **`examples/m9s-example/package.json`** — add 3 deps:
   ```jsonc
   "@gertsai/async-utils": "workspace:*",
   "@gertsai/logger-factory": "workspace:*",
   "@gertsai/rest-request-manager": "workspace:*",
   ```

2. **`examples/m9s-example/src/composition/logger.ts`** (NEW, ~30 LOC):
   ```ts
   // SPDX-License-Identifier: Apache-2.0
   import { createLogger, consoleBackend, type Logger } from '@gertsai/logger-factory';

   /** Sensitive keys redacted in all m9s-example logs (case-insensitive). */
   export const REDACT_KEYS = Object.freeze([
     'apiToken', 'clientSecret', 'password', 'bearer', 'accessToken',
     'embedding', 'embeddings', 'vector', 'vectors',
     'OPENAI_API_KEY', 'FGA_API_TOKEN',
   ] as const);

   /**
    * Shared logger factory for m9s-example modules.
    * Module loggers use consoleBackend with shared REDACT_KEYS.
    * Level honors LOG_LEVEL env (default: 'info').
    */
   export function createAppLogger(name: string): Logger {
     return createLogger({
       name,
       backend: consoleBackend(),
       level: (process.env.LOG_LEVEL as Logger['level']) ?? 'info',
       redactKeys: REDACT_KEYS as readonly string[],
     });
   }
   ```

3. **`examples/m9s-example/src/composition/errors.ts`** (NEW, ~20 LOC):
   ```ts
   // SPDX-License-Identifier: Apache-2.0
   /**
    * Re-exports the @gertsai/errors canonical taxonomy for m9s-example.
    * Single import surface so application code does not couple directly
    * to the package layout.
    */
   export { AppError, ErrorKind, wrapUnknownError } from '@gertsai/errors';
   export { toProblemDetails, type ProblemDetails } from '@gertsai/errors/http';

   /**
    * Build a PermissionDenied AppError matching the legacy
    * PermissionDeniedError shape. Used by application use cases when
    * the IPermissionGate rejects an action.
    */
   import { AppError, ErrorKind } from '@gertsai/errors';
   export function permissionDenied(userId: string, action: string, resource: string): AppError {
     return new AppError({
       kind: ErrorKind.PermissionDenied,
       message: `User '${userId}' is not allowed to '${action}' on '${resource}'`,
       details: { userId, action, resource },
     });
   }
   ```

### File ownership (4 teammates, disjoint)

| Teammate | Files OWNED | LOC delta |
|---|---|---|
| **A: capability** | `src/infrastructure/document.repository.ts` (modify — add `capabilities` getter) · `src/__tests__/capability-declaration.test.ts` (NEW) | +5 src / +30 test |
| **B: logger** | `src/index.ts` (modify — replace 7 console.*) · `src/services/index.ts` (modify — replace 2 console.*) · `src/__tests__/logger-redaction.test.ts` (NEW) | +15 src / +30 test |
| **C: errors** | `src/application/IngestDocumentUseCase.ts` (modify) · `src/application/SearchDocumentsUseCase.ts` (modify) · `src/application/errors/permission-denied.error.ts` (DELETE) · `src/infrastructure/openfga-permission.gate.ts` (modify) · `src/services/ingest/src/actions/ingest-document.action.ts` (modify catch) · `src/services/ingest/src/queues/ingest-chunk.worker.ts` (modify catch) · `src/services/search/src/actions/search-query.action.ts` (modify catch) · `src/__tests__/error-taxonomy.test.ts` (NEW) | +50 src / +40 test |
| **D: embedder** | `src/infrastructure/ollama-embedder.ts` (modify — wrap httpCaller, replace console.warn with logger, replace `timeout:` with withTimeout, add retry) · `src/infrastructure/openai-embedder.ts` (modify — same pattern) · `src/__tests__/embedder-hardening.test.ts` (NEW) | +90 src / +50 test |

**Conflict matrix** (verified disjoint):

| | A | B | C | D |
|---|---|---|---|---|
| A | — | ✓ | ✓ | ✓ |
| B | ✓ | — | ✓ | ✓ |
| C | ✓ | ✓ | — | ✓ |
| D | ✓ | ✓ | ✓ | — |

### Per-teammate prompt contracts

**Teammate A — `m9s-capability-declaration`**:
> Add `capabilities` getter to `DocumentRepository` (extends `BaseEntityStorageService<DocumentMeta>`). Shape: `{ upsert: { supported: true, preservesCreatorAudit: true } }` per ADR-013 Wave 7.2. Write a test asserting capability shape. Strict floor — no `// @ts-expect-error`. Use canonical EOPT patterns from RFC-006 §Catalog if needed.

**Teammate B — `m9s-logger-factory`**:
> Replace 7 `console.*` calls in `src/index.ts` and 2 `console.*` calls in `src/services/index.ts` with `createAppLogger('module-name')` from `src/composition/logger.ts` (pre-seeded — already exists). Logger calls: `console.log(msg)` → `logger.info({ msg })`; `console.error(msg, err)` → `logger.error({ err, msg })`. Write a redaction test asserting that `apiToken: 'secret'` is masked in logger output. Do NOT touch `src/infrastructure/ollama-embedder.ts` (D owns it).

**Teammate C — `m9s-errors-taxonomy`**:
> Delete `src/application/errors/permission-denied.error.ts`. Replace 2 throw sites in `IngestDocumentUseCase.ts` + `SearchDocumentsUseCase.ts` with `permissionDenied(userId, action, resource)` from `src/composition/errors.ts` (pre-seeded). Modify 3 catch sites (`ingest-document.action.ts:158`, `ingest-chunk.worker.ts:141`, `search-query.action.ts:81`) to catch `AppError` with `err.kind === ErrorKind.PermissionDenied` instead of `instanceof PermissionDeniedError`. Modify `openfga-permission.gate.ts` to throw `AppError` if it currently throws `Error`. Write test asserting AppError → ProblemDetails mapping conforms to RFC 9457 (type, title, status=403, detail, instance).

**Teammate D — `m9s-embedder-hardening`**:
> Wrap `httpCaller()` calls in `ollama-embedder.ts` + `openai-embedder.ts` using `RestRequestManager` from `@gertsai/rest-request-manager` per-hostname singleton. Default config: `{ retry: { attempts: 3, baseDelayMs: 250, jitter: 'full' }, rateLimit: { rps: 1, burst: 5 }, circuitBreaker: { threshold: 5, windowMs: 30_000, maxHosts: 1000 } }`. Replace inline `timeout:` option with `withTimeout(promise, ms)` from `@gertsai/async-utils`. Replace `console.warn` in `ollama-embedder.ts:135` with `createAppLogger('ollama-embedder').warn(...)`. Translate HTTP failures to `AppError` from `src/composition/errors.ts` (use `ErrorKind.NetworkError` for transport; `ErrorKind.UpstreamError` for 5xx; preserve 401/429 specialized messages). Write a hardening test simulating Ollama 503 → retry → CB-open transition. DO NOT modify other files.

### Test taxonomy

| Test file | Owner | What it asserts |
|---|---|---|
| `capability-declaration.test.ts` | A | `repository.capabilities === { upsert: { supported: true, preservesCreatorAudit: true } }` |
| `logger-redaction.test.ts` | B | `logger.info({ apiToken: 'secret' })` → captured stdout never contains 'secret' |
| `error-taxonomy.test.ts` | C | (a) `permissionDenied('u','a','r')` returns `AppError` with `kind === PermissionDenied`; (b) `toProblemDetails(err)` shape matches RFC 9457; (c) status code 403 |
| `embedder-hardening.test.ts` | D | (a) Three consecutive 503s trigger CB-open after threshold; (b) `withTimeout(slowEmbed, 100)` rejects with TimeoutError; (c) 429 surfaces specialized message; (d) AppError shape: `{ kind: NetworkError, ... }` |

## Implementation Phases

**Phase 0 — Pre-seed (team-lead, ~30 min)**:
- Update `examples/m9s-example/package.json` with 3 new workspace deps (`@gertsai/async-utils`, `@gertsai/logger-factory`, `@gertsai/rest-request-manager`)
- Run `pnpm install` to wire workspace
- Create `src/composition/logger.ts` with `createAppLogger()` + `REDACT_KEYS` (per pre-seed spec above)
- Create `src/composition/errors.ts` with re-exports + `permissionDenied()` helper (per pre-seed spec above)
- Quick smoke: `pnpm --filter @gertsai/m9s-example exec tsc --noEmit` ⇒ exit 0 (skeleton compiles)
- Forgeplan claim PRD-013 (umbrella; teammates skip self-claim)

**Phase 1 — AgentsTeam parallel execution (4 teammates in single message, ~45 min wall-clock)**:
- Teammate A (`m9s-capability-declaration`) — capability getter + test
- Teammate B (`m9s-logger-factory`) — console replacement + redaction test
- Teammate C (`m9s-errors-taxonomy`) — class delete + 8 file modifications + ProblemDetails test
- Teammate D (`m9s-embedder-hardening`) — RestRequestManager wrap + withTimeout + CB test
- All 4 spawn in a single message with `Agent` tool, `subagent_type: general-purpose`

**Phase 2 — Smoke + activation (team-lead, ~20 min)**:
- `pnpm --filter @gertsai/m9s-example test && pnpm --filter @gertsai/m9s-example typecheck && pnpm --filter @gertsai/m9s-example build`
- Workspace smoke: `pnpm test && pnpm typecheck`
- Create EVID-XXX with `## Structured Fields` block (verdict, congruence_level, evidence_type, test count delta, LOC delta)
- `forgeplan_link EVID-XXX PRD-013 --relation informs`
- `forgeplan_score PRD-013` → R_eff ≥ 0.5 (target ≥ 0.8 with CL3 internal evidence)
- `forgeplan_activate` for PRD-013 + RFC-009 + EVID-XXX

**Phase 3 — Ship (team-lead, ~10 min)**:
- `git checkout -b feat/wave-8-1-m9s-example-modernization`
- Two commits: (1) `feat(m9s-example): adopt Wave 5/6/7 capabilities (Wave 8.1)`, (2) `docs(forgeplan): activate Wave 8.1 artifacts (PRD-013 / RFC-009 / EVID-XXX)`
- `git push -u origin feat/wave-8-1-m9s-example-modernization`
- `gh pr create --base main --fill` with body `Refs: PRD-013, RFC-009, EVID-XXX`
- Await merge; `forgeplan_release PRD-013`; retain hindsight memory group

## Invariants

- **I-1**: Sprint 3.11 ADR-011 invariants (I-1 mock fallback, I-12 prod-guard, I-13 tenant WHERE) preserved — no changes to AllowAllPermissionGate or PgClient wiring.
- **I-2**: Wave 7.3a/b strict floor preserved — every modified file must pass `tsc` with `exactOptionalPropertyTypes: true` + `noUncheckedIndexedAccess: true`. Teammates apply RFC-006 canonical patterns; banned: widening optional types, `@ts-expect-error`, per-file opt-outs.
- **I-3**: Backwards compat — `STORAGE_PROVIDER=memory` mock-mode path unchanged. Existing 42+ mock-mode tests pass without modification. `VITEST_REAL_INFRA=1 vitest run` real-infra tests pass unchanged.
- **I-4**: PermissionDeniedError DELETE is irreversible — once Wave 8.1 lands, no code path may re-introduce a parallel custom exception class for `@gertsai/errors`-supported kinds. Future failure modes use existing ErrorKind values.
- **I-5**: `REDACT_KEYS` list is the single source of truth for sensitive-key masking. Adding new sensitive types (e.g. `personalEmail`) requires updating this const, not per-call-site redaction.

## Acceptance Test (per PRD-013 FRs)

- FR-1 — `capability-declaration.test.ts` PASS
- FR-2, FR-3 — `grep -rn 'console\.' src/ \| grep -v '__tests__'` returns 0 lines; `logger-redaction.test.ts` PASS
- FR-4 — `grep -rn 'PermissionDeniedError' src/` returns 0 lines; class file deleted
- FR-5 — `error-taxonomy.test.ts` PASS (ProblemDetails shape verified)
- FR-6, FR-7, FR-8 — `embedder-hardening.test.ts` PASS (retry, CB, withTimeout, error mapping)
- FR-9 — `.env.example` documents `EMBEDDER_RATE_LIMIT_RPS`, `EMBEDDER_CB_THRESHOLD`, `LOG_LEVEL` (optional, defaults documented)
- FR-10 — `pnpm --filter @gertsai/m9s-example test && pnpm --filter @gertsai/m9s-example typecheck && pnpm --filter @gertsai/m9s-example build` all exit 0; `pnpm test && pnpm typecheck && pnpm build` workspace-wide also exit 0

## Alternatives Considered (rejected)

| Alt | Reason rejected |
|---|---|
| Migrate to Pino/Winston directly (skip logger-factory) | Defeats the demonstration purpose — m9s-example is supposed to show `@gertsai/*` usage |
| Use a custom outbound HTTP wrapper instead of rest-request-manager | Same reason — package was designed for exactly this case |
| Keep PermissionDeniedError as a thin extends AppError | Adds class without value; consumers don't need a custom name when ErrorKind discriminator does the job |
| Add OAuth2 (#20) opportunistically | Out of scope per PRD-013 §Out-of-Scope; m9s-example targets self-hosted OpenFGA |
| Skip the capability declaration (silently inherit defaults) | NFR violated — ADR-013 §Decision-A1 mandates explicit declaration; silent inheritance breaks Wave 7.2 contract |

## Rollback Plan

- **Tactical revert**: single `git revert <merge-commit>` restores all 4 teammates' file changes + pre-seed. PermissionDeniedError class restored. console.* sites restored. Embedder wraps removed.
- **Partial revert**: not recommended — pre-seed files have no value standalone, and removing them while keeping teammate changes breaks compilation.
- **Forward fix preferred over rollback** — bug fixes go in Wave 8.1.1 patch.

## Risks (delta vs PRD-013)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | `RestRequestManager` defaults too aggressive — local Ollama daemon's first response can take 30s+ (cold model load); rateLimit `rps: 1, burst: 5` might starve a legitimate ingest workload | Conservative defaults: burst=5 covers an initial chunk batch; `timeoutMs` in embedder opts retained as the inner timeout (RestRequestManager wraps the whole call). Document `EMBEDDER_RATE_LIMIT_RPS` env knob for tuning. |
| RFC-R-2 | Logger backend silently drops messages in test mode if vitest doesn't connect stdout | Test uses `consoleBackend()` with explicit stdout capture per logger-factory test helpers; if missing, instantiate a captured backend in test setup |
| RFC-R-3 | Pre-seed `composition/errors.ts` re-export from `@gertsai/errors/http` requires subpath `node16` resolution — m9s-example tsconfig must support it | `examples/m9s-example/tsconfig.json` inherits workspace base which uses `moduleResolution: bundler` — verified supports subpaths |
| RFC-R-4 | Existing console.error in index.ts catches startup failure; switching to logger.error means startup errors might not flush before process.exit | Use `logger.error(...)` followed by `await logger.flush()` if backend supports it; otherwise instantiate consoleBackend with `flushSync: true` option |

## Implementation differences from spec (Wave 8.3 audit Docs#9 fix)

The pre-seed code blocks in this RFC were drafted **before** the real
package API surfaces were locked. The Wave 8.2 audit (EVID-029, Docs#9)
flagged the drift; this section captures the deltas so a future reader
copy-pasting from RFC-009 lands on shipped reality, not draft intent.

### `createAppLogger` (composition/logger.ts)

- **Spec drafted (above)**: `createAppLogger(name: string)` and option keys `name`, `backend: consoleBackend()`, `level`, `redactKeys`.
- **Shipped**: `createAppLogger(moduleName: string)` and option keys per `@gertsai/logger-factory` real interface — `baseContext: { module: moduleName }`, `backend: consoleBackend` (singleton import — NOT a factory call), `level`, **`redact`** (NOT `redactKeys`).
- Verify against `examples/m9s-example/src/composition/logger.ts` and `packages/logger-factory/src/logger.ts:46-51` (`LoggerFactoryOpts`).

### `permissionDenied()` return type (composition/errors.ts → shared/errors.ts in Wave 8.3)

- **Spec drafted**: returns `AppError` with `ErrorKind.PermissionDenied`.
- **Shipped**: returns `ForbiddenError<{ userId: string; action: string; resource: string }>` (the typed subclass of `AppError`); the canonical kind is `ErrorKind.FORBIDDEN` (the `@gertsai/errors` taxonomy uses HTTP-aligned upper-snake-case values).
- The HTTP-boundary status remains 403 with type `urn:gertsai:errors:permission` (RFC 9457 ProblemDetails). Wave 8.3 also moved this factory to `src/shared/errors.ts` to fix the hex inversion flagged by audit Arch#1.

### `RestRequestManagerOpts` field names

- **Spec drafted (Teammate D prompt)**: `retry: { attempts: 3, baseDelayMs: 250, jitter: 'full' }`, `rateLimit: { rps: 1, burst: 5 }`, `circuitBreaker: { threshold: 5, windowMs: 30_000, maxHosts: 1000 }`.
- **Shipped**: field names per `@gertsai/rest-request-manager` real types — `retry: { maxAttempts: 3, baseMs: 250, jitter: 'full' }` (extends `RetryOpts` from `@gertsai/async-utils`), `rateLimit: { tokensPerSecond: N, burst: N }`, `circuitBreaker: { failureThreshold: N, resetTimeoutMs: N, maxHosts: N }`.
- Verify against `packages/rest-request-manager/src/types.ts:34-66`.

### Wave 8.1 → 8.3 evolution snapshot

| Subject | Wave 8.1 | Wave 8.2 | Wave 8.3 |
|---|---|---|---|
| Error kernel | `composition/errors.ts` (all re-exports + factory + scrubber) | unchanged | split: `shared/errors.ts` (kernel) + `composition/errors.ts` (HTTP scrubber only) |
| Embedder transport | `httpCaller` + module-level `_manager` singleton | per-hostname `Map<hostname, RestRequestManager>` + `allowedHostnames: [hostname]` SSRF tightening | optional ctor `manager?: RestRequestManager` DI from composition root + bounded `pLimit(EMBEDDER_CONCURRENCY)` concurrency |
| HTTP boundary | bare `appErrorToHttpResponse` from `@gertsai/errors/http` | scrubber strips `userId`/`url`/`originalKind` from outbound ProblemDetails (CWE-209) | unchanged (composition/errors.ts) |
| `REDACT_KEYS` | embedding/vector/OPENAI_API_KEY/FGA_API_TOKEN | + POSTGRES_URL, REDIS_URL, DATABASE_URL, bearer, x-api-key, refresh_token, client_secret, jwt, session* (CWE-532) | unchanged |
| depcruise | composition is free-form | unchanged | new `no-application-to-composition` + `no-services-to-composition-errors` rules |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-013 | refines (RFC-009 is the strategy detail for PRD-013) |
| ADR-011 (local) | informs (Sprint 3.11 m9s-example baseline invariants preserved — incidental reference) |
| ADR-013 | informs (Wave 7.2 tri-state capability contract being adopted) |
| RFC-006 | informs (Wave 7.3b canonical EOPT patterns for teammates) |
| RFC-007 | informs (Wave 7.4 LruTtlMap CB pattern referenced by Teammate D) |
| EVID-028 | informs (Wave 8.1 ship evidence) |
| EVID-029 | informs (Wave 8.2 audit findings — Docs#9 drift flagged here) |
| RFC-010 / EVID-030 | informs (Wave 8.3 closure that fixed this drift) |
