# @gertsai/logger-factory

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
