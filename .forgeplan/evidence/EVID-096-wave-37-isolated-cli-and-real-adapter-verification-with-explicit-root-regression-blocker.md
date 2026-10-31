---
depth: standard
id: EVID-096
kind: evidence
last_modified_at: 2026-10-31T10:00:08.913042+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-071
  relation: informs
- target: ADR-016
  relation: informs
status: active
title: Wave 37 isolated CLI and real adapter verification with explicit root regression blocker
---

---
assigned_number: 96
created: 2026-10-31
predicted_number: 96
slug: evid-wave-37-isolated-cli-and-real-adapter-verification-with-explicit-root
updated: 2026-10-31
---

# Wave 37 runtime verification

## Structured Fields
verdict: supports
congruence_level: 3
evidence_type: test

## Scope and limits
Supports repaired CLI and observed Wave37 adapter behavior, NOT overall activation readiness. EVID-094 is the historical strict compilation failure baseline, not a prerequisite. No package sources changed for this task. Root regression remains FAIL at auth-openfga constants.test.ts:51 (hardcoded localhost:8080 assertion conflicts with mandatory isolated OPENFGA_API_URL). No failing pack retired and no activation authorized.

## Commands and results
- pnpm build: exit0.
- pnpm --filter @gertsai-examples/m9s-example run typecheck: exit0, strict CLI and compile-only brands included.
- pnpm typecheck: exit0 across workspace.
- Both rounds: pnpm --filter @gertsai-examples/m9s-example run migrate:up; run migrate:status; exec tsx scripts/openfga-bootstrap.ts; run test:real-infra: exit0. R1 up ran before other setup.
- Per round live files: Ollama3, BullMQ3, OpenFGA5, PG5, migration CLI11 =27 passed,0 failed,0 skipped. CLI tests create unique databases, subprocess strict ts-node paths and test-owned dotenv fixtures.
- Negative full-mode PG test with empty POSTGRES_URL: exit1 required configuration error, not skipped green.
- Unit contracts: brand2 + costs5 + OpenFGA gate4 =11 passed. Costs use HTTP test doubles, not live OpenAI.
- node /tmp/wave37-nats-smoke.cjs: exit0 both rounds. Dist/CJS app and separate service-free caller route ingest/search via actual NATS with explicit app nodeID and JSON testSession. Test-only seam proof, not production JWT/session proof or combined real adapters.
- pnpm test: exit1 at auth-openfga default URL assertion. Supplemental pnpm -r --no-bail run test: exit1,43 workspace passes/1 failure.
- pnpm --filter @gertsai/pg-client test:31 passed, including11 actual storage-provider.integration.test.ts cases,0 skipped. Supplemental root no-bail also executes full remaining workspaces.

## Isolation
Docker Desktop existing daemon29.9.2; pgvector:pg17,redis7,nats2.10,openfga1.5 on unique127.0.0.1 ephemeral ports. R1 PG7cebc0e9bd30:62928 Redis ec29facd4f39:63038 NATS09d74284a7d0:63051 FGA7698607eaa24:63136. R2 PGfb8dc248f3f0:51120 Redis404c66248c8e:51123 NATSab4655fdb91e:51126 FGA20eb63830685:51127. Native Ollama0.31.1 isolated processes63137 and51130, task model directory; nomic-embed-text digest0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f. Both actual embedding responses768 finite numbers. Separate PG_TEST_URL DB wave37_storage_regression on R2; Node pg driver confirmed same server172.17.0.6:5432 and distinct current_database() values m9s and wave37_storage_regression. Every verification child strips inherited DOTENV_* and sets absolute empty task dotenv path plus utf8; both OpenFGA aliases point to task endpoint.

## Source pin
HEAD2f0327f2eb208cd024b68249d35bce992f139096, dirty user work retained.
```text
4ce188565c0d38ca2322250d4cf21cd4523b71209ff9a4ccc1c3ff4c63dcf0b6  examples/m9s-example/scripts/migrate.ts
c367e5980160de19e71de9e93d113ea9b240d1addc56e25780cbaea12c2dd03e  examples/m9s-example/package.json
fced787397072f23016ed473a5b61c81badb12741d11420f8123a062971b31c1  examples/m9s-example/tsconfig.checks.json
a9684656f8d3b7aa26d5e8f6fcd602416d59f53523a9fa1a0a6cc1484832b7e6  examples/m9s-example/tests/real-infra.test.ts
4ee79bbf8c9e102774c0791a0552388f0dfb1aec2482cc14b9c6be96f1740913  examples/m9s-example/tests/real-infra/bullmq.test.ts
11b4862f4e7e4fdc5c966edd23d8315ad11c18e5aa3ba1e99a8628b24d7bb500  examples/m9s-example/tests/real-infra/openfga.test.ts
0ea7293e9bc1da75fa65ba4ffc204fe66b9c8ea725ed4eaa76ea74d7f5283374  examples/m9s-example/tests/real-infra/pg-vector.test.ts
08b74e5737965f59f0eb43ef3888291ad4e780ff2a535dbd63516e71ed927371  examples/m9s-example/tests/real-infra/migrate.test.ts
48d90a9ccd792631e7eb3fab8820b2df32049e6c22c9ead54735ba6e055464ee  examples/m9s-example/tests/wave37-tenant-brand.types.ts
70955c8c0e47a1be2fea003b678338ed99c92368fb213bac3f942e0faab662fd  examples/m9s-example/tests/wave37-tenant-brand.test.ts
9cfc46a30e43195b7ae084451c56ecc80282e2f28607e904a73b076df9a46dd2  examples/m9s-example/tests/wave37-cost-events.test.ts
72e9a01066dee2b4a753da33ab9c02d148bb46817e530fbe079b0ffa28848fd6  packages/entity-react/src/use-entity.ts
9987a23f99a89aca628e0978bc7600aa468b544e3c843592134ef8d6543ae507  packages/entity-storage/src/BaseEntityStorageService.ts
f93ac8fed362a6d517dff82fec1da6cb4aba78f8abe53ac9d37e4ad9d2253f06  packages/entity-storage/src/InMemoryStorageProvider.ts
18d988b7c6360049aa4b02bdcf9285a98ea0ed4acf8849ac514de76eb56223a0  packages/entity-storage/src/write-rules.ts
3e446d5073cb82a8d8030d434d1da14e2cff0f3ae67995875685724a50136400  packages/pg-client/src/storage-provider.ts
```

