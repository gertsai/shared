---
depth: tactical
id: EVID-058
kind: evidence
links:
- target: PRD-040
  relation: informs
status: active
title: Wave 12.G — 38-package aggregate risk matrix
---

## Summary

Wave 12.A through 12.E completed full-stack audits across 38 `@gertsai/*` packages and 3 example apps, surfacing **6 CRITICAL, ~64 HIGH, ~150 MEDIUM, and ~100 LOW findings** raw across all waves. By Wave 12.G synthesis (2026-05-19) **all 6 CRITICAL items are closed** and **62 of 64 HIGH items are closed** (97% HIGH closure rate). Two HIGH items remain open: H-16 `bcryptjs → native bcrypt` (deferred to Wave 13, cross-platform build complication) and `core` un-sampled 84% surface area (Wave 12.D2 deferred deep-audit before promoting to v0.2.0). MEDIUM/LOW items (~250) deferred to Wave 12.B/C/D/E-polish sprints or rolled into Wave 14.

The dominant recurring theme is the **Wave-13 external-type-leak pattern** — five separate packages shipped emitted `.d.ts` files importing types from undeclared/peer-optional/dev-only dependencies (m9s-cache, fetch, queue, rest-request-manager, api-rlr). The pattern was identified in Wave 11.B (api-core upstream), surfaced once per substrate audit (12.B/12.C/12.D), and after 5 distinct closure cycles is now believed fully closed — a CI guard (`grep "import.*from .external-name'" dist/`) is recommended to prevent regression.

The second dominant theme is **defensive-default inversion** — three Wave-12.A/B/E findings all share the structural pattern "fail-open when context is missing": api-core `BYPASS_AUTH` in prod, m9s-cache `validateKeys: false` in prod, m9s-example `if (session !== undefined) assertAuthenticated(session)`. All three were closed by inverting the guard to fail-closed. The cargo-cult of the third pattern across 3 ingest actions in m9s-example is the single most actionable risk signal for downstream consumers learning from the reference app.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: synthesis
- **linked_artifact**: PRD-040
- **summary**: Wave 12 cumulative — 6 CRIT + 62 HIGH closed across 38 packages + 3 example apps; 2 HIGH deferred (1 cross-platform, 1 deep-audit scope); ~250 MED/LOW rolled to polish/Wave-14.

R_eff per the math in ADR-006: `min(verdict_score) − CL_penalty = 1.0 − 0.0 = 1.0` for the closure items (each individual fix EVID is `supports`/CL3). The 14 source audit/fix EVIDs aggregate to R_eff ≥ 0.5 (threshold) with the limiting factor being the 2 open HIGH items above.

## 38-Package + 3-App Risk Matrix

Severity tuples are (CRIT/HIGH/MED/LOW) — raw findings vs. closed status. Packages with all-LOW findings condensed to one line each. **Bold** rows received CRIT or HIGH findings across any wave.

### Tier 1 — foundation utilities (15 packages audited in Wave 12.B + 2 missed in 12.D)

