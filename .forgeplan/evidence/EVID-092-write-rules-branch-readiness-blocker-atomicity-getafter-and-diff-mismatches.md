---
depth: standard
id: EVID-092
kind: evidence
last_modified_at: 2026-10-30T22:02:55.337625+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: SPEC-008
  relation: informs
status: deprecated
title: 'Write-rules branch readiness BLOCKER: atomicity, getAfter and diff mismatches'
---

---
assigned_number: 92
created: 2026-10-30
predicted_number: 92
slug: evid-write-rules-branch-readiness-blocker-atomicity-getafter-and-diff-mismatches
updated: 2026-10-30
---

# Write-rules branch readiness

## Structured Fields

verdict: refutes
congruence_level: 3
evidence_type: audit

## Scope and verdict

Audit verdict: BLOCKER for merging branch feat/write-rules-getafter-claims. Reviewed origin/main...2f0327f2eb208cd024b68249d35bce992f139096 (17 files, +1850/-168). Evidence concerns this unmerged branch, not a claim about the contents of origin/main or a published release. Recorded 2026-10-30. Relevant requirement context: SPEC-008 storage provider interchangeability, batches/transactions, lifecycle semantics. Reviewer: openai-codex/gpt-6.1-sol. All code/test/smoke scripts written by openai-codex/gpt-6-luna. Parent session executed verification.

## Observed runtime failures

A Luna-authored throwaway Node script imported the freshly built entity-storage, storage-core and session ESM entrypoints. It used isolated in-memory providers and no network/database. Seven JSON observations, no harness errors. Source was not overwritten. These five distinct reviewer findings were confirmed:

1. **P1 atomicity** — packages/entity-storage/src/InMemoryStorageProvider.ts:490-505. Seed b with update_version=1; queue set(a) then set(b, expectedVersion=999). Both runBatch and runTransaction reject with VersionConflictError (expected999, actual1), but a remains persisted. The operation therefore partially commits. Deferred repair: stage/apply all deltas before publishing live collections.
2. **P1 getAfter lifecycle** — packages/entity-storage/src/write-rules.ts:672-685. assertPendingWrites over delete(row), restore(row) reports no document to the restore rule (undefined serialized as null). Actual service delete/restore leaves row status=created, deleted_* null and update_version=3. Deferred repair: fold real soft-delete/restore payloads; only destroy removes a document.
3. **P1 dotted-key diff mismatch** — packages/entity-storage/src/write-rules.ts:325-333. Stored settings.theme nested value is dark. Patch with literal key settings.theme and same value yields affectedKeys=[], but provider update adds a new literal settings.theme property and advances update_version. Thus empty affectedKeys does not imply no persisted data change, undermining allowlists. Deferred repair: align diff/application semantics or reject dotted patches until supported consistently.
4. **P2 scalar roles** — packages/entity-storage/src/rules-helpers.ts:144-145. A matching observers[user].roles[member|owner].sources[source-id]=true returns false with scalar role/source arguments and true with singleton arrays. Deferred repair: normalize scalar arguments to singleton arrays.
5. **P2 transaction-local merge read** — packages/entity-storage/src/InMemoryStorageProvider.ts:637-646. Seed {name:A, age:40, update_version:1}; blind tx.set({name:B}), then tx.get returns only name B and uid, with age absent. After commit age40 is preserved and update_version=2. Deferred repair: load committed local state before the first merge-set.

## Static review findings not runtime-reproduced

The following remain reviewer inferences from source, explicitly not live PostgreSQL/concurrency proof:

6. **P1 PostgreSQL CAS version advancement** — packages/pg-client/src/storage-provider.ts:139-168. SQL builders enforce expectedVersion in WHERE but never atomically increment stored update_version. Two successful writes with the same expected version can therefore pass; merge preserves the old version and overwrite may remove it. Deferred repair: derive the next version atomically from stored data and override incoming version fields. Existing PostgreSQL unit tests mostly inspect SQL/canned row counts, not real persisted state.
7. **P2 stable single-write reads** — packages/entity-storage/src/BaseEntityStorageService.ts:979-1000. ctx.get/getAfter reread live state on each call, contrary to the stable-read contract; target data may disagree with ctx.resource and lifecycle timestamps are regenerated. Deferred repair: per-evaluation memoized read promises, seeded target resource and one lifecycle payload.
8. **P2 routed write evaluation** — packages/entity-storage/src/BaseEntityStorageService.ts:390-435. Service update routed to batch/transaction evaluates rules immediately against a single-write getAfter image before the audited deferred gate; sibling queued writes are absent. Deferred repair: evaluate routed writes at the audited deferred gate.

## Verification performed

- First affected test run exposed three obsolete fourth string arguments to provider.set in write-rules.service.test.ts:688,693,745. Luna removed only the redundant fourth arguments. Final entity-storage result: 11 files, 198 tests passed, no type errors. This repairs test callsites, not any of the eight semantic findings.
- pg-client: 45 tests passed. storage-core:48; query-dsl:64; session:32; runtime-context:86. These passing suites do not disprove the independent runtime failures above.
- Build of 15 affected/transitive packages passed (ESM/CJS/declarations). Seven affected package typechecks passed.
- publint --strict and attw --pack . --ignore-rules cjs-resolves-to-esm passed for entity-react, entity-storage, pg-client, storage-core, query-dsl.
- Root CI lint command pnpm run lint passed. Per-package lint commands fail because root ESLint does not configure package TypeScript files (eslint.config.mjs:66-68,113-121); no package-source lint pass is claimed.
- Frozen install with --ignore-scripts passed after dev-only React test dependencies were added. Only the entity-react importer changed versus the pre-install lockfile snapshot; no importer was removed.

## Release and PR gaps

- gh pr view reports no PR for this branch.
- pnpm exec changeset status --since origin/main fails: changed packages have no new committed changesets. Existing optimistic-concurrency/write-rules-hardening/rfc-024-shared-tier entries are not new branch release records. Add a scoped changeset and account for changed default set merge semantics before PR. The new uncommitted React patch changeset is a separate fix, not coverage for these feature commits.
- compileToSql accepts qualified table names, but PgStorageProvider still rejects schema.table at its own validator; do not claim end-to-end qualified-table support. Reviewer classified that adapter gap as existing, not a new branch regression.

## Scope boundaries and next trigger

Current authorized work was finishing the preexisting React snapshot fix (EVID-091) and assessing write-rules readiness. The eight semantic repairs and branch release record are tracked as deferred work, not silently implemented. Trigger: start the write-rules remediation batch before merge; use Luna for code/tests, Sol6.1 for independent review, retain concrete regressions for confirmed failures, and rerun relevant gates. Do not merge/publish while P1 findings remain. No commit, push, PR creation, merge or publication was performed. No full-workspace CI or real PostgreSQL integration run is claimed.

## Current applicability

This is the historical failing audit of the earlier source revision. Its refutes verdict and observations remain unchanged. All eight scoped findings are repaired and independently verified in the new source pin recorded by EVID-093; this record is retired as the current readiness signal, not erased or rewritten into a passing run. EVID-094 separately tracks the still-open, unchanged example migration CLI limitation.


## Deprecation

Reason: Historical earlier-revision readiness audit retained intact; all eight findings repaired and independently reverified in the EVID-093 source pin. Not current evidence of the corrected working tree; no observation or refutes verdict removed.
Date: 2026-10-30
