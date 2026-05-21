---
depth: standard
id: SPEC-021
kind: spec
last_modified_at: 2026-05-21T05:09:14.074695+00:00
last_modified_by: claude-code/2.1.145
status: draft
title: Wave 27 — ApiController action pipeline 13-stage contract
---

# SPEC-021: ApiController action pipeline 13-stage contract

| Field | Value |
|-------|-------|
| Status | Draft |
| Date | 2026-05-21 |
| Parent | PRD-065 (Wave 27) |

## Scope

This SPEC freezes the exact line-range and behaviour of each of the 13 stages extracted from `packages/api-core/src/lib/controller/ApiController.class.ts:722-915` (the `_createActionSchema` closure). The extraction MUST preserve each stage's observable behaviour verbatim — line ranges are the authority for "what counts as inside the stage".

## Pipeline data flow

```
ctx (Moleculer.Context) → PipelineContext (frozen, threaded through stages)
  ├── PipelineDeps (action, controller, options, broker logger)
  └── PipelineResult (final envelope or thrown APIError)
```

`PipelineContext` accumulates state as stages run. Stages MUST NOT mutate inputs; they MUST return new `PipelineContext` values (immutable threading). The runner is responsible for:
- Catching all stage exceptions and routing to `translateError` (stage 12) before the final throw
- Running `cleanup` (stage 13) in a `finally` block regardless of success/failure
- Detecting the `PipelineShortCircuit` sentinel from `rawResponseShortcut` (stage 9) and returning its carried `data` payload directly without wrapping

## Stage contracts

### Stage 1 — `extractParams`

**Source**: `ApiController.class.ts:730-746`

**Input**: `{ ctx: Moleculer.Context<unknown, ContextMeta> }`

**Output**: `{ ctx, params, file, fileMeta }`

**Behaviour**:
- If `ctx.meta.$params` is set (multipart upload): `params = ctx.meta.$params`, `file = ctx.params`, `fileMeta = { fieldname, filename, mimetype, encoding }` from `ctx.meta`
- Otherwise: `params = ctx.params`, `file = null`, `fileMeta = {}`

**Errors**: none

### Stage 2 — `mergeMultipart`

**Source**: `ApiController.class.ts:748-750`

**Input**: `{ ctx, params, file, fileMeta }`

**Output**: same shape; `params` mutated by `Object.assign(params, ctx.meta.$multipart)` when `ctx.meta.$multipart` is truthy

**Behaviour**: No-op if `$multipart` is undefined. NOTE: This is the one stage that mutates `params` in-place (preserves the verbatim behaviour of the closure).

**Errors**: none

### Stage 3 — `coerceQueryString`

**Source**: `ApiController.class.ts:753-774`

**Input**: `{ ctx, params, action, ... }`

**Output**: `params` mutated by coercion

**Behaviour**:
- Compute `isQueryStringEndpoint` from `action.options.rest`:
  - String form: starts with `'GET '` or `'DELETE '`
  - Object form: `method === 'GET' | 'DELETE'`
- If query-string endpoint:
  - If `isTypiaParamsWithSchema(action.options.params)`: call `smartCoerce(params, { numericFields, booleanFields, arrayFields })`
  - Otherwise: call `coerceQueryParams(params)` (legacy hard-coded list)

**Errors**: none (coercion is lossy-best-effort)

### Stage 4 — `injectTenantId`

**Source**: `ApiController.class.ts:779-782`

**Input**: `{ ctx, params }`

**Output**: `params` with `tenantId` populated from `ctx.meta.tenantId` if absent

**Behaviour**:
- If `ctx.meta.tenantId` is truthy AND `params.tenantId` is falsy: `params.tenantId = ctx.meta.tenantId`
- Otherwise: no-op
- Rationale (preserved verbatim from closure comment): "OpenAPI generator omits tenantId from public spec (clients never send it), but Typia validators require it."

**Errors**: none

### Stage 5 — `validateRequest`

**Source**: `ApiController.class.ts:785-790`

**Input**: `{ params, action }`

**Output**: unchanged on success

**Behaviour**:
- `validator = getValidator(action.options.params)`
- `result = validator(params)`
- If `result.success === false`: throw `new APIError(ResponseCode.BAD_REQUEST__INVALID_PARAMS, result.errors)`

**Errors**: `APIError(BAD_REQUEST__INVALID_PARAMS)`

### Stage 6 — `establishAuthSession`

**Source**: `ApiController.class.ts:792-806`

**Input**: `{ ctx, action }`

**Output**: `{ session?: OrchestraSession }`

**Behaviour**:
- If `action.options.auth === 'required' || action.options.auth === 'optional'`:
  - If `action.options.auth === 'required'` AND `!ctx.meta.user_uuid`:
    - `this.logger?.error('Cannot call an action with required authorization. No user found in meta', action)`
    - Throw `new APIError(ResponseCode.NOT_AUTHORIZED)`
  - If `ctx.meta.user_uuid && ctx.meta.user_type`:
    - `session = ApiController._config.sessionFactory(ctx.meta.user_uuid, ctx.meta.user_type)`
- Otherwise: session stays `undefined`

**Errors**: `APIError(NOT_AUTHORIZED)`

### Stage 7 — `buildTraceContext`

**Source**: `ApiController.class.ts:808-820`

**Input**: `{ ctx }`

**Output**: `{ traceContext?: QueueTraceContext }`