| Tier | Package | Raw (C/H/M/L) | Closed (C/H/M/L) | Open (C/H/M/L) | Top remaining |
|---|---|---|---|---|---|
| 1 | @gertsai/fsm | 0/0/2/3 | 0/0/0/0 | 0/0/2/3 | Silent handler-error swallow (intentional, no diagnostic hook) |
| 1 | **@gertsai/fetch** | 1/2/4/3 | 1/2/0/0 | 0/0/4/3 | URL-validator consolidation with utils (12.F scope) |
| 1 | **@gertsai/collection** | 0/3/9/5 | 0/3/0/0 | 0/0/9/5 | Largest package; surface cleanup deferred to 14 |
| 1 | @gertsai/llm-costs | 0/0/4/2 | 0/0/0/0 | 0/0/4/2 | findModel prefix-match returns wrong model for short ids |
| 1 | **@gertsai/utils** | 0/4/9/5 | 0/4/0/0 | 0/0/9/5 | consola type-leak (deferred, lower blast radius); MED cleanup |
| 1 | **@gertsai/m9s-cache** | 2/3/10/8 | 2/3/0/0 | 0/0/10/8 | Subpath split landed; Redlock + validateKeys closed |
| 1 | **@gertsai/ws-rpc** | 0/2/5/5 | 0/2/0/0 | 0/0/5/5 | connect() race + Node-only headers union landed |
| 1 | @gertsai/config | 0/0/1/1 | 0/0/0/0 | 0/0/1/1 | S-shim Tier-1→Tier-4 inversion (documented exception) |
| 1 | @gertsai/tenant | 0/0/0/1 | 0/0/0/0 | 0/0/0/1 | **Architectural exemplar — recommended reference** |
| 1 | @gertsai/otel | 0/0/3/4 | 0/0/0/0 | 0/0/3/4 | loadPeerDep `require()` polyfill broken in pure-ESM Node 22 |
| 1 | **@gertsai/pg-client** | 0/2/6/4 | 0/2/0/0 | 0/0/6/4 | runBatch atomicity closed; SQL injection guards defensible |
| 1 | @gertsai/session | 0/0/5/5 | 0/0/0/0 | 0/0/5/5 | Default errorHandler swallows; token getter encourages misuse |
| 1 | @gertsai/entity-audit | 0/0/1/0 | 0/0/0/0 | 0/0/1/0 | Clean code; tier-table reconciliation needed |
| 1 | **@gertsai/errors** | 0/1/8/4 | 0/1/0/0 | 0/0/8/4 | REDACTION_KEYS expanded; serializeAppError truncates cause-chain |
| 1 | @gertsai/tenant-resolver | 0/0/5/5 | 0/0/0/0 | 0/0/5/5 | Subdomain "left-most label wins" misconfigurable |
| 1 | **@gertsai/async-utils** | 0/1/2/2 | 0/1/0/0 | 0/0/2/2 | Retry signal-aware sleep closed; withTimeout abort propagation |
| 1 | **@gertsai/logger-factory** | 0/1/4/1 | 0/1/0/0 | 0/0/4/1 | Deep redaction landed (consumes errors.redactDetails) |

### Tier 2 — mid-layer (12 packages audited in Wave 12.C)

| Tier | Package | Raw (C/H/M/L) | Closed (C/H/M/L) | Open (C/H/M/L) | Top remaining |
|---|---|---|---|---|---|
| 2 | **@gertsai/flux** | 0/2/6/4 | 0/2/0/0 | 0/0/6/4 | pipe() throw + once-listener identity landed |
| 2 | **@gertsai/di** | 0/1/7/3 | 0/1/0/0 | 0/0/7/3 | destroyed event rename landed; pervasive any in factories |
| 2 | @gertsai/query-dsl | 0/0/4/2 | 0/0/0/0 | 0/0/4/2 | **Cleanest type-system in audit**; array-op size MED |
| 2 | **@gertsai/storage-core** | 0/1/2/4 | 0/1/0/0 | 0/0/2/4 | Doc drift on capabilities shape fixed in CLAUDE.md |
| 2 | **@gertsai/rest-request-manager** | 0/3/8/3 | 0/3/0/0 | 0/0/8/3 | Logger leak + rate-limiter drift closed; circuit-breaker LRU |
| 2 | **@gertsai/entity** | 1/3/4/2 | 1/3/0/0 | 0/0/4/2 | **Highest density Tier-2**; CRIT peer cycle + 3 HIGH closed |
| 2 | @gertsai/entity-svelte | 0/(1)/2/3 | 0/(1)/0/0 | 0/0/2/3 | (HIGH collapsed with entity H-2) markRaw divergence closed |
| 2 | @gertsai/entity-react | 0/0/2/2 | 0/0/0/0 | 0/0/2/2 | Subscribers Set never cleaned when empty |
| 2 | @gertsai/entity-solid | 0/0/3/1 | 0/0/0/0 | 0/0/3/1 | Proxy not cached per target |
| 2 | **@gertsai/queue** | 0/2/2/4 | 0/2/0/0 | 0/0/2/4 | bullmq inline + conditional spread landed |
| 2 | @gertsai/audit-primitives | 0/0/2/2 | 0/0/0/0 | 0/0/2/2 | Tier-table reclassify (Tier-2 → Tier-1) |
| 2 | @gertsai/entity-vue | 0/0/1/0 | 0/0/0/0 | 0/0/1/0 | Cross-adapter parity comment missing (intentional per ADR-008) |

