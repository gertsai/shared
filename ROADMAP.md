# ROADMAP — gertsai/shared

**Status**: pre-v1.0, technically ready, **Phase 1.5 active** — m9s-example expanding to full ecosystem reference demo before production trial.

Snapshot (post-Wave-36, Wave 37 setup 2026-05-26):
- 38 packages, 401 api-core tests, 0 open PRs, 0 known issues
- Audit ledger 100% closed (44/44 across EVID-080 + EVID-083)
- Live Docker re-verification: 15/15 passed (2× independent runs)
- m9s-example exercises 18 packages directly + ~3 transitively + otel
- **Phase 1.5 active**: integrating remaining 7 packages per ADR-016 — `query-dsl`, `tenant` brand, `llm-costs`, `rpc-proxy-builder`, `fsm`/`hsm`, `flux`, `ws-rpc`
- Forgeplan ledger blind_spots = 0

---

## Phase 1 — Production trial (deferred until after Wave 40)

> **Status update 2026-05-26**: Per ADR-016, Phase 1 is deferred until after Wave 40. m9s-example must reach full-ecosystem reference role first so production trial validates a realistic feature surface, not a stripped reference. See Phase 1.5 below.
>
> **Goal (unchanged)**: surface friction that checklists don't show. 2 weeks, real traffic, real consumers.

- [ ] **P1.1** Pick a pet project to deploy m9s-based service to (any tenant-scoped backend works: SaaS prototype, internal tool, side project)
- [ ] **P1.2** Wire `OTEL_EXPORTER_OTLP_ENDPOINT` to a real collector (Honeycomb / Grafana Cloud free tier / Tempo) — verify spans appear
- [ ] **P1.3** Run for 2 weeks. Capture in a notes file:
  - Every time API forced an awkward workaround
  - Every docs gap encountered ("I had to read source to figure out X")
  - Every error message that was unhelpful
  - Every type signature that fought you
  - Performance issues at real (not synthetic) load
- [ ] **P1.4** Triage the notes → "ship before v1.0" vs "ship after v1.0" — if list is short (≤5 items, all minor), v1.0 is ready

---

## Phase 1.5 — m9s ecosystem coverage (active 2026-05-26)

> **Goal**: m9s-example shifts from "minimal realistic consumer" to "full ecosystem reference demo". Integrate remaining 7 `@gertsai/*` packages so consumers see realistic usage of every Tier-1/Tier-2 package. Decision + trade-off captured in ADR-016.
>
> **Trade-off accepted**: demo-completeness > production-validation-first. Production trial (Phase 1) resumes after Wave 40 with realistic m9s as deploy target.

| Wave | Packages | Focus | Risk | Artifacts |
|---|---|---|---|---|
| 37 | `query-dsl` + `tenant` brand + `llm-costs` | Backend type-safety + cost observability | Low | PRD-071, EVID-NN |
| 38 | `rpc-proxy-builder` | Frontend typed RPC client | Medium | (TBD) |
| 39 | `fsm` or `hsm` | Document ingestion state machine | Medium-High | (TBD + ADR for fsm vs hsm choice) |
| 40 | `flux` + `ws-rpc` | LLM token streaming + real-time transport | Medium | (TBD) |

- [ ] **P1.5.1** Wave 37 — PRD-071 in draft; landing sites known from m9s audit:
  - `examples/m9s-example/src/infrastructure/pg-document.repository.ts:84-159` (6 tenant-filtered queries → query-dsl)
  - `examples/m9s-example/src/infrastructure/pg-vector.store.ts:73-113` (vector insert + cosine similarity → query-dsl)
  - `examples/m9s-example/src/composition/wave5-middlewares.ts:110` + 2 repo constructors (TenantId brand)
  - `examples/m9s-example/src/infrastructure/{openai,ollama}-embedder.ts` + `services/ingest/src/actions/embed-batch.action.ts:67` (llm-costs hooks)
- [ ] **P1.5.2** Wave 38 — rpc-proxy-builder typed client (depends on Wave 37 action signature stability)
- [ ] **P1.5.3** Wave 39 — document ingestion state machine; new ADR for fsm-vs-hsm choice
- [ ] **P1.5.4** Wave 40 — flux for streaming UI + ws-rpc replacing SSE handler

After Wave 40 ships, Phase 1 trial resumes immediately.

---

## Phase 2 — v1.0 release (depends on P1 trial completion)

> **Goal**: commit to API stability. After v1.0, every breaking change = MAJOR bump = consumer coordination.

- [ ] **P2.1** Fix any "must-ship-before-v1.0" items from P1.4
- [ ] **P2.2** Migration guide for downstream — what changes since their last 0.x install
- [ ] **P2.3** Per-package CHANGELOG sanity-check (changesets bot already maintains, just review)
- [ ] **P2.4** Bump strategy decision:
  - Option A: bulk 0.x → 1.0.0 for all 38 packages via single changeset
  - Option B: per-tier — Tier 1 first (foundation libs), Tier 2-5 in waves
  - Default: A (one coordinated release, clear cutover)
