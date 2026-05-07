# Known Issues — v0.1.0

This file tracks issues we are aware of in the initial release. None block
build, install, or runtime use of the documented public API. They are
documented here for transparency and to be addressed in v0.1.x patch releases.

## 1. `@gertsai/core` — `identity-resolver` not exported

**Status:** intentional, pending v0.1.x

The file `packages/core/src/connectors/identity-resolver.ts` is referenced by
`connectors/index.ts` but was never tracked by git in the upstream
`gertsai_codex` monorepo (a global `connectors/` pattern in `.gitignore`
excluded it). The export is currently commented out:

```ts
// packages/core/src/connectors/index.ts
// export * from './identity-resolver';
```

`acl` and `enums` exports from the same module are unaffected.

## 2. Skipped tests in `@gertsai/core`

Three tests in `tenant-config-chunking.test.ts` reference RFC-105 fields
(`chunkStrategy`, `chunkSizeUnit`, `enableContextualRag`, `chunksToProcess`)
that were renamed in source (`chunkingStrategy`, `chunkSize`). The describe
block is currently `describe.skip(...)`. Pre-existing in upstream; not an
extraction artifact.

DB integration tests in `core/src/deny-ledger/__tests__/` (postgres, redis,
hybrid) are skipped by default — they require a running database and are
intended to run only in CI environments with Docker fixtures.

## 3. Pre-existing TypeScript diagnostics in test files

`packages/api-core/src/__test__/response-wrapper.test.ts` has variance-related
type warnings (`OrchestraApiResponse<ResponseCode.SUCCESS>` not assignable to
`OrchestraApiResponse<ResponseCode>`). These do not affect test execution
(vitest uses vite/swc transpilation, not strict tsc), and the production code
(`src/lib/`) builds cleanly. The test suite itself passes 370/370.

The test in `tenant-config-chunking.test.ts` has type errors against the
renamed fields (see above). Block is skipped, so it does not run; warnings
are visible to TS-aware editors but do not affect CI.

## 4. References to non-extracted `@gertsai/*` packages

Some source files dynamically `import('@gertsai/database')` inside skipped
DB-integration tests, or include CLI suggestions referencing packages not yet
extracted. All such references are guarded:

- Dynamic imports are inside `describe.skip(...)` blocks with
  `@ts-expect-error` directives.
- No static imports remain (verified by audit).

These will resolve when their target packages are published in a subsequent
extraction wave.

## 5. `@gertsai/api-rlr` — PostgreSQL integration tests force-skipped

**Status:** intentional, deferred (per ADR-011)

`PostgreSQLAdapter.test.ts` contains an integration `describe.skip(...)` block
that originally relied on the upstream Hub's `@gerts/database` helpers
(`getDatabase()` / `initializeDatabase()` / `disconnectDatabase()`) — Prisma
client wired against the Hub's specific schema. That helper package is **not**
part of the OSS first-wave extraction (per ADR-009), and `@gertsai/api-rlr` is
explicitly database-agnostic (per ADR-011 invariants I-1, I-2): it depends only
on the local `PgClient` interface (3 methods), not on any specific ORM or
schema package.

Behaviour validation для PostgreSQL path is preserved via:

- **Algorithmic unit tests** (`PostgreSQLAdapter.test.ts (unit)`, ~25 tests с
  mock `PgClient` instances) — these run by default and pass green.
- **Redis integration tests** (`HAS_REDIS=1 pnpm test:redis`) — same algorithms
  on the Redis adapter path provide cross-adapter algorithmic coverage.

To re-enable PostgreSQL integration locally, instantiate any
`PgClient`-compatible client (Prisma, Drizzle, raw `pg`, or wrapper) и pass
it via `new PostgreSQLAdapter({ prisma })`. Schema setup is not bundled
with the OSS package — consumers manage their own migrations.

## 6. `@gertsai/api-rlr` — Redis-required tests skipped by default

**Status:** intentional

Eight test files require a running Redis instance and are `describe.skipIf(!HAS_REDIS)`:

- `__tests__/lua-sliding.test.ts`, `__tests__/lua-sliding.edge.test.ts`,
  `__tests__/lua-sliding.behaviour.test.ts`
- `__tests__/lua-gcra.test.ts`, `__tests__/lua-gcra.edge.test.ts`,
  `__tests__/lua-gcra.behaviour.test.ts`
- `__tests__/middleware.integration.test.ts`,
  `__tests__/comprehensive-integration.test.ts` (16 tests)