### Tier 3-5 — higher-tier + sampled core (12 packages audited in Wave 12.D)

| Tier | Package | Raw (C/H/M/L) | Closed (C/H/M/L) | Open (C/H/M/L) | Top remaining |
|---|---|---|---|---|---|
| 3 | **@gertsai/core** (sampled 16%) | 0/3/7/3 | 0/3/0/0 | 0/0/7/3 | **Wave 12.D2 deferred deep-audit on un-sampled 84% before v0.2.0** |
| 3 | @gertsai/hsm | 0/2/3/2 | 0/2/0/0 | 0/0/3/2 | Dead peer-dep removal + Vault HTTPS landed |
| 3 | **@gertsai/entity-storage** | 0/4/5/2 | 0/4/0/0 | 0/0/5/2 | IDOR docs + _destroyed re-check + dead peer landed |
| 2 | **@gertsai/rpc-proxy-builder** | 0/0/2/1 | 0/0/0/0 | 0/0/2/1 | **Exemplary 100-LOC utility — reference-quality** |
| 4 | **@gertsai/auth-openfga** | 0/1/5/3 | 0/1/0/0 | 0/0/5/3 | initialize race closed; apiToken leak (CWE-200) MED |
| 4 | **@gertsai/api-core** | 4/9/15/8 | 4/9/0/0 | 0/0/15/8 | **Largest finding count**; Wave 13 closure landed; Wave 14 god-class decomposition deferred |
| 4 | **@gertsai/runtime-context** | 0/2/3/0 | 0/2/0/0 | 0/0/3/0 | $freeze race + isEnabled blanket-catch closed |
| 2 | **@gertsai/session-guard** | 0/1/1/2 | 0/1/0/0 | 0/0/1/2 | isImpersonating fail-closed default landed |
| 5 | **@gertsai/api-rlr** | 1/6/5/4 | 1/6/0/0 | 0/0/5/4 | CRIT moleculer peer-dep + RlrRequestContext rename + globalThis cleanup landed |

### Example apps (3 audited in Wave 12.E)

| Tier | App | Raw (C/H/M/L) | Closed (C/H/M/L) | Open (C/H/M/L) | Top remaining |
|---|---|---|---|---|---|
| app | **examples/m9s-example** (backend) | 2/8/13/9 | 2/7/0/0 | 0/1/13/9 | **H-16 bcryptjs → native bcrypt deferred to Wave 13** |
| app | **examples/m9s-example-web** (frontend) | 1/6/12/14 | 1/6/0/0 | 0/0/12/14 | Console-as-logger 4 sites; auth-model 3-way inconsistency |
| app | **examples/m9s-example-api-types** | 2/6/4/3 | 2/6/0/0 | 0/0/4/3 | Dead generator deleted (-1203 LOC); snapshot procedure documented |

**Totals:**
- Raw: **6 CRIT + 64 HIGH + 161 MED + 116 LOW** (~347 findings across 38 packages + 3 apps)
- Closed: **6 CRIT + 62 HIGH** (100% CRIT, 97% HIGH)
- Open: **0 CRIT + 2 HIGH + 161 MED + 116 LOW**

## Cross-Cutting Patterns

### Pattern 1 — External type-leak in published `.d.ts` (Wave-13 recurrence × 5)

**Packages affected:** `@gertsai/fetch` (undici, CRIT-2 W12.B), `@gertsai/m9s-cache` (moleculer + ioredis, CRIT-1 W12.B), `@gertsai/utils` (consola, T-3 W12.B HIGH), `@gertsai/queue` (bullmq, H-3 W12.C), `@gertsai/rest-request-manager` (Logger, H-4 W12.C), `@gertsai/api-rlr` (moleculer, CRIT-1 W12.D), `@gertsai/entity` (Node `events`, H-5 W12.C). Original prototype: `@gertsai/api-core/moleculer` (Wave 11.B upstream).

**Root cause:** packages declared external types in public surface but the dependency was either (a) marked optional peer-dep — consumers omitting the peer cannot satisfy types, (b) declared in `devDependencies` only — completely unresolvable for downstream, or (c) Node-only built-in (`events`) without `engines.node` declaration.

