---
"@gertsai/api-core": minor
---

feat(api-core): pass native Moleculer per-action options through `ActionOptions.moleculer`

`ActionOptions` now accepts an optional `moleculer` escape-hatch that forwards native
Moleculer per-action schema options **verbatim** into the emitted action — `cache`,
`visibility`, `retryPolicy`, `bulkhead`, `circuitBreaker`, `fallback`, `tracing`,
`hooks` (and any other `ActionSchema` option, e.g. `timeout`, via the index signature).

Previously `_createActionSchema` emitted only `{ rest, auth, scopes, handler }` and
silently dropped **every** native option, so consumers could not enable action-level
caching (ADR-046) or mark cron-only actions `visibility: 'private'` (SPEC-015 §C.3 — a
real isolation gap: such actions were broker-callable by anyone). The fix is a single
typed escape-hatch rather than mirroring each option, so api-core need not chase the
Moleculer surface on every release.

Controller-owned fields are forbidden through the hatch — `handler`, `params`, `rest`,
`name`, `service` are `?: never` at compile time (this overrides `ActionSchema`'s
`[key: string]: any` index signature, which a bare `Omit` cannot) **and** filtered out
at runtime (defense-in-depth against an `as any` cast). `params` in particular would
otherwise double-validate under the broker's `validator: true` and mutate `ctx.params`
before the typia pipeline runs.

Additive — existing actions are unaffected.
