---
depth: standard
id: EVID-093
kind: evidence
last_modified_at: 2026-10-30T22:14:02.496029+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-072
  relation: informs
- target: RFC-028
  relation: informs
status: active
title: 'Write-rules remediation: runtime regressions and independent Sol review'
---

---
assigned_number: 93
created: 2026-10-30
predicted_number: 93
slug: evid-write-rules-remediation-runtime-regressions-and-independent-sol-review
updated: 2026-10-30
---

# Write-rules remediation evidence

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: test

## Scope and provenance

PRD-072 / RFC-028, uncommitted working tree on feat/write-rules-getafter-claims, base HEAD 2f0327f2eb208cd024b68249d35bce992f139096. New source/tests authored by openai-codex/gpt-6-luna; independent source review by openai-codex/gpt-6.1-sol. Parent executed commands. Preexisting React snapshot fix was preserved; its browser and renderer negative/positive proof is EVID-091. No commit, push, PR, merge or npm publication.

## Research

- EVID-092 retains its original failing observations and refutes verdict; its obsolete current-readiness applicability is retired through the supported lifecycle.
- The first compiled runtime baseline demonstrated partial memory commits after late CAS failures.
- Blind transaction merge-set reads dropped committed fields.
- Soft-delete/restore getAfter images differed from persisted lifecycle records.
- Literal dotted fields were persisted but omitted from affected-key checks.
- Scalar role/source arguments did not match equivalent arrays.
- Rule reads and routed writes inspected inconsistent or incomplete evaluation state.
- Real PostgreSQL exposed reordered/repeated parameter binding before version assertions.
- Seven real SQL version/rollback cases passed while JSONB filtering initially failed.
- The adapter then exposed projection/predicate parameter collisions; public flat-column value also revealed subquery shadowing.
- Nine ownership regression assertions failed before code changes, with no type/import/collection errors.
- Compiled smoke reproduced two action substitutions, three CAS-stripping paths, and six inherited action-name grants before correction.
- Corrections preserve the shallow literal-key storage contract, once-stamped postimages, callback scope, and typed predicate dispatch.

## Hypotheses considered

### H1 — Align existing persistence invariants

Selected: stage touched memory keys, advance stored SQL versions atomically, own authorization inputs, and use exact queued lifecycle images. Prediction: denied/aborted operations change no records/events, postimages match commit, and stale preconditions cannot be stripped. Observed by real provider regressions and compiled smoke.

### H2 — Introduce nested dot-path persistence

Rejected: changes both provider contracts and requires new SQL patch semantics. Literal-key authorization now matches actual existing persistence without adding that feature.

### H3 — Special-case failing predicates or ignore conflicts

Rejected: would hide the demonstrated atomicity, authorization and version failures. Negative-before/positive-after state checks were retained instead.

## Findings

**Verdict: PASS for reviewed source and scoped runtime behavior.** Profile B independent Sol source reviews closed all cited P1/P2 findings: provider/SQL compatibility and service/rule ownership/action/CAS dispatch. Final dispatch certification explicitly read the optional-action guard and inherited-name/wildcard regressions. No unresolved in-scope source finding was reported. Full-workspace execution is recorded separately below, not inferred from static review.

## Runtime results

Two Luna-authored plain Node scripts exercised built ESM packages, actual Entity/Session/InMemoryStorageProvider/services, and PostgreSQL 16 through a checked-out physical connection. Final run: 28/28 scenarios passed (19 ownership/dispatch/JSONB cases plus 9 provider/rule cases). The same scripts previously failed on each demonstrated defect; barriers are controlled promises, not sleeps/timeouts.

Covered: versioned set/update/upsert; late CAS rollback; memory atomicity and merge reads; exact lifecycle getAfter; literal dotted-field authorization; scalar/array roles; stable target/sibling reads; owned deferred routing and foreign/expired rejection; nested payload/action/claims ownership; direct action/CAS preservation; inherited toString/constructor rejection in direct/batch/transaction; real JSONB filtering/order/offset/count and typed array membership.

## Verification commands