**Closure strategy converged on three patterns:**
1. **Inline minimum-surface structural copy** (used in fetch, queue, rest-request-manager, errors) — recreate the small subset of the external type's surface that the package actually consumes.
2. **Split into subpath barrel** (used in m9s-cache → `/moleculer` + `/redis`; api-core → `/moleculer`) — root export stays clean; subpaths import externals and consumers opt in.
3. **Declare `engines.node`** (used in entity, async-utils, etc.) — contractually declares Node-only dependency.

**Status:** all 5 surfaced instances closed. **Recommendation:** add CI guard (`grep -r "from '<external>'" packages/*/dist/index.d.ts`) for each known external dep to prevent regression.

### Pattern 2 — "Auth-if-present" anonymous-access cargo-culting

**Pattern:** `if (session !== undefined) assertAuthenticated(session)` — the guard silently no-ops when no session in context, leading to anonymous-access fail-open.

**Site of origin:** unknown — possibly copy-pasted from a legitimate optional-context handler.

**Cargo-culted to 3 ingest actions** in `examples/m9s-example`: `ingest-document.action.ts`, `delete-document.action.ts`, `upload-document.action.ts`. EVID-053 CRIT-2 surfaced this as the single most consequential reference-app misdemeanour. Closure (EVID-054): replace conditional with unconditional `assertAuthenticated(session)`.

**Cross-finding linkage:** structurally identical to:
- **api-core BYPASS_AUTH** (W12.A CWE-347) — flag enabled fail-open path runs in production.
- **m9s-cache `validateKeys` default backwards** (W12.B S-3 CWE-20) — `NODE_ENV !== 'production'` produced strict-default-in-dev/lax-default-in-prod.

All three were closed by inverting the guard to fail-closed; the pattern itself (think-twice before defaulting permissively in any auth/validation branch) recommends a repo-wide convention.

**Status:** all 3 instances closed. **Recommendation:** establish project convention "secure default + explicit opt-out", document in CONTRIBUTING.md, and have `code-reviewer` agent flag any `if (X !== undefined) { secure(X) }` ternary in auth/validation paths.

### Pattern 3 — Three-envelope error drift

**Site:** `examples/m9s-example` ships **three competing error envelopes** in the same workspace:
1. Backend runtime: `ProblemDetails` from `@gertsai/errors/http` (RFC 9457 with urn buckets) — canonical per ADR-006.
2. Backend OpenAPI declaration: `ProblemDetails` in `openapi/schema.ts:236-251` — RFC 9457 shape but no urn bucket.
3. api-types generator: `GertsErrorResponse` (completely different envelope) — invented by the dead generator.

**Root cause:** the `generateOpenAPISchema()` 683-LOC generator (CRIT-5 W12.E) was a parallel implementation that drifted independently from the runtime error taxonomy. Phase 1 closure deleted the generator (`-1203 LOC` total including its build script).

**Cross-finding linkage:** also linked to W12.D-fix's `errors.REDACTION_KEYS` expansion and `logger-factory.applyRedaction` consuming-the-kernel-instead-of-shallow-impl — each prevented future drift by consolidating on a single canonical Shared Kernel.

**Status:** dead generator deleted; backend `openapi/schema.ts` realigned (Phase 2 Teammate C); api-types snapshot realigned (Phase 1 Teammate B). **Recommendation:** any package implementing a structural-clone or parallel-implementation of a canonical Shared Kernel surface should be flagged for review during PR creation.

### Pattern 4 — Dead code shipped with promised contract

**Sites:**
- `@gertsai/hsm` declared peer-dep `@gertsai/core` — not imported in source (A-3 W12.D).
- `@gertsai/entity-storage` declared peer-dep `@gertsai/entity` — not imported in source (A-4 W12.D).
- `examples/m9s-example-api-types/src/openapi/generator.ts` — 683-LOC central feature exported but unused (CRIT-5 W12.E).
- `examples/m9s-example/src/composition/errors.ts:appErrorToHttpResponse` — HTTP scrubber exported but never wired (H-4 W12.E).
- `examples/m9s-example/src/composition/infrastructure.ts:rotationStore` — Redis impl wired into `SharedInfrastructure` but auth actions still used module-level Map (CRIT-1 W12.E).

