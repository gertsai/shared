# @gertsai/errors

Universal error taxonomy for the `@gertsai/*` ecosystem — Shared Kernel per
[ADR-006](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-006-errors-tenant-resolver-placement-session-additive-scoping-wave-5-extraction-policy.md).
Ten closed `ErrorKind` values map cleanly onto RFC 9457 ProblemDetails (HTTP)
and canonical gRPC status codes, so every `@gertsai/*` consumer can throw a
single typed error and let the transport layer pick the right wire format.

## Install

```bash
pnpm add @gertsai/errors
```

## Quickstart

```ts
import { isAppError, NotFoundError, getUserMessage } from '@gertsai/errors';

function loadDoc(id: string) {
  const doc = repo.find(id);
  if (!doc) {
    throw new NotFoundError({
      message: `Document ${id} not found`,
      details: { resourceType: 'doc', resourceId: id },
      correlationId: 'req-7',
    });
  }
  return doc;
}

try {
  loadDoc('missing');
} catch (err) {
  if (isAppError(err)) {
    console.warn(err.kind, err.details, err.correlationId);
    showToast(getUserMessage(err));
  } else {
    throw err;
  }
}
```

## Subpath imports

The root export covers the taxonomy (kinds, base, subclasses, helpers).
Transport-specific helpers live behind subpaths so the core is free of
HTTP / gRPC framework runtime dependencies (per ADR-006 I-1, I-2, I-3).

### `/http` — RFC 9457 ProblemDetails

```ts
import { ConflictError } from '@gertsai/errors';
import { appErrorToHttpResponse, parseHttpProblemDetails } from '@gertsai/errors/http';

// Outbound (server side)
const err = new ConflictError({
  message: 'Document already exists',
  details: { resource: 'doc', conflictWith: 'rev-7' },
});
const { status, body } = appErrorToHttpResponse(err);
// status === 409
// body.type === 'urn:gertsai:errors:conflict'
// body.details has been wire-redacted (REDACTION_KEYS list)

// Inbound (client side)
const restored = parseHttpProblemDetails(body); // → ConflictError
```

### `/grpc` — canonical status codes

```ts
import { TimeoutError } from '@gertsai/errors';
import { appErrorToGrpcStatus, GrpcStatus } from '@gertsai/errors/grpc';

const err = new TimeoutError({
  message: 'Upstream timed out',
  details: { timeoutMs: 5000, operation: 'fetch-doc' },
});
const { code, message, details } = appErrorToGrpcStatus(err);
// code === GrpcStatus.DEADLINE_EXCEEDED (4)
// details has been wire-redacted
```

## API

| Export | Source | Purpose |
|---|---|---|
| `ErrorKind` | root | `as const` object with 10 closed values |
| `AppError<D>` | root | abstract generic base; subclass to add a kind |
| 10 subclasses | root | `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `RateLimitedError`, `InternalError`, `UpstreamFailureError`, `TimeoutError`, `BadGatewayError` |
| `isAppError(x)` | root | type guard |
| `wrapUnknownError(x, kind?, correlationId?)` | root | normalize any thrown value to `AppError` (preserves cause) |
| `getUserMessage(error, locale?)` | root | resolve a localized user-facing message |
| `registerErrorLocale(locale, catalog)` | root | extension point for translation catalogs |
| `httpStatusForKind` | `/http` | `Record<ErrorKind, number>` mapping |
| `PROBLEM_TYPE_BUCKETS` | `/http` | RFC 9457 `type` URN per kind (server kinds collapse to one bucket) |
| `appErrorToHttpResponse(err)` | `/http` | wire-safe ProblemDetails serializer |
| `parseHttpProblemDetails(body)` | `/http` | best-effort reverse mapping |
| `redactDetails(details)` / `REDACTION_KEYS` | `/http` | wire redaction primitive |
| `GrpcStatus` | `/grpc` | canonical integer code constants |
| `grpcStatusForKind` | `/grpc` | `Record<ErrorKind, number>` mapping |
| `appErrorToGrpcStatus(err)` | `/grpc` | wire-safe gRPC status serializer |

## Security

- **`toJSON()` is internal** — emits the full `details` and `cause` chain
  without redaction. Use it for application logs only. Never write the
  result directly to an HTTP response or gRPC status.
- **`appErrorToHttpResponse()` and `appErrorToGrpcStatus()` redact**
  any `details` key matching `REDACTION_KEYS` (case-insensitive). Defaults
  cover credentials and connection strings; extend per your project.
- **Cause chain guard** — `toJSON()` walks at most 5 levels deep and
  detects cycles via `WeakSet`. On overflow it emits a `__truncated`
  marker instead of recursing further. This prevents both DoS-by-cycle
  and stack overflow on accidentally self-referential cause chains.
- **Bucket types** — server-side kinds (`INTERNAL`, `UPSTREAM_FAILURE`,
  `BAD_GATEWAY`) all map to `urn:gertsai:errors:server` in
  ProblemDetails so wire-readable URN does not leak infrastructure
  topology. Status codes (500 / 502 / 502) remain distinct.

## Cross-references

- [ADR-006 — Wave 5 errors / tenant-resolver placement](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-006-errors-tenant-resolver-placement-session-additive-scoping-wave-5-extraction-policy.md)
- [PRD-003 — Wave 5 foundation](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)

## License

Apache-2.0. The `LICENSE` file is a symlink to the repository root.