## Raw log provenance
/tmp/wave37-build.log | 58862 bytes | SHA256 c2c19cd4df196127d69e4fd5e54abae4aec3235796d11e83f952e4fc0d5b4082
/tmp/wave37-typecheck.log | 169 bytes | SHA256 efaa10f879227e3ee9259d9a5ebc273ad67ac125aaae2f6e22fa40b4fb4ae587
/tmp/wave37-root-typecheck.log | 4137 bytes | SHA256 9ec02f47e0f2fbf26c0bce6def40aeb735451995e2d589ab19c19ab13f861077
/tmp/wave37-r1-live-final.log | 5806 bytes | SHA256 9a1a1d2aa2913cef997ad95c89990f867d7936dea51204c16a7d7274c71f7439
/tmp/wave37-r2-live.log | 5665 bytes | SHA256 261a3f63073ed6305622112ea1b2d014e642b27422cca03d6c81a7eb1acc07bd
/tmp/wave37-negative-gate.log | 798 bytes | SHA256 e6848744b38156eb151e29937e63a197ad0459d6f9d9b819887a02e2350f1e15
/tmp/wave37-cli-contract-final.log | 1612 bytes | SHA256 c8a75b3c6b21bbc17df17dca3a935f39474262a5339790908be87ff152cdfbf6
/tmp/wave37-unit-contracts.log | 425 bytes | SHA256 55848c6a47c1b3d277885a79746c3f6ea88edbe69baca7c52410da1a3aaaadfb
/tmp/wave37-r1-nats-final.log | 7342 bytes | SHA256 ffd38758a797724943709832e612e55a79cdd04e8a0e99eac8b573a7f2fa989e
/tmp/wave37-r2-nats-final.log | 7342 bytes | SHA256 130ed0b625d4cd27d147546fc7c88cca1465fe36660abb7abec0bf5b29cde920
/tmp/wave37-pg-regression.log | 513 bytes | SHA256 0562467b9f8ffff1f8b0114ea0f5c0d57cfbfffcba96a6a58fcd887f03d38801
/tmp/wave37-root-test.log | 44009 bytes | SHA256 12e1df4b7e5c5b8aef8c299ef4bce1c872dc2510e784d08474055c9fd07fe6b5
/tmp/wave37-root-no-bail.log | 85305 bytes | SHA256 3a8bb67611f86b15f236d140d2fa8588b0df19e0dbe2fa6b49235623c4d8dc01

## Disposition
Independent Sol review pending. Preserve EVID090/094/095 until explicit independent disposition. No commit/push/merge/publication.

## Additional reviewed production/config pins
```text
be1d16984b7022ced254a119d3bed78be717744ade3b2b0d4e614872b8b27004  examples/m9s-example/src/infrastructure/pg-document.repository.ts
202a59608f2886d678e5c92a648dbcc346507cb1e168d351789413f76fe42885  examples/m9s-example/src/infrastructure/pg-vector.store.ts
02d8e6fa64ce06d29b1d26fe7acde00507afc6f9abfb3fdee1866db41e653dee  examples/m9s-example/src/composition/infrastructure.ts
4b6284dbed0486382bfa1f6ba32969c4e8e4dc0bf20c20be973fc04ef6891f91  examples/m9s-example/src/composition/wave5-middlewares.ts
bc4b41b0a30b434316da8b378e0f29f7c22563be8e07fea78b1b81ef1b792526  examples/m9s-example/src/infrastructure/openai-embedder.ts
919b6d8b32aece9407fc9ccd23191ce94df102e0a47decf251ce8384b5081417  examples/m9s-example/src/infrastructure/ollama-embedder.ts
87db59d14ddf557a1323273d59176f8c30a0ac10f49d571f53987d48f699a48b  examples/m9s-example/tsconfig.json
6912ccb4650456ea4e278f1e728fee231ddfec5995fd5761de956fb323830c71  examples/m9s-example/vitest.config.ts
```