**Pattern:** code shipped with a documented contract or a wired-up composition root, but the actual call site never references it. Consumers reading the package surface get one expectation; the runtime behaviour differs.

**Closure strategy:** delete dead code (W12.E CRIT-5, ~1200 LOC removed), OR wire it (W12.E H-4 + CRIT-1, both wired into call sites). Dead peer-deps W12.D-fix A-3/A-4 trivially removed from `package.json`.

**Status:** all 5 instances closed. **Recommendation:** during PR review, audit for "exported but not invoked" exports — especially in composition roots. `code-review-graph` MCP's `query_graph(callers_of=...)` can detect zero-caller exports automatically.

### Pattern 5 — Brand-symbol discipline divergence

**Sites:**
- `@gertsai/entity` plain adapter (H-2 W12.C) — used `Symbol.for(...)` (shared global registry) + writable `[]=` property assignment. Same package's framework adapters (entity-react/solid/svelte) used module-private `Symbol(...)` + `defineProperty(..., {configurable: false, writable: false})`. The most-used default adapter had the weakest brand.
- `@gertsai/collection` (T-2 W12.B) — brand factories cast without validation.
- `@gertsai/runtime-context` (Sprint 3.10 ADR-010 §I-12) — got it right with module-private brand symbol.

**Pattern:** branded types are a runtime-soft type-safety device; their security depends on the brand being unforgeable. `Symbol.for(...)` shared registry trivially forgeable; writable property assignment trivially tamperable.

**Closure strategy:** harmonised on ADR-008 I-11 pattern — module-private `Symbol(...)` + locked `defineProperty(...)` + factory validates input (EVID-049 H-2; EVID-047 collection T-2).

**Status:** all 3 instances closed. **Recommendation:** document the brand pattern in a tier-1 utility (e.g. `@gertsai/utils.createBrand<T>(name)`) so future package authors don't reinvent inconsistently.

### Pattern 6 — Silent error swallow / event-name mismatch / partial-await rot

**Sites:**
- `@gertsai/m9s-cache` Redlock swallows ALL errors as "lock unavailable" (L-5 W12.B). Redis-down → silent DoS amplifier.
- `@gertsai/di` listens for `'destroy'`; entity emits `'destroyed'`. Memory leak from never-fired cleanup (H-9 W12.C).
- `@gertsai/runtime-context.DefaultFeatureContext.isEnabled` swallows all exceptions (L-4 W12.D).
- `@gertsai/entity-storage.upsert` — TOCTOU race + `_assertAlive` not re-checked after await (L-5 W12.D).
- `examples/m9s-example/composition/infrastructure.ts` 4 sites use `console` directly bypassing redaction.
- `@gertsai/fsm`, `@gertsai/pg-client`, `@gertsai/utils/url-validator`, `@gertsai/ws-rpc` — recurring empty `catch {}` blocks.

**Pattern:** in long async chains and event-driven cleanup, the absence of an observable signal at a failure point makes incident diagnosis extremely costly. Combined with `removeAllListeners()` after-emit, observers cannot react synchronously.

**Closure strategy:** W12.C-fix-2+3 renamed di's `'destroy'` → `'destroyed'`; W12.D-fix added `isEnabled` injectable logger (FeatureContextLogger peer-optional); W12.B-fix-2 added `_isLockHeldError` classifier in Redlock; W12.D-fix made `_destroyed` re-checked after every `await provider.*` in entity-storage CRUD.

**Status:** all surfaced HIGH instances closed; recurring `catch {}` deferred to repo-wide convention. **Recommendation:** lint rule "empty catch only with `// reason:` comment + emission to structured logger when not in test", per EVID-044 cross-package observation #7.

### Pattern 7 — Cross-package consistency gaps (Wave 12.F scope)