**Behaviour**:
- `traceContext = buildTraceparent({ ...optional ctx.requestID, ...optional ctx.id, ...optional ctx.parentID, ...optional ctx.tracing })`
- (PRD-052 FR-004: W3C traceparent format `00-traceId-spanId-01` with non-zero enforcement, delegated to `@gertsai/otel`)

**Errors**: none

### Stage 8 — `invokeHandler`

**Source**: `ApiController.class.ts:821-848`

**Input**: full assembled `PipelineContext`

**Output**: `{ code?, message?, data, raw? }` (result of `action.options.handler.call(this, deps)`)

**Behaviour**:
- Assemble deps object:
  - `session` (from stage 6)
  - `ctx` (raw Moleculer)
  - `service` (=== `this`)
  - `params`
  - `addJob` (wrapped to auto-inject `_traceContext`)
  - `getQueue` (= `this.getQueue`)
  - `files` (array, empty or single `{ stream, meta }`)
  - `call` (proxies `ctx.call(...)` and unwraps `.data`)
  - `logger` (= `this.logger`)
  - `respond` (helper)
- Invoke `action.options.handler.call(this, deps)`

**Errors**: any thrown by the handler (passes through to stage 12)

### Stage 9 — `rawResponseShortcut`

**Source**: `ApiController.class.ts:850-852`

**Input**: `{ result, action }`

**Output**: throws `PipelineShortCircuit(data)` if `result.raw === true`

**Behaviour**:
- If `result.raw === true`: log info + throw `PipelineShortCircuit(result.data)` — runner catches and returns `data` directly without further validation or wrapping
- Otherwise: pass-through

**Errors**: `PipelineShortCircuit` sentinel (caught by runner, NOT routed to `translateError`)

### Stage 10 — `validateResponse`

**Source**: `ApiController.class.ts:854-880`

**Input**: `{ result, action }`

**Output**: unchanged on success

**Behaviour**:
- If `config.RESPONSE_VALIDATION === true`:
  - `responseIsValid = action.options.response(result.data)`
  - If `!responseIsValid.success`:
    - If `action.options.strictResponseValidation === true || ApiController._config.strictResponseValidation === true`:
      - Throw `new APIError(ResponseCode.BAD_REQUEST__INVALID_RESPONSE, responseIsValid.errors)`
    - Else: `this.logger?.error(action.name, 'Response validation failed', responseIsValid.errors)`

**Errors**: `APIError(BAD_REQUEST__INVALID_RESPONSE)` in strict mode

### Stage 11 — `wrapResponse`

**Source**: `ApiController.class.ts:882-890`

**Input**: `{ result, action }`

**Output**: final envelope

**Behaviour**:
```ts
const finalCode = result.code ?? action.options.responseCode ?? ResponseCode.SUCCESS;
return {
  success: true,
  code: finalCode,
  message: result.message ?? action.options.responseMessage,
  data: result.data,
};
```

**Errors**: none

### Stage 12 — `translateError`

**Source**: `ApiController.class.ts:892-908`

**Input**: error thrown anywhere in stages 1–11

**Output**: always throws (transformed error)

**Behaviour** (in order):
1. If `err instanceof APIError`: rethrow as-is
2. If `err.__ORCHESTRA_ERROR__ === true` (duck-type, `@ts-ignore` preserved): throw `APIError.fromJSON(err)`
3. If `err instanceof Error`: throw `APIError.fromError(err)`
4. Else: log `'Unknown error occurred', err` + throw `new APIError(ResponseCode.INTERNAL_ERROR)`

**Errors**: always throws — caller (runner) re-throws as the closure's effective throw

### Stage 13 — `cleanup`

**Source**: `ApiController.class.ts:909-913`

**Input**: `{ session?, action }`

**Output**: void (runs in `finally`)

**Behaviour**:
- `this.logger?.info('Action finished', action.name)`
- `session?.$destroy()`

**Errors**: none (best-effort cleanup; exceptions inside cleanup are swallowed per existing closure behaviour)

## Cross-cutting invariants

- **I-1**: `APIError` is the ONLY error type that crosses the pipeline boundary (escapes the runner). All other error shapes are translated in stage 12.
- **I-2**: `session.$destroy()` MUST be called in `finally` regardless of success/failure (verbatim from current closure).
- **I-3**: `raw === true` shortcut bypasses response validation AND wrapping, but cleanup (stage 13) still runs.
- **I-4**: `traceContext` is built once per request (stage 7) and reused by `addJob` (stage 8); MUST NOT be rebuilt per `addJob` call.
- **I-5**: Tenant injection (stage 4) runs BEFORE validation (stage 5) so typia validators see the auto-populated `tenantId`.
- **I-6**: Auth check (stage 6 part 1) is fail-fast — runs BEFORE session factory (stage 6 part 2), so unauthorized requests never instantiate a session.

## Out of scope

- Defining new stages (request-id, OTel span, rate-limit, audit)
- Tightening `any` / `@ts-ignore` (PRD-065 explicit non-goal)
- Changing `APIError` codes or response envelope shape
- Replacing typia or Moleculer

## Refs

- PRD-065 (parent)
- ADR-015 (pipeline pattern choice)
- RFC-027 (extraction strategy + landing plan)
- `packages/api-core/src/lib/controller/ApiController.class.ts:722-915` (verbatim source)


