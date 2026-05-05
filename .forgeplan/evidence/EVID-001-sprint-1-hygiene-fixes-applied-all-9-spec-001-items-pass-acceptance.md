---
depth: standard
id: EVID-001
kind: evidence
last_modified_at: 2026-05-05T07:57:44.432085+00:00
last_modified_by: claude-code/2.1.128
links:
- target: SPEC-001
  relation: informs
- target: PRD-001
  relation: informs
status: draft
title: Sprint 1 hygiene fixes applied — all 9 SPEC-001 items pass acceptance
---

---
id: EVID-001
title: "Sprint 1 hygiene fixes applied — all 9 SPEC-001 items pass acceptance"
status: draft
created: 2026-05-05
updated: 2026-05-05
---

# EVID-001: Sprint 1 hygiene fixes applied — all 9 SPEC-001 items pass

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 1 implementation per SPEC-001 завершён через AgentTeams pattern (3 conflict-free workers + team-lead verify + commit). Все 9 hygiene items applied, full repo verified green, committed atomically.

**Commit**: `1f8494e — chore: sprint 1 hygiene fixes (SPEC-001)` на `main` branch (НЕ запушен — per CLAUDE.md красная линия требует explicit user push).

## Acceptance evidence (per SPEC-001 §H-1..H-9)

### H-1 — api-core packaging metadata
- ✅ `cat packages/api-core/package.json | jq '.private,.license'` → `false`, `"Apache-2.0"`
- ✅ Добавлен `publishConfig.access: "public"`
- ✅ LICENSE symlink на root Apache 2.0 (existed)

### H-2 — dotenv side-effect removed
- ✅ `grep -r "dotenv/config" packages/api-core/src/` → 0 results
- ✅ Tests not affected (vitest.setup.ts только typia mock)

### H-3 — GCP Logger lazy
- ✅ `grep -rn "new LoggingBunyan" packages/api-core/src/moleculer/` → only inside factory
- ✅ Verified: `node -e "require('./dist/src/moleculer/moleculerConfig.template')"` → REQUIRE_OK без MetadataLookupWarning к 169.254.169.254
- ✅ Lazy singleton + exported `createGcpLoggerStream()` factory; instantiated only when `config.LOGGER_GOOGLE` truthy

### H-4 — PubSub peer dep
- ✅ `cat packages/api-core/package.json | jq '.peerDependencies."@google-cloud/pubsub"'` → `"^4.0.0"`
- ✅ `cat packages/api-core/package.json | jq '.peerDependenciesMeta."@google-cloud/pubsub".optional'` → `true`
- ✅ Сохранён в devDependencies для local dev

### H-5 — api-rlr ioredis peer
- ✅ `cat packages/api-rlr/package.json | jq '.peerDependencies.ioredis'` → `"^5.7.0"`
- ✅ Дублирован в devDependencies

### H-6 — api-rlr moleculer-web peer
- ✅ `cat packages/api-rlr/package.json | jq '.peerDependencies."moleculer-web"'` → `"^0.10.8"`
- ✅ Дублирован в devDependencies

### H-7 — m9s-example unused deps
- ✅ `@gertsai/collection` и `@gertsai/utils` удалены из dependencies
- ✅ `grep -r "@gertsai/collection\|@gertsai/utils" examples/m9s-example/src/` → 0 results

### H-8 — PermissionDeniedError shared
- ✅ Создан `examples/m9s-example/src/application/errors/permission-denied.error.ts` (shape preserved: `userId, action, resource`)
- ✅ Обновлены 5 импортеров: `IngestDocumentUseCase.ts`, `SearchDocumentsUseCase.ts`, `services/ingest/src/actions/ingest-document.action.ts`, `services/ingest/src/queues/ingest-chunk.worker.ts`, `services/search/src/actions/search-query.action.ts` + 2 теста
- ✅ Определение существует ровно в 1 месте

### H-9 — CLAUDE.md package count
- ✅ `grep -n "13 пакет\|13 packages\|13-package" CLAUDE.md` → 0 results
- ✅ Tier 5 строка для `@gertsai/api-rlr` (deps: api-core, dual ESM+CJS) добавлена в таблицу пакетов
- ✅ Cross-link на ADR-011 добавлен в "Справочник"

## Full-repo verification

| Step | Command | Result |
|------|---------|--------|
| Install | `pnpm install` | ✅ Done in 4.7s; pre-existing peer warnings (KNOWN-ISSUES §7), no new warnings от Sprint 1 changes |
| Build | `pnpm build` | ✅ All 14 packages + m9s-example green |
| Test | `pnpm test` | ✅ 3488 passed / 103 skipped (api-core 370/370, api-rlr 289/337 без HAS_REDIS, m9s-example 12/13) |
| Typecheck | `pnpm typecheck` | ✅ All projects green |
| Publint | `pnpm dlx publint --strict` | ✅ api-core, core, auth-openfga clean (only "type" suggestion); api-rlr 1 pre-existing ERROR (`__esModule + default` dual-package hazard в exports — НЕ от Sprint 1, решит Sprint 2 ADR-003 decomposition) |

## Commit metadata

- Commit: `1f8494e` on `main` branch
- Files changed: 16 (14 modified + 2 new: `errors/permission-denied.error.ts` + `.changeset/sprint-1-hygiene.md`)
- Lines: +108 / -50
- НЕ запушен (per CLAUDE.md красная линия — требует explicit user `git push`)
- НЕ опубликован (per CLAUDE.md красная линия — требует explicit `pnpm changeset publish`)

## Discrepancies / known limitations

- `examples/m9s-example/README.md:253` всё ещё упоминает "MIT — see LICENSE" (flagged by api-core-worker, не входит в SPEC-001 scope).
- api-rlr publint ERROR (`__esModule + default`) — pre-existing dual-package hazard, не от Sprint 1. Решится Sprint 2 декомпозицией.
- Pre-existing peer warnings: typia → typescript range, moleculer → redlock — известны per `KNOWN-ISSUES.md §7`.

## Verdict rationale

`supports` PRD-001/ADR-003/SPEC-001:
- All MUST acceptance criteria met (9/9).
- No regressions introduced (test count maintained: 3488 ≥ 3187 baseline).
- Release-blocker (private:true) resolved — Wave 1 v0.1.0 теперь technically publishable.
- Foundation для Sprint 2 (ADR-003 decomposition Phase A) подготовлена.

`congruence_level: 3` (CL3 — same-context evidence): измерения сделаны на real repository, real tests, real publint. Не synthetic.

`evidence_type: measurement`: концептуально не audit и не benchmark — фактический результат implementation, проверенный через CLI tools (jq, grep, pnpm, publint).

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-001 (Sprint 1 hygiene checklist) | Spec | informs (this evidence supports SPEC-001) |
| PRD-001 (Wave 2 — Clean Library Platform) | PRD | informs (Sprint 1 is first phase of PRD-001) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (Sprint 1 — preрequisite для ADR-003 Sprint 2) |
| Commit `1f8494e` | git commit | implementation |
| docs/dd.md | external doc | source of all 9 H-items |