**Sites:**
- **Two SSRF URL validators** co-exist (`@gertsai/fetch/lib/url-validator.ts` + `@gertsai/utils/security/url-validator.ts`, EVID-044 Obs #2) — fix CWE-918 in one, miss it in other.
- **Retry/jitter strategies divergent** across 5 packages (EVID-051 Obs #7) — `async-utils` canonical, but core/retry, hsm/utils/retry, auth-openfga.withRetry, api-rlr/ResilientRedisAdapter each have own implementation.
- **LRU caches duplicated** in core (541 LOC), auth-openfga (~110 LOC), rest-request-manager circuit-breaker.
- **`IDestroyable` interface duplicated** in `@gertsai/core/session/types.ts:330` + `@gertsai/di/src/types.ts:38`.
- **`Math.random()` for IDs/jitter/sampling in 5+ Tier-1 packages** (EVID-044 Obs #3) — none security-critical today but `getRandomId` naming invites misuse.
- **Peer-dep loading pattern divergent** — `otel` (broken require polyfill), `m9s-cache` (mixed), `tenant-resolver/moleculer` (no runtime guard) (EVID-044 Obs #5).

**Status:** all open — these are NOT individually severe enough to gate a release but they constitute "consistency debt" that increases the cost of subsequent fixes. Tracked for Wave 12.F.

### Pattern 8 — CLAUDE.md tier-table drift

**Sites:** EVID-044 Obs #10 (`audit-primitives` tier-table says Tier-2 but zero internal deps = Tier-1 behaviour), EVID-048 Obs #6 (`storage-core` Wave 7.2 capabilities shape tri-state in docs vs boolean-pair in code), EVID-051 Obs #10 (`runtime-context` session-guard peer missing from tier-table entry).

**Closure strategy:** Wave 12.C-fix-2+3 (EVID-050) updated `storage-core` tier-table line. **`audit-primitives`** tier reclassification + `runtime-context` peer doc update deferred.

**Status:** 1 of 3 closed (storage-core); 2 deferred to documentation pass.

## Recommended Next Actions (prioritised)

Scoring: `severity_max × consumer_count` where `consumer_count` is approximate dependents of the package (inferred from CLAUDE.md tier table).

1. **[Wave 12.D2 — `core` deep-audit of un-sampled 84%]** — affects `@gertsai/core` (~30k LOC, 16% sampled in W12.D) — severity_max × consumers = HIGH × ~6 (api-core + agent stack consumers) = **score ~18**. Logic reviewer explicitly recommended before promoting `core` to v0.2.0. Focused review of `agent.ts`, query, session, llm/providers (~6-8k LOC). EVID-051 §"Suggested follow-up wave structure".

2. **[Wave 13 — `bcryptjs → native bcrypt` in m9s-example]** — affects `examples/m9s-example` only — severity_max × consumers = HIGH × 0 (reference app only) = **score ~5** but high-visibility CPU starvation + anti-enumeration timing leak under load. Requires native module + cross-platform build. EVID-056 §"Deferred".

3. **[Wave 12.F — cross-package consistency consolidation]** — affects all 38 packages — severity_max × consumers = MED × N = **score variable**. Concrete sub-items: URL-validator unify (fetch + utils), retry/jitter migrate to async-utils, LRU cache extract to Tier-1, `IDestroyable` consolidate to single owner, peer-dep loading pattern codify (`createRequire(import.meta.url)` + lazy in-function + `MissingPeerDepError`). EVID-044 Cross-package observations.

4. **[CI guard for external-type-leak regression]** — affects all 38 packages — preventive, blocks Wave-13-pattern recurrence #6. Concrete: GitHub Actions step `grep -r "from '\(undici\|moleculer\|ioredis\|bullmq\|@gertsai/logger-factory\|consola\)'" packages/*/dist/index.d.ts && exit 1`. Per EVID-051 Obs #1.

5. **[Wave 14 — `@gertsai/api-core` god-class decomposition]** — affects api-core (top-of-stack, ~90% of substrate depends on it) — severity_max × consumers = HIGH × ~30 = **score ~90**. Deferred from Wave 13 per EVID-043 §"What is NOT closed". `ApiController` SRP/OCP/DIP split, `/contracts` typia extraction, `ActionOptions` `= any` defaults → `unknown`, OAuth class proper typing (eliminate `any` on `_ctx`/`options`/`route`/`$mixin`), comprehensive test coverage (BullMQ, Pub/Sub, OAuth, Diagnostics).

6. **[`@gertsai/collection` surface cleanup]** — affects collection (~11.7k LOC, largest Tier-1 package) — severity_max × consumers = MED × ~5 = **score ~10**. Wave 14 candidate per EVID-044 §"per-package summary cards". Brand-validation pattern adopted; `any` widened to `unknown`; subpath `typesVersions` landed in W12.B-fix-3.

7. **[Tier-table reclassify `audit-primitives` Tier-2 → Tier-1]** — affects 1 doc line in CLAUDE.md — severity_max × consumers = LOW × N = **score ~3** but reduces operator confusion. Per EVID-044 Obs #10. Combine with `runtime-context` session-guard peer doc update (EVID-051 Obs #10).

8. **[Repo-wide convention "secure default + explicit opt-out"]** — affects all packages/apps — preventive, blocks Pattern 2 recurrence. Documented in CONTRIBUTING.md + `code-reviewer` agent flag any `if (X !== undefined) { secure(X) }` ternary in auth/validation paths. Per Pattern 2 §Recommendation.

9. **[Repo-wide convention "empty catch with `// reason:` + structured-logger emission"]** — affects all packages — preventive, blocks Pattern 6 recurrence. Lint rule (could leverage `oxlint`'s no-empty-block rule customized). Per EVID-044 Obs #7.

10. **[`forge-safety-hook` extension — flag "exported but not invoked"]** — affects all packages — preventive, blocks Pattern 4 recurrence. Use `code-review-graph` MCP `query_graph(callers_of=...)` returning zero callers as a soft warning during PR review.

## Methodology Notes

- **Sources:** 14 EVIDs (043, 044, 045, 046, 047, 048, 049, 050, 051, 052, 053, 054, 055, 056). Wave 12.A baseline = EVID-043 (api-core), then 4 audit/fix-pair cycles (B/C/D/E) each producing 1 audit-EVID + 1-3 fix-EVIDs.
- **Synthesis approach:** same-finding collapse across waves (e.g. fetch CRIT-2 W12.B counted once even though discussed in EVID-044 + EVID-045); severity max-merge when domains overlap (e.g. m9s-cache moleculer leak counted as 1 CRIT despite Architecture-CRIT + Type-CRIT in raw audit); closure status from explicit fix-EVID Verification matrices.
- **R_eff math** per ADR-006: each fix-EVID is independently `supports` × CL3 = 1.0; audit-EVIDs are `weakens` × CL3 = 0.5 (used to gate activation, not to compute closure rate).
- **Limitations:**
  - Some MED/LOW from Wave 12.A were not enumerated in EVID-043's executive summary — only CRITICAL findings cited; MED/LOW counts inferred from reviewer scores (logic 6/10 etc.).
  - **`core` un-sampled 84%** is a known gap; the matrix shows current findings only for the sampled 16%.
  - **flux sampled 11-73%** across reviewers; sub-audit explicitly declined per EVID-048 cross-package Obs #9.
  - The matrix does NOT enumerate the ~250 MED/LOW deferred items individually; they are rolled into the per-package "Open" column and footnoted as "deferred to polish sprint or Wave 14".
  - The matrix uses approximate raw-finding counts where exact numerics weren't tabulated in source EVIDs (especially for MED/LOW). All CRIT/HIGH counts are precise.

## Refs

- **PRD-040** (target — this EVID informs)
- **EVID-043** Wave 12.A api-core (Wave 13 closures)
- **EVID-044** Wave 12.B audit — 15 Tier-1 + EVID-045/046/047 closures (fix-1/2/3)
- **EVID-048** Wave 12.C audit — 12 Tier-2 + EVID-049/050 closures (fix-1, fix-2+3)
- **EVID-051** Wave 12.D audit — 12 Tier-3-5 + EVID-052 combined closure
- **EVID-053** Wave 12.E audit — 3 example apps + EVID-054/055/056 closures (fix-1, fix-2-Phase1/2)
- **EVID-040** Wave 11.A production-hardening baseline (FR-001..005 verification anchor for Wave 12.E)
- **CLAUDE.md** — 38-package tier table (reconciliation items pending per Pattern 8)
- **ADR-006** `@gertsai/errors` Shared Kernel + R_eff math
- **ADR-008** entity reactive adapter ISP + I-11 module-private symbols (Pattern 5)
- **ADR-009** async-utils invariants (jitter + AbortSignal; cross-package consolidation target Pattern 7)
- **ADR-012** auth-openfga multi-instance scoping (precedent for api-rlr globalThis fix)