- [ ] **P2.5** `pnpm changeset` with major bumps for all 38 packages
- [ ] **P2.6** Pre-release announcement (if any): GitHub release notes drafted
- [ ] **P2.7** Merge Version Packages PR → `pnpm changeset publish` (38 majors live)
- [ ] **P2.8** Tag GitHub release `v1.0.0` with summary of session work + audit closure

---

## Phase 3 — Post-v1.0 technical follow-ups

### P3.1 — Deferred audit items (low priority, document if shipping as v1.0.x)

- [ ] **security-W1**: testSession gating negative test via separate Vitest worker config (EVID-087 deferred — structurally untestable in current suite)
- [ ] **W2 entity._uidGetter / _uidPath rename**: internal Entity instance fields still snake_case (Wave 34 PR-2 only touched serialization surface). Cosmetic, can wait.

### P3.2 — Production observability (Wave 37+)

- [ ] Manual span emission inside business handlers (stage 8 `invokeHandler` currently no-op for OTel). Add `tracer.startActiveSpan(...)` wrappers around real I/O: PgClient queries, Ollama embed calls, BullMQ enqueue, OpenFGA checks.
- [ ] Dedicated CI runner for perf:gate (current ±30% slack vs achievable ±5% on dedicated hardware)
- [ ] Add `prometheus-expert` skill output: m9s `/metrics` endpoint with RED metrics (Rate, Errors, Duration) per pipeline stage

### P3.3 — Extension API maturity

- [ ] `setStageOverride` real-world validation: collect feedback from production trial — is replace-only sufficient or do users want chain composition?
- [ ] `addStageBefore`/`addStageAfter`/`wrapStage` (Wave 34 PR-1) usage telemetry — which stages get overridden most? Surface the sensitive-stage warn as opt-in `acknowledgeSecurityImpact: true` if abuse detected.

### P3.4 — Missing-package coverage gaps in m9s

> **MOVED to Phase 1.5 (2026-05-26)** — per ADR-016, missing-package coverage is now active goal in Waves 37-40, not deferred. Historic context preserved below for reference; concrete waves tracked in Phase 1.5.

Historic list (original "add when production demands it" plan): query-dsl, rpc-proxy-builder, fsm, hsm, flux, llm-costs, ws-rpc, tenant brand strictness.

---

## Phase 4 — Long-tail / nice-to-have

- [ ] **P4.1** Documentation site (Docusaurus / VitePress) — per-package API docs from TypeDoc + cross-package guides
- [ ] **P4.2** npm-discovery: publish to public registry (currently GitHub Packages only — `@gertsai/*` scope)
- [ ] **P4.3** Public examples beyond m9s: minimal `entity-vue` demo, `fsm` workflow demo, `llm-costs` budget tracker
- [ ] **P4.4** Ecosystem RFC: `addStageBefore` consumer survey → if demand, expand to `interceptStage(pattern)` or middleware-style chains
- [ ] **P4.5** Hub repo (`gertsai_codex`) Phase 2 migration: extract remaining shared code into `@gertsai/*`

---

## Out of scope (intentional)

- Refactoring m9s-example into separate examples (one big monolithic reference is correct for now)
- Per-tier major bump cadence after v1.0 (one v1.x line, no LTS branches)
- Browser-bundle optimization (Tier-1 packages already browser-safe via env splits)

---

## Session-start prompt for next session

Copy this to start a focused continuation:

```
Context: я в gertsai/shared (Apache 2.0 OSS multi-package monorepo, @gertsai/* scope).

Состояние pre-v1.0, технически готово, **Phase 1.5 active** (m9s-example → full ecosystem reference demo):
- 38 packages, 401 api-core tests passing, 0 open PRs, audit ledger 100% closed
- Wave 37 setup (2026-05-26): ADR-016 + PRD-071 в draft, ROADMAP реклассифицирован
- Phase 1.5 plan: Wave 37 (query-dsl + tenant + llm-costs) → 38 (rpc-proxy-builder) → 39 (fsm/hsm) → 40 (flux + ws-rpc)
- После Wave 40 — Phase 1 production trial resumes
- Полный контекст: ROADMAP.md + ADR-016 + PRD-071 + EVID-089 (последняя session closure)
- Hindsight bank gerts_shared содержит session report

Сегодня хочу: [ВПИСАТЬ ОДНО ИЗ]
- (A) Wave 37 code work — спавн team-lead + 5-7 specialist agents (query-dsl/tenant/llm-costs integration)
- (B) уточнить PRD-071 / создать парный RFC
- (C) перейти к Wave 38 (rpc-proxy-builder) если Wave 37 уже shipped
- (D) Phase 1 production trial если все 4 waves закрыты

Загрузи: forgeplan_health, последний git log, ROADMAP.md, forgeplan_get PRD-071.
Не запускай новые waves без явной команды.
```

---

_Last updated: 2026-05-26 — Wave 37 setup (ADR-016 + PRD-071 draft created; ROADMAP reclassified P3.4 → Phase 1.5)_
