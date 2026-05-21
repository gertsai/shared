# @gertsai/logger-factory

## 2.0.1

### Patch Changes

- 30d3b10: Wave 28 — close EVID-080 MED+LOW polish tail across 7 packages (4 MED + 10 LOW, +13 new tests).

  Solo teammate (typescript-pro). +252/-19 LOC. 0 workspace typecheck errors.

  **MED tail (4 actionable, M4 uuid rename deferred to v1.x; M10 already-correct):**

  - **FR-1 (M3) entity** — `EntityWithMetadata.$markSaved` becomes idempotent (guard on `_isMockup === false`). Matches `$markStaled`/`$markFresh` pattern.
  - **FR-2 (M5) session** — Default `errorHandler` now calls `console.error` instead of silent no-op. Easy revert via explicit `errorHandler: () => {}` opt.
  - **FR-3 (M8) tenant-resolver** — JSDoc on `chain-resolver` serial-by-design loop. Doc-only.
  - **FR-4 (M9) runtime-context** — `@example` JSDoc on `requireAuthContextWithDataAccess` showing distinction from `isImpersonating` (from `@gertsai/session-guard`).

  **LOW tail (10):**

  - **FR-6 (L1) audit-primitives** — `convert.ts` adds RangeError guards for negative epoch ms inputs.
  - **FR-7 (L2) async-utils** — `with-timeout.ts` JSDoc on AbortController best-effort fire-and-forget semantics.
  - **FR-8 (L3) async-utils** — `throttle.ts` JSDoc on `cancel()` reset-lastInvoke behaviour.
  - **FR-9 (L4) entity** — `adapters/vue.ts` truthy-check → `typeof === 'function'` triple-check with descriptive error.
  - **FR-10 (L5) tenant-resolver** — `header.strategy.ts` JSDoc on `string[]` header first-value behaviour.
  - **FR-11 (L6) tenant-resolver** — `subdomain.strategy.ts` IPv4 regex now range-precise (octets 0–255).
  - **FR-12 (L7) rpc-proxy-builder** — `proxy.ts` adds `has`/`ownKeys`/`getOwnPropertyDescriptor` traps. `'foo' in proxy` and `Object.keys(proxy)` now behave as expected.
  - **FR-13 (L8) rpc-proxy-builder** — `proxy.ts` get trap special-cases `then`/`catch`/`finally` → `undefined` for Promise-unwrap detection. `await proxy` no longer throws.
  - **FR-14 (L9) logger-factory** — `winston/index.ts` JSDoc on fatal→error mapping loss-of-distinction.
  - **FR-15 (L10) logger-factory** — `pino/index.ts` accepts optional `pinoOptions` second arg passed through to `pino()`. Backward compat preserved.

  **M4 (OperatorRef.\_uid → uuid rename)** — intentionally **deferred** to v1.x minor/major. Surface-breaking rename, not a patch-level polish.

  **M10 (`ctx.meta ?? {}` lazy-create)** — EVID-080 tagged as "code is correct; readability note". No action.

  **Tests**: +13 new (1 entity EntityWithMetadata + 1 entity vue + 1 session console.error + 1 tenant-resolver subdomain IPv4 + 4 audit-primitives negative epochs + 2 rpc-proxy-builder traps + 1 rpc-proxy-builder thenable + 2 logger-factory pinoOptions).

  **Behaviour clarifications**:

  - FR-1: `$markSaved` no-op when already saved — consumers who relied on re-emit must call manually.
  - FR-2: New errorHandler default emits `console.error('[gertsai/session] uncaught error:', err)`. Pass explicit handler to silence.
  - FR-12: `'foo' in proxy` and `Object.keys(proxy)` semantics change from "always empty" to "reflects registered actions".
  - FR-13: `await proxy` returns the proxy itself (was: threw `Unknown RPC action: then`).
  - FR-15: `pino(opts)` signature added — defaults preserved when called with no args.

  All bumps: patch. Zero public surface breaks.

  EVID-080 tail closure: **4/4 actionable MED closed + 10/10 LOW closed**. Combined with Wave 26 (5/5 HIGH + 3/10 MED), audit gap fully drained across all 41 packages.

  Refs: PRD-064, EVID-080 (Wave 25 audit), EVID-082 (Wave 28 evidence).

