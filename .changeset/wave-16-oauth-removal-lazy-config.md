---
'@gertsai/api-core': minor
---

Wave 16.A+B — close two EVID-067 §Doctor Strange items.

**16.A — Legacy OAuth module removed (BREAKING but pre-1.0).**

The self-`@deprecated` `OAuth` class, `AuthProvider` registry, and `MX()`
Moleculer mixin under `src/lib/oauth/` + `src/moleculer/oauth.mixin.ts`
have been deleted. The grep audit across `packages/*` and `examples/*`
confirmed zero active external consumers — the only call site was
`apiGateService.template.ts` itself (which used to mount `MX()` by
default), and `m9s-example` already opted out via `disableAuth: true`.

- `apiGateService.template.ts` no longer mounts any auth mixin by
  default. The `OrchestraApiGateOptions.disableAuth` field is preserved
  as a no-op for type-shape back-compat (slated for removal at v1.0.0).
- The `OAuthError` branch of the gateway error handler is gone; auth
  errors flow through the existing `mapAuthErrorToResponseCode` /
  duck-typed `AuthenticationError` / `AuthorizationError` paths.
- `import '@gertsai/api-core/oauth'` now throws a loud migration error
  at import time instead of returning the legacy surface.
- `oauth2-server` + `@types/oauth2-server` dropped from `package.json`.
- ~494 LOC of deprecated-but-default code removed.

Migration: mount your own Express-style auth middleware in
`settings.use`. If you still need the legacy surface, pin to
`@gertsai/api-core@0.3.x`.

**16.B — Lazy config (no env-var reads on `/moleculer` import).**

`src/config.ts` previously called `loadConfig({...})` at module top
level. That side-effect fired the moment anything in the
`@gertsai/api-core/moleculer` subpath was imported, leaking ~30 env
vars into the resolved config object — defeating the
`"sideEffects": false` declaration and the deliberate root-export
omission of `runtime/node`.

The default export is now a `Proxy` that memoises
`loadConfig({...defaults})` on first property access. All consumer call
sites (`config.ALLOWED_ORIGINS`, `config.HEALTHCHECK_ENABLED`, etc.) are
source-compatible; the `process.env` read happens lazily when something
actually asks for a field.

A new test (`__test__/no-side-effects-on-import.test.ts`) asserts that
importing `../config` does not read any tracked env key and that the
first property access does. The test uses a `process.env` `Proxy` to
record every read by name.

Closes EVID-067 §Doctor Strange #3 and #4.