Run locally with `HAS_REDIS=1 pnpm --filter @gertsai/api-rlr test:redis`. CI
will get a separate Redis-enabled job in v0.1.x once docker-compose fixtures
are wired (планируется отдельный workflow).

Without Redis: 289 tests pass, 48 skipped (35 test files: 27 passed, 8 skipped).

## 7. Peer-dependency warnings on install

```
packages/core
└─┬ @ryoppippi/unplugin-typia 2.6.5
  └── ✕ unmet peer typescript@">=4.8.0 <5.9.0": found 5.9.3

packages/m9s-cache
└─┬ moleculer 0.14.35
  └── ✕ unmet peer redlock@^4.0.0: found 5.0.0-beta.2
```

Both are warnings only. Build and tests pass.

**TypeScript pin (Sprint 3.0.1, F-7):** TypeScript is intentionally pinned to
the exact version `5.9.3` workspace-wide via the root `package.json` (single
source of truth — individual `packages/*/package.json` no longer declare a
`typescript` devDependency). The `@ryoppippi/unplugin-typia 2.6.5` peer range
(`>=4.8.0 <5.9.0`) is therefore knowingly violated. Tracked: Sprint 3.x will
either bump `@ryoppippi/unplugin-typia` to a release that widens the peer
constraint, or pin workspace TS to a 5.8.x line if upstream typia is slow to
update. The full test suite passes green on 5.9.3, so the warning is
informational only.

The `redlock` warning is unchanged: `moleculer 0.14.35` declares
`redlock@^4.0.0` as a peer, but `redlock@5.0.0-beta.2` is the only ESM-native
release and is what `@gertsai/m9s-cache` is wired against. Will be addressed
in v0.1.x once moleculer ships a compatible peer range.

## 8. Subpath imports require `moduleResolution: "node16"` or higher

`@gertsai/core` (`/rag`, `/llm`) and `@gertsai/api-core` (`/contracts`,
`/moleculer`, `/runtime/node`) are exposed via `package.json#exports` subpath
keys. To resolve their types, downstream TypeScript consumers must use
`moduleResolution: "node16"`, `"nodenext"`, or `"bundler"`.

For consumers stuck on `moduleResolution: "node"` (TS pre-4.7 or Node10
profile), Sprint 3.0.1 added `typesVersions` fallback maps to both packages
(see `packages/{core,api-core}/package.json`). The fallback maps each subpath
to its `dist/<subpath>/index.d.ts` file, providing best-effort Node10
resolution. Cases not covered by the fallback (e.g. unusual TS resolver
configurations) should upgrade to `node16`+; documented in
`audit-pre-sprint-3-2` (production-validator F-P-1, type-auditor F-T-4).

## 9. `@gertsai/api-core` — `oauth.class.ts` placeholder console.log calls

`packages/api-core/src/lib/oauth/oauth.class.ts:151..174` contains five
`console.log(...)` lines (`'Getting user'`, `'Revoking token'`, etc.) that
are placeholder bodies of `OAuth2Server`-style provider methods. These are
extraction artifacts — they were stub bodies in the upstream code and were
not replaced during the Wave 2 extraction.

Real consumers wiring an OAuth provider will see noisy logs in production.
Workaround: pass a custom provider implementation via `setAuthProvider(...)`
that overrides these stubs. Permanent fix planned for the @gertsai/auth-*
extraction (Sprint 3.x or Wave 3).

## 10. `BaseEntityStorageService.upsert` performs 2 RTTs vs 1

**Status:** acceptable; tracked for Wave 6+

`upsert(...)` consolidated from m9s-example DocumentRepository (Sprint 3.6
W-3-6-24) issues `provider.get(...)` followed by either `provider.set(...)`
or `provider.update(...)` — two round-trips. For the in-memory provider
this is negligible. For a future Postgres adapter (or any networked
backend) the latency cost is non-trivial; a single-RTT `upsert` (e.g.
`INSERT ... ON CONFLICT DO UPDATE`) requires a new method on
`IStorageProvider` and per-adapter implementation. Tracked for Wave 6+;
not a blocker because `set` / `update` paths remain available when the
caller already knows existence.

## 11. Sprint 3.6 P2 polish backlog (non-blocking)

**Status:** deferred to Sprint 3.6.1 / 3.7 maintenance pass

