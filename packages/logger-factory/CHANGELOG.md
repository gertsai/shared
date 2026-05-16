# @gertsai/logger-factory

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
