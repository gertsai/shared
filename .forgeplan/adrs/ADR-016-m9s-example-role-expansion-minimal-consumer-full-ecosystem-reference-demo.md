---
depth: standard
id: ADR-016
kind: adr
last_modified_at: 2026-05-26T15:53:18.798868+00:00
last_modified_by: claude-code/2.1.150
status: active
title: m9s-example role expansion — minimal consumer → full ecosystem reference demo
---

# ADR-016: m9s-example role expansion — minimal consumer → full ecosystem reference demo

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-05-26 |
| Deciders | gogocat (maintainer), session orchestrator |
| Parent | ROADMAP.md (Phase 1.5 active) |

## Context

After Wave 36 (m9s + `@gertsai/otel` integration + Docker re-verification), `examples/m9s-example/` exercises 18 of 38 packages directly + ~3 transitively. The remaining 7 packages — `query-dsl`, `tenant` brand, `llm-costs`, `rpc-proxy-builder`, `fsm`, `hsm`, `flux`, `ws-rpc` — have no realistic consumer in the repo.

ROADMAP P3.4 (post-v1.0 follow-ups) originally listed these packages as "missing-package coverage gaps in m9s" with explicit guidance: **"Don't add proactively. Add when production demands it."** The intent was: let real production friction tell us which packages need consumer-visible examples, instead of building a kitchen-sink demo.

This ADR records a conscious deviation from that guidance: m9s-example will be expanded NOW (before production trial) to integrate the remaining 7 packages across 4 sequential waves (37–40), AFTER which Phase 1 (production trial) resumes with a realistic m9s as deploy target.

## Decision Drivers

- **Documentation completeness**: future v1.0 consumers reading the reference webapp should see realistic usage of every Tier-1/Tier-2 package, not just a subset
- **Onboarding clarity**: a new user reading `examples/m9s-example/` should understand "this is how a real `@gertsai/*` consumer is shaped" without having to read 38 separate package READMEs
- **Pre-v1.0 freedom**: minor-bump-compatible API tightening (e.g., `TenantId` brand from plain `string`) is acceptable now; post-v1.0 it requires a major bump and consumer migration guide
- **OSS reference webapp convention**: Next.js commerce demo, Spring PetClinic, Vue VueUse — all show "use every key piece of the ecosystem in one app". Partial reference signals abandoned packages to evaluators
- **Counter-drive: production-trial signal loss** — adding all packages preemptively risks coding kitchen-sink anti-patterns that real consumer pressure would have surfaced and rejected

## Considered Options

### Option A — Keep P3.4 deferred (status quo)

Wait for production trial. Only add packages when an actual deploy demands one.

**Pros**: every package integration backed by real friction signal; m9s stays minimal; no kitchen-sink risk; "friction notes" file from trial directly drives integration scope.
**Cons**: production trial may run for months without exercising packages like `fsm`/`hsm`/`flux` (these need specific use cases like workflow state machines or token streaming UI that a single small trial may not touch); m9s-as-reference is incomplete at v1.0; consumers reading at v1.0 see 18/38 packages used; "real friction" signal is weak if trial uses only one shape of consumer.
**Risk**: low operationally, high documentation-completeness debt at v1.0.

### Option B — Expand m9s as full ecosystem demo via Wave 37-40 (this ADR's choice)

4 sequential waves integrating remaining 7 packages with PRD/RFC/EVID per wave. m9s becomes the canonical "all-in-one" reference. Phase 1 trial deferred until after Wave 40.

| Wave | Packages | Risk |
|---|---|---|
| 37 | query-dsl + tenant brand + llm-costs | Low |
| 38 | rpc-proxy-builder | Medium |
| 39 | fsm or hsm | Medium-High (sub-ADR for choice) |
| 40 | flux + ws-rpc | Medium |