- `pnpm build`: complete workspace PASS (45 selected projects); entity-storage rebuilt after final dispatch narrowing, including ESM/CJS/declarations PASS.
- `pnpm typecheck`: final complete workspace PASS, including examples and their strict test types.
- `pnpm run lint`: PASS.
- Affected package `publint --strict` and `attw --pack . --ignore-rules cjs-resolves-to-esm`: PASS for storage-core, entity-storage, pg-client, query-dsl, entity-react.
- `pnpm install --frozen-lockfile --ignore-scripts`: PASS after declared dev dependency installation; lockfile retained existing importers.
- `pnpm exec changeset status`: PASS; pending breaking storage releases and separate React patch are covered, no version/publish command executed.
- `node /tmp/shared-remediation-ownership-smoke.mjs` and `node /tmp/shared-remediation-live-smoke.mjs`: 28 PASS after final built source.
- Complete workspace tests: PASS, 5794 passed / 105 skipped / 0 failed across 43 projects with test summaries. Command: `REDIS_URL=redis://127.0.0.1:4192 EMBEDDER_URL=http://127.0.0.1:4193 POSTGRES_URL=postgresql://postgres@127.0.0.1:4194/m9s PG_TEST_URL=postgresql://postgres@127.0.0.1:4191/postgres pnpm test`. Example E2E separately passed 8/8; full example suite passed 99 with 3 explicit skips.

## Limitations

Evidence is for this pinned working tree, not a published release or a full production deployment. PostgreSQL tests use an isolated task database and pinned PgClient connection. Existing documented cursor no-op limitations and the provider simple-table-identifier restriction remain out of scope; no cursor or schema-qualified provider support is claimed. Historical EVID-092 remains a true observation of its earlier revision.

## Pinned source revision (SHA-256)

```text
9987a23f99a89aca628e0978bc7600aa468b544e3c843592134ef8d6543ae507  packages/entity-storage/src/BaseEntityStorageService.ts
f93ac8fed362a6d517dff82fec1da6cb4aba78f8abe53ac9d37e4ad9d2253f06  packages/entity-storage/src/InMemoryStorageProvider.ts
18d988b7c6360049aa4b02bdcf9285a98ea0ed4acf8849ac514de76eb56223a0  packages/entity-storage/src/write-rules.ts
050672bde07f77d5a6c65863912c4bbf237b5da81133156c30434fe0f70a4351  packages/entity-storage/src/rules-helpers.ts
3e446d5073cb82a8d8030d434d1da14e2cff0f3ae67995875685724a50136400  packages/pg-client/src/storage-provider.ts
5cd01ced7a2bc04d8660fab557c2e40bd7c93a2af8ae85301e9cafd96ec4584b  packages/query-dsl/src/sql.ts
72e9a01066dee2b4a753da33ab9c02d148bb46817e530fbe079b0ffa28848fd6  packages/entity-react/src/use-entity.ts
3622093792b12ea4937b7db14925947521dc9901572f53711a71bcca048af1ec  packages/entity-storage/src/write-rules.ownership.test.ts
f655057494219f50f2452728bcb916eff19beddbb64e9496b29d7d0c7fbfe412  packages/pg-client/src/storage-provider.integration.test.ts
```

Throwaway smoke digests: live-smoke 2780571d1b32395685a8a858157bd4ffc115c87f140f01fa910939d50a48a7de; ownership-smoke 742324390a9835c5f9008a170b40c4eaf8d83c72e8107e7c706dc3e69d3d35f0. Permanent behavioral equivalents remain in the package suites; throwaway scripts and task infrastructure are removed after verification.

## Full-suite infrastructure and scope boundary

Prerequisites were isolated without editing application source, replacing the configured real adapters with mocks, increasing timeouts, or deleting failing tests: PostgreSQL16 for provider tests, pgvector/pgvector:pg17 for the reference app, Redis7, native Ollama0.31.1 with task-owned nomic-embed-text:latest (768 dimensions, 274302450 bytes, model digest 0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f). The user daemon model inventory was not modified; the temporary model store is separate.

Canonical 001/002 up SQL files initialized only the disposable reference database using psql ON_ERROR_STOP and one transaction. The existing migrate:up CLI itself fails strict compilation before SQL, with its HEAD/working-tree source identical; EVID-094 and KNOWN-ISSUES.md record that separate unmodified limitation and next remediation trigger. Root tests/build/typecheck are not claimed to prove that CLI works. Full reference-app tests passed against the actual migrated schema and real model.

## Final disposition and cleanup

Scoped source/release Sol follow-up is PASS, including the explicit merge-default and overwrite-opt-in disclosure. EVID-095 separately records the inherited activation BLOCKER; PRD-072/RFC-028 remain draft, without forced activation or removal of legitimate graph links.

All three task Docker containers were stopped (auto-remove enabled), the task-owned Ollama model was unloaded and its separate native server stopped, and the temporary model store, two smoke scripts and lockfile backup were removed. User model inventory and unrelated containers/configuration were not modified. Source/test pins and permanent regression equivalents remain recorded above.