Post-Build fidelity audit (Phase C, 3 reviewers) raised 9 P2 polish items
across the 3 new/extended packages. None are blockers; bundled here so the
cleanup is discoverable when working in those modules:

**`@gertsai/errors`** (errors-fidelity):
- `wrapUnknownError(x, kind?, correlationId?)` declares `kind?` parameter
  but ignores it (`_kind?` placeholder). Either remove from signature or
  honour the override.
- `AppError` constructor `Object.freeze({ ...details })` is shallow-only;
  nested objects are not frozen. Either deep-freeze or document explicitly
  in JSDoc.
- `redactDetails()` is shallow-scan — nested objects with `password`/etc.
  inside are not redacted. Add adversarial test fixture documenting the
  contract; consider deep-scan if needed.
- `errors/internal.ts` uses `<Record<string, unknown>>` catch-all where
  spec example showed `{ trace?: string }`. Tighten generic if useful.
- README cross-references use relative paths to `.forgeplan/...` which will
  break post-npm-publish. Switch to absolute repo URL or mark "repo-only".

**`@gertsai/tenant-resolver`** (tenant-resolver-fidelity):
- `MOLECULER_INSTALL_HINT` error string in `moleculer/index.ts` is
  misleading — fires on "non-Moleculer Context shape", not on missing peer
  install. Rename or split.
- PathStrategy `...` wildcard semantics: only valid as trailing token, but
  README does not flag the placement constraint; add JSDoc note.
- `lookupHeader()` exact-case-first short-circuit precedence undocumented;
  harden with JSDoc to prevent future regression.

**`@gertsai/session`** (session-scoping-fidelity):
- `__tests__/scoping.test.ts:13-17` carries a 5-line stub comment that
  references the deleted Phase B fallback. Compress to one line.
- `Session.ts:19-22` post-swap history comment is verbose; can be reduced.

## 12. Resolved in Sprint 3.11 — m9s-example mock-vs-real

**Status:** RESOLVED (Sprint 3.11, ADR-011 + SPEC-016 + EVID-019)

The following m9s-example "mock by default" issues — surfaced across earlier
sprints as gaps between the example and a credible production reference —
are closed by Sprint 3.11. The example now defaults to real infrastructure
(Postgres+pgvector, OpenFGA ReBAC, BullMQ+Redis async, Ollama embeddings,
docker-compose orchestration) per ADR-011. Mock fallbacks are preserved
opt-in via env override (per ADR-011 I-1), so prior mock-mode test
fixtures continue to pass unchanged.

- **`InMemoryStorageProvider` + `MemoryDocumentRepository` as default**
  (was: per-process `Map`, no persistence, no cross-process visibility)
  → resolved: `STORAGE_PROVIDER=postgres` is the default; the document store
  is `PgDocumentStore implements IDocumentStore` backed by `@gertsai/pg-client`
  via the new `pg-client.adapter.ts` thin wrapper around `pg@^8.13`. Mock
  mode preserved via `STORAGE_PROVIDER=memory`. (W-3-11-4..7)
- **`MemoryVectorStore` as default vector backend**
  (was: ad-hoc cosine-similarity over an in-memory `Array<{vector, ...}>`)
  → resolved: `PgVectorStore implements IChunkStore` backed by pgvector with
  an HNSW index on `chunks.vector vector_cosine_ops`. Every chunks SQL
  includes `WHERE tenant_id = $1` per ADR-011 I-13 (defence-in-depth tenant
  isolation). (W-3-11-1, W-3-11-5)
- **`AllowAllPermissionGate` as default authorization gate**
  (was: every `check()` returned `true`; no real ReBAC; no production guard)
  → resolved: `AUTH_GATE=openfga` is the default; the existing
  `openfga-permission.gate.ts` was MODIFIED (E+ marker per Amendment 2
  §A2.13) to use canonical `FgaResourceType` + `FGA_RELATIONS` from
  `@gertsai/auth-openfga`, with a B2 Tenant-hierarchy authorization model
  and per-document tuples written at ingest time. AllowAll gate now refuses
  construction when `NODE_ENV='production'` per I-12. (W-3-11-9..15)
- **Synchronous-only ingest fallback**
  (was: `if (config.REDIS_URL)` gated; default unset → in-process
  synchronous chunk processing; no observable async semantics)
  → resolved: `REDIS_URL=redis://localhost:6379` is the default in
  `.env.example`; BullMQ async ingest is on by default with explicit
  eventual consistency contract test (Amendment 2 §A2.9 — `mode='queued'`
  immediately, polling search returns `[]` until worker completes).
  Inline fallback preserved when `REDIS_URL` is unset. (W-3-11-16..19)
