---
'@gertsai/errors': minor
'@gertsai/logger-factory': minor
'@gertsai/hsm': minor
'@gertsai/auth-openfga': minor
---

Wave 12.D-fix Teammate C — close 5 HIGH findings + engines.node declaration on 4 packages per PRD-036.

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