## 2.0.0

### Minor Changes

- 05258e5: Wave 12.D-fix Teammate C — close 5 HIGH findings + engines.node declaration on 4 packages per PRD-036.

  **@gertsai/errors — FR-007 + root re-export**

  `REDACTION_KEYS` expanded by 19 new entries (11 PRD-named + 8 snake_case variants): `apitoken`, `accesstoken`, `refreshtoken`, `csrftoken`, `bearertoken`, `idtoken`, `sessionid`, `clientsecret`, `x-api-key`, `bearer`, `jwt`, plus `api_token` / `access_token` / `refresh_token` / `csrf_token` / `bearer_token` / `id_token` / `session_id` / `client_secret`. All consumers of `redactDetails` inherit the wider redaction automatically.

  `redactDetails` + `REDACTION_KEYS` re-exported from package root (was only on `/http` subpath). Backward-compatible — additive.

  **@gertsai/logger-factory — FR-006**

  `applyRedaction` was shallow-only — `{ user: { password: 'p' } }` leaked nested secrets. Replaced with delegation to `redactDetails` from `@gertsai/errors` root export (depth-5 + cycle-safe + breadth-1000 per Sprint 3.10 W-3-10-3).

  **@gertsai/hsm — FR-009 (HIGH security CWE-319)**

  `VaultProvider` constructor now validates `VaultConfig.address`. Rejects non-`https://` URLs (throws `HSMError` with `CONFIG_ERROR`) unless host is loopback (`localhost`/`127.0.0.1`/`::1`). Loopback http: allowed for dev with `console.warn`. Prevents cleartext `X-Vault-Token` transmission.

  **@gertsai/auth-openfga — FR-022 (HIGH logic)**

  `initialize()` race fix. Previously coalesced concurrent calls via `this.initPromise` but never cleared on failure → all subsequent callers saw rejected promise forever even when retry would succeed. Now: `try { await this.initPromise; ...} catch (err) { this.initPromise = null; throw err; }`.

  **FR-011 — engines.node declared on all 4 packages** (`>=22`) per post-12.C-fix-1 entity precedent. Documents Node-only nature for `node:crypto`, `events`, etc imports.

  **Tests:** +18 new tests across 4 packages (7 redaction-expanded + 2 nested-redaction + 7 vault-address + 2 init-retry). 281+18=299 pass.

  Refs: PRD-036, EVID-051 (S-1, S-2, S-4, L-6).

### Patch Changes

- Updated dependencies [05258e5]
  - @gertsai/errors@0.3.0

## 1.0.0

### Minor Changes

- c6896c4: Initial release. Tier 1 structured logger with pluggable backends.

  - 6-level logger (trace/debug/info/warn/error/fatal) + `child(boundCtx)` returning new Logger with **frozen shallow merged context** + independent level state per ADR-009 Amendment 1.2.6 (CWE-200 child PII isolation).
  - Default `consoleBackend` ships out-of-box (zero peer-dep cost).
  - `/pino` subpath: peer-optional pino adapter via lazy `createRequire('pino')`.
  - `/winston` subpath: peer-optional winston adapter (LEVEL_MAP routes trace→silly, fatal→error).
  - **Default-on redaction**: `REDACTION_KEYS` from `@gertsai/errors/http` applied without consumer opt-in per ADR-009 I-17 (CWE-209 protection). Consumer's `redact` extends defaults via set union (cannot disable).

  Peer-deps: `@gertsai/errors` (REDACTION_KEYS reuse). pino >=8.0.0 + winston >=3.0.0 peer-optional via peerDependenciesMeta.

### Patch Changes

- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
  - @gertsai/errors@0.2.0

## 0.1.0

### Minor Changes

- Initial release: pluggable logger factory with default-on REDACTION_KEYS
  redaction (ADR-009 I-17), frozen child contexts (Amendment 1.2.6), and
  peer-optional `/pino` + `/winston` subpath adapters via `createRequire`.