- **No production-grade onboarding path for new contributors**
  (was: README documented mock mode + Ollama opt-in; no docker-compose for
  the full stack; no migration tooling)
  → resolved: single-command `docker compose up -d` brings up 5 services
  (NATS, Redis, Postgres+pgvector, OpenFGA, Ollama) with healthcheck-gated
  startup; raw-SQL migration runner with advisory lock + idempotency
  guarantee (per ADR-011 §Decision E LOCKED E1 + I-15); README §Production
  Setup self-contained ≤ 5 min onboarding (per NFR-2, EVID-019). (W-3-11-24..33)

The `@gertsai/api-rlr` mock `PgClient` instances cited in §5 above are
**unrelated** — those are unit-test scaffolding that mocks the 3-method
PgClient interface to verify the rate-limiter algorithms without a live
DB. They remain by design (per ADR-011 I-2 of `api-rlr` — database
agnostic; integration coverage via Redis adapter path).

The `BaseEntityStorageService.upsert` 2-RTT issue cited in §10 is
**also unrelated** to Sprint 3.11 — it tracks a future single-RTT
optimisation on the `IStorageProvider` contract (Wave 6+). m9s-example
uses `PgClient` directly via `pg-document.repository.ts` per Amendment 2
§A2.5, NOT `PgStorageProvider`, so the upsert path is independent.

### Open follow-ups from Sprint 3.11 Post-Build review (deferred to Wave 6+)

- ~~**§FGA_API_TOKEN-plumbing**~~ **RESOLVED in Wave 6.2** (PRD-005 +
  RFC-003 + EVID-020). `@gertsai/auth-openfga.FgaClientConfig` gained an
  optional `apiToken: string` field; when set, `GertsFgaClient` plumbs it
  to every internal `new OpenFgaClient(...)` as
  `credentials: { method: ApiToken, config: { token } }`. The Sprint 3.11
  §P1-1 throw-on-apiToken defensive guard in
  `OpenFgaPermissionGate` has been removed — tokens now reach the SDK
  end-to-end. m9s-example composition forwards `FGA_API_TOKEN` env var.
  Verified by 4-test unit suite mocking the SDK constructor and a 4-test
  gate-acceptance suite. OAuth2 `clientCredentials` remains future work
  (separate ADR if needed).
- ~~**§OpenFGA-model-drift-CI**~~ **RESOLVED in Wave 6** (PR/commit
  `chore/wave6-openfga-model-drift-ci`). Added `@openfga/syntax-transformer`
  as a devDependency in `examples/m9s-example` and a CI test
  (`tests/openfga-model.test.ts`) that parses `openfga/model.fga` and
  asserts deep-equal with the inline `AUTHORIZATION_MODEL` constant in
  `scripts/openfga-bootstrap.ts`. The transformer is dev-only — bootstrap
  runtime stays parser-free so a future ANTLR-parser regression cannot
  break production rollout. The DSL is canonical to humans; the inline
  JSON is canonical to OpenFGA at write time; the test enforces
  equivalence. Drift now fails CI on every PR.
- ~~**§FGA-singleton-multi-store**~~ **RESOLVED in Wave 6.3** (PRD-006 +
  ADR-012 + RFC-004 + SPEC-017 + EVID-021). The process-wide
  singleton was replaced with `Map<fingerprint, GertsFgaClient>` keyed
  by SHA-256 hex digest of canonical-JSON of distinguishing config
  fields (`apiUrl`, `apiToken`, `authorizationModelId`, `storeId`).
  Same pattern applied to `getPermissionCache(scope?)`. New
  `createFgaClient()` factory provides explicit non-cached escape
  hatch. `checkPermission(req, { client?, cacheScope? })` accepts
  per-tenant client + scope. m9s-example `OpenFgaPermissionGate`
  auto-derives a per-instance fingerprint cache scope (memoised on
  first `can()` call). Token confidentiality enforced — never
  plaintext in any Map key. Backwards-compat absolute: every
  pre-Wave-6.3 call shape behaves identically when only one config
  is in play. 86/86 auth-openfga tests pass (+22 from baseline 64),
  42/42 m9s mock + 16/16 m9s real-infra. Pre-Build audit (security +
  arch + types) returned 1 P0 (literal type) + 5 P1, all fixed
  inline before activation.
