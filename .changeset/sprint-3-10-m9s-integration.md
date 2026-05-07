---
'@gertsai-examples/m9s-example': patch
---

Sprint 3.10 — m9s-example Wave 5 integration (canonical reference).

Reference application now demonstrates Wave 5 stack composition canonically:

- **`@gertsai/errors`** — domain throws use `ValidationError` (Document.id/text + zero-chunks + empty-query), `InternalError` (embedder count mismatch). Transport-level `wrapUnknownError(e, 'INTERNAL')` recommended at boundaries (documented in README §Wave 5).
- **`@gertsai/tenant-resolver`** — `tenantMiddleware` in broker config; `HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true })` + `ChainTenantResolver` (mode `'optional'` for example; production should be `'strict'`).
- **`@gertsai/runtime-context`** — `sessionMiddleware` registered in canonical order (`tenantMiddleware → sessionMiddleware`) via `buildWave5Middlewares()`. Auto-`$freeze()` before downstream handler per ADR-007 I-16.
- **`@gertsai/session-guard`** — `assertAuthenticated(session)` + `assertSessionInTenant(session, tenantId)` invoked inside both use cases.

Use-case input shape extended with **additive optional** `session?: Session` + `expectedTenantId?: string` fields — pre-Wave-5 callers (existing 16 tests) pass neither and skip the assertion branch entirely. ADR-010 I-2/I-3 regression invariant preserved (no required-arg signature change).

NEW integration test `tests/wave5-integration.test.ts` (4 tests):
1. Valid X-Tenant-ID header → resolver yields tenant → `RequestContext.$freeze` → use-case runs successfully.
2. Missing header + strict chain → `UnauthorizedError`.
3. Destroyed session → `AuthenticationRequiredError`.
4. Cross-tenant attempt (session.tenantId !== expectedTenantId) → `TenantScopeViolationError`.

⚠️ SECURITY: `trustProxy: true` requires upstream proxy stripping inbound `X-Tenant-ID`. WITHOUT this infrastructure, any client can spoof tenant → CWE-639 cross-tenant data access. See `examples/m9s-example/README.md` §Wave 5 stack reference + `@gertsai/tenant-resolver` SECURITY section.

Test count: 20 passed / 1 skipped (16 existing + 4 new). F+ regression invariant preserved.

Refs ADR-010 §B + Amendment 1 §A1.6 (inline templates) + I-14 (SECURITY warning convention).
