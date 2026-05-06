# @gertsai/logger-factory

[![npm version](https://img.shields.io/npm/v/@gertsai/logger-factory.svg)](https://www.npmjs.com/package/@gertsai/logger-factory)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

Pluggable structured logger factory for the `@gertsai/*` ecosystem.

- 6-level API (`trace` / `debug` / `info` / `warn` / `error` / `fatal`).
- **Default-on PII redaction** — REDACTION_KEYS from `@gertsai/errors`
  are scrubbed without consumer opt-in (per ADR-009 I-17, CWE-209).
- `child(boundCtx)` returns a frozen, isolated logger (CWE-200).
- Peer-optional adapters for `pino` (`/pino`) and `winston` (`/winston`)
  via `createRequire`. Consumers who do not import these subpaths never
  pay for the dependencies.

## Install

```bash
pnpm add @gertsai/logger-factory                    # default console only
pnpm add @gertsai/logger-factory pino               # + /pino subpath
pnpm add @gertsai/logger-factory winston            # + /winston subpath
```

`@gertsai/errors` is a required peer dependency.

## Quickstart

```typescript
import { createLogger } from '@gertsai/logger-factory';

const logger = createLogger({
  level: 'info',
  baseContext: { service: 'api' },
});

logger.info('user logged in', { userId: 42, password: 'hunter2' });
// → [INFO] user logged in { service: 'api', userId: 42, password: '[REDACTED]' }

const child = logger.child({ requestId: 'r-abc' });
child.warn('slow query', { ms: 1200 });
// → [WARN] slow query { service: 'api', requestId: 'r-abc', ms: 1200 }
```

## Subpath imports

Three import paths cover the supported backends:

```typescript
// 1. Root export — console-only, no extra deps.
import { createLogger, consoleBackend } from '@gertsai/logger-factory';

// 2. /pino — wraps a pino instance. Requires `pino` peer dep.
import { createPinoBackend } from '@gertsai/logger-factory/pino';

// 3. /winston — wraps a winston logger. Requires `winston` peer dep.
import { createWinstonBackend } from '@gertsai/logger-factory/winston';
```

If the corresponding peer dep is missing the adapter throws on first
call with a canonical install message:

```text
@gertsai/logger-factory/pino requires "pino" >=8.0.0 as a peer dependency. Install it with: pnpm add pino
```

```text
@gertsai/logger-factory/winston requires "winston" >=3.0.0 as a peer dependency. Install it with: pnpm add winston
```

`typesVersions` is configured so legacy Node10 resolvers see the
correct `.d.ts` file for each subpath.

## API

```typescript
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogContext { readonly [key: string]: unknown; }

interface Logger {
  trace(msg: string, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  fatal(msg: string, ctx?: LogContext): void;
  child(boundCtx: LogContext): Logger;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

interface LoggerBackend {
  log(level: LogLevel, msg: string, ctx: LogContext): void;
}

interface LoggerFactoryOpts {
  readonly level?: LogLevel;        // default 'info'
  readonly backend?: LoggerBackend; // default consoleBackend
  readonly baseContext?: LogContext;
  readonly redact?: readonly string[]; // EXTENDS REDACTION_KEYS
}

function createLogger(opts?: LoggerFactoryOpts): Logger;
const consoleBackend: LoggerBackend;

// /pino
function createPinoBackend(pinoInstance?: unknown): LoggerBackend;

// /winston
function createWinstonBackend(winstonInstance?: unknown): LoggerBackend;
```

## Compatibility

| Peer | Supported | Tested |
|---|---|---|
| `@gertsai/errors` | `workspace:^` | latest |
| `pino` | `>=8.0.0` | resolved from pnpm-lock when installed |
| `winston` | `>=3.0.0` | resolved from pnpm-lock when installed |

Node `>=22 LTS`; ESM and CJS dual-published via `tsup`.

## Security & Caveats

- **Default-on redaction (I-17).** REDACTION_KEYS from `@gertsai/errors`
  are applied even if `opts.redact` is omitted. Consumer-supplied
  `redact` is unioned with the defaults (case-insensitive) and **cannot
  disable** them.
- **`child(ctx)` PII isolation (Amendment 1.2.6).** A child logger gets
  a frozen shallow-merged base context and an independent level state.
  Mutating the parent context or calling `parent.setLevel(...)` after
  `child(...)` does not affect the child.
- **Lazy peer-dep loading.** `/pino` and `/winston` adapters use
  `createRequire(import.meta.url)` and only attempt to resolve the
  dependency on the first call without a pre-built instance.
- **Backend trust boundary.** Redaction is applied by `createLogger`
  before invoking the backend; custom backends MUST NOT log raw
  pre-redaction context.

## Cross-references

- ADR-009 §Decision B (logger-factory contract) + Amendment 1.2.5/1.2.6 + I-17.
- PRD-003 G-6 — Wave 5 Phase 4 scope.
- `@gertsai/errors` — REDACTION_KEYS source of truth.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
