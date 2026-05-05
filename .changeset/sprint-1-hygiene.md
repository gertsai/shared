---
"@gertsai/api-core": patch
"@gertsai/api-rlr": patch
---

Sprint 1 hygiene fixes (SPEC-001) — preрequisite для first npm publish v0.1.0.

**`@gertsai/api-core`**:

- **H-1**: `private: true → false`, `license: "MIT" → "Apache-2.0"`, добавлен `publishConfig.access: "public"` (release-blocker fix).
- **H-2**: убран `import 'dotenv/config'` side-effect из root `src/index.ts` — больше не загружает `.env` при импорте библиотеки.
- **H-3**: Google Cloud Logger переведён на lazy factory `createGcpLoggerStream()` — больше нет MetadataLookupWarning к `169.254.169.254` при импорте moleculer config.
- **H-4**: `@google-cloud/pubsub` перемещён в `peerDependencies` (`^4.0.0`, optional) — TypeScript consumers больше не получают unresolvable type reference на `PubSub`.

**`@gertsai/api-rlr`**:

- **H-5**: `ioredis` (`^5.7.0`) перемещён в `peerDependencies` — runtime import теперь корректно declared.
- **H-6**: `moleculer-web` (`^0.10.8`) перемещён в `peerDependencies` — аналогично H-5.

Все existing тесты остаются зелёными (api-core 370/370, api-rlr 289/337 — 48 Redis-required skipped).

Source: docs/dd.md audit (2026-05-05). Refs: PRD-001, ADR-003, SPEC-001 в `.forgeplan/`.