**Pros**: at v1.0 m9s shows realistic usage of every package; consumers can learn full ecosystem from one app; demo-completeness aligns with OSS reference-webapp convention.
**Cons**: 4 waves = ~1-2 weeks of work that doesn't validate production behavior; risk of building "looks-correct" patterns that real load would reject; Phase 1 trial signal arrives later.
**Risk**: medium — kitchen-sink risk is real but bounded by per-wave R_eff gate (each PRD AC must justify the integration's value, not just "added because it exists").

### Option C — Selective expansion (only "high-confidence" packages)

Pick 2-3 packages from the 7 that have obvious m9s landing sites (e.g., `tenant` brand for known plain-string read, `llm-costs` for existing embedder call); defer `fsm`/`hsm`/`flux`/`ws-rpc` until production demands them.

**Pros**: middle-ground — partial ecosystem coverage without speculative integrations; lower kitchen-sink risk.
**Cons**: still has the "incomplete at v1.0" problem for half the packages; awkward to explain in docs ("this package exists but our reference doesn't use it").
**Risk**: low-medium.

## Decision

**Choose Option B (expand m9s as full ecosystem demo via Wave 37-40).**

Rationale:
1. **Pre-v1.0 window is the cheapest moment to tighten public surface** (e.g., `string` → `TenantId` brand). Post-v1.0 this is a breaking change requiring major bump + consumer migration guide.
2. **Documentation completeness directly affects adoption**. An OSS multi-package ecosystem with a partial reference webapp signals "abandoned packages" to evaluators considering `@gertsai/*`.
3. **Production trial is not skipped, only deferred**. Phase 1 resumes after Wave 40 with realistic m9s as deploy target — actually a stronger signal because trial then validates a feature surface, not just "does m9s start".
4. **Per-wave R_eff gate prevents kitchen-sink**. Each Wave 37-40 PRD must specify concrete user-visible feature shape, not "add package X because it exists". Wave 37 PRD-071 already follows this discipline (3 concrete landing sites from m9s audit, not blanket integration).
5. **Wave-by-wave isolation enables abort**. If Wave 38 demonstrates fundamental wrongness, Wave 37 ships standalone and 39/40 can be re-scoped or dropped without rollback of prior waves.

## Invariants — what must never be violated

- **m9s-example NEVER modifies `@gertsai/*` package source**. All changes confined to `examples/m9s-example/` and its `package.json`. Any pattern requiring a package change is out of scope for this ADR's waves; it goes through a separate PRD against the package.
- **Each Wave 37-40 must reach R_eff > 0 with linked EVID before activation**. No wave activates on "looks correct"; an EvidencePack with verdict + congruence_level + evidence_type structured fields is mandatory.
- **No package added without a concrete consumer-visible feature**. "Added because it exists" is rejected by the per-wave PRD acceptance criteria. Each integration must specify a user-observable outcome (typed query in repo / branded tenant in middleware / cost event emitted, etc.).
- **Wave-by-wave PR isolation**. Cross-wave coupling that prevents independent revert is forbidden. Wave N+1 may depend on Wave N but must never require Wave N's specific implementation shape — only its public action signatures.
- **Phase 1 trial is deferred, not cancelled**. After Wave 40 ships, Phase 1.1–1.4 from ROADMAP resumes. Any attempt to skip Phase 1 must supersede this ADR.
- **Pre-v1.0 API tightening only**. No breaking change in `@gertsai/*` public surfaces under these waves — only m9s adopts new shapes that packages already support.

## Preconditions

- ROADMAP.md updated with Phase 1.5 section (✅ 2026-05-26)
- m9s audit complete with concrete landing sites (✅ 2026-05-26 — captured in PRD-071 body)
- All `@gertsai/*` packages referenced in Wave 37-40 already published (✅ — query-dsl, tenant, llm-costs all v0.1.x on GitHub Packages)
- Forgeplan ledger blind_spots = 0 (✅ confirmed in session-start health check)

## Postconditions

- After Wave 40 merge: m9s-example imports + uses all 7 target packages with realistic patterns
- After Wave 40 merge: each integration is documented via its PRD (consumer guidance by example)
- After Wave 40 merge: ROADMAP Phase 1 trial work resumes
- After Wave 40 merge: a single EVID-supercluster (or 4 separate EVIDs) records full Phase 1.5 closure for v1.0 release notes

## Consequences

### Positive
- m9s-example at v1.0 release demonstrates realistic usage of all Tier-1/Tier-2 packages
- Pre-v1.0 minor-bump API tightening lands now (TenantId brand, llm-costs cost-tracking surface) — no v2.0 needed for these
- Consumers reading the reference webapp learn the full ecosystem from one source
- Wave 37-40 PRDs establish per-package "what realistic integration looks like" documentation by example
- Phase 1 trial when it runs validates a richer feature surface (better friction signal than minimal m9s would produce)

### Negative
- Production trial (Phase 1) delayed by ~4 waves duration (~1-2 weeks)
- Friction signals from "first real deploy" land later, after we've committed to specific integration shapes
- If a Wave 37-40 integration pattern turns out wrong in production, fix requires another wave (vs. catching it pre-integration via trial)
- ROADMAP "don't add proactively" guidance for P3.4 is now contradicted — future readers must understand the override is intentional (this ADR is the record)

### Neutral
- Total work expanded from "audit ledger closed + ship v1.0" to "+ 4 reference-completeness waves + v1.0"
- Wave count budget: 37 (Wave 37 setup turn) + 38 + 39 + 40 = 4 waves before v1.0 release decision
- ROADMAP Phase 1.5 added explicitly to surface this trade-off (not buried inside Phase 1)
- m9s grows in LOC + dependency count, but stays within `examples/m9s-example/` — no `@gertsai/*` source code touched by these waves

## Affected Files / Modules

**Changed by this ADR's adoption**:
- `ROADMAP.md` — Phase 1.5 section added; P3.4 reclassified

**Will be touched by Wave 37-40 child PRDs** (NOT changed by this ADR itself):
- `examples/m9s-example/src/infrastructure/pg-document.repository.ts` (Wave 37)
- `examples/m9s-example/src/infrastructure/pg-vector.store.ts` (Wave 37)
- `examples/m9s-example/src/composition/wave5-middlewares.ts` (Wave 37)
- `examples/m9s-example/src/infrastructure/{openai,ollama}-embedder.ts` (Wave 37)
- `examples/m9s-example/src/services/ingest/src/actions/embed-batch.action.ts` (Wave 37)
- `examples/m9s-example/web/**` (Wave 38)
- `examples/m9s-example/src/services/ingest/**` (Wave 39 — fsm/hsm for document stages)
- `examples/m9s-example/src/mol-services/sse-ingest.handler.ts` + streaming UI (Wave 40)
- `examples/m9s-example/package.json` (all waves — deps additions)

**Explicitly NOT touched by any wave under this ADR**:
- Any file under `packages/*/src/**` (no `@gertsai/*` source modification)
- `tsconfig.base.json`, `pnpm-workspace.yaml`, `.moon/*`, `.github/workflows/*` (workspace infrastructure unchanged)

## Alternatives considered and rejected

- **Option A (keep P3.4 deferred)**: rejected — kitchen-sink risk is real but bounded; documentation incompleteness at v1.0 is harder to fix later (consumer adoption hesitation) than an over-built reference is to slim down later (m9s changes are isolated, easy revert).
- **Option C (selective expansion)**: rejected — produces awkward "this package exists but isn't used in our reference" messaging; binary commitment (all 7 or none) is cleaner for v1.0 docs.
- **Hybrid: Wave 37 only, then re-evaluate**: rejected as soft version of A — too easy to lose momentum after Wave 37 and never finish; explicit 4-wave commitment surfaces the cost upfront and forces the decision now rather than 4 weeks from now.

## Rollback

Each wave (37, 38, 39, 40) ships as its own PR with its own EVID gate. Any wave can be:
- **Reverted independently**: m9s-example changes are isolated to `examples/m9s-example/` and don't touch any `@gertsai/*` package source. A single `git revert <wave-PR-merge>` removes that integration.
- **Aborted mid-flight**: if Wave 38 demonstrates that frontend RPC integration is wrong shape, Wave 37 ships standalone and 39/40 can be re-scoped or dropped.
- **Trade-off re-evaluated**: this ADR can be superseded by a future ADR-NN if Phase 1.5 produces evidence that Option A would have been better. Wave-by-wave EVID artifacts provide the data.

If after Wave 38 the kitchen-sink risk materializes (m9s feels bloated, integrations feel forced), the recommended action is: ship Waves 37-38 as-is, defer 39-40 to a post-v1.0 follow-up (which is the original ROADMAP P3.4 plan), supersede this ADR with one documenting the partial-rollback rationale.

## Refs

- ROADMAP.md Phase 1.5 (concrete wave plan)
- PRD-071 (Wave 37 — first wave under this decision)
- m9s audit 2026-05-26 (landing-site catalog informing Wave 37 AC; preserved in PRD-071 body)
- ADR-003 (Platform Runtime Boundaries — m9s remains a consumer, no subpath churn)
- ROADMAP P3.4 (the guidance this ADR explicitly overrides)




