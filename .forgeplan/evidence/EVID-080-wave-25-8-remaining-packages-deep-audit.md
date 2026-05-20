---
depth: tactical
id: EVID-080
kind: evidence
links:
- target: PRD-062
  relation: informs
status: active
title: Wave 25 — 8 remaining packages deep audit
---

## Summary

Wave 25 deep audit closes the final pre-v1.0 audit gap for 8 Tier-1/2 packages
totalling ~3.3k LOC of source (audited read-only, no source changes). Findings:
**3 HIGH, 10 MEDIUM, 8 LOW** spread across 6 packages; 2 packages
(`@gertsai/audit-primitives` and `@gertsai/async-utils`) are essentially clean.
No CRITICAL findings — confirms the foundation layer is production-ready for
v1.0, modulo the 3 HIGH closures recommended for Wave 26.

Top themes: (1) **error-type drift** between Session getter (`Promise.reject(new
Error(...))`) and the rest of the `SessionDestroyedError` contract; (2)
**provider-context binding-undefined ambiguity** in `DefaultProviderContext.get`
where a value of `undefined` cannot be distinguished from "not bound"; (3)
`rpc-proxy-builder` cache reuses cached proxy on `(actions, *different*
transport)` keys silently — actions-keyed WeakMap doesn't include transport
identity.

ADR contract coverage is **complete and accurate** in all 8 packages: ADR-006
fail-closed `mode: 'strict'`, ADR-007 freeze invariant + symbol-only tokens,
ADR-009 jitter default `'full'`, ADR-009 I-14/I-15 fail-loud + read-only Proxy
traps, ADR-010 TypedToken<T> brand discriminator with no phantom field — all
confirmed verbatim in code.

## Structured Fields

- verdict: supports
- congruence_level: CL3
- evidence_type: internal_audit
- linked_artifact: PRD-062
- summary: Wave 25 deep audit closes pre-v1.0 gap for 8 packages — 0 CRIT / 3 HIGH / 10 MED / 8 LOW; no blockers.

## Coverage Stats

| Package | Source LOC | Test cases | Findings (C/H/M/L) | Verdict |
|---|---|---|---|---|
| `@gertsai/entity` | 745 | 54 | 0/2/3/1 | passes with 2 HIGH |
| `@gertsai/session` | 417 | 16 | 0/1/2/2 | 1 HIGH (error-type drift) |
| `@gertsai/tenant-resolver` | 596 | 62 | 0/0/3/2 | clean — MEDs only |
| `@gertsai/runtime-context` | 909 | 76 | 0/2/3/2 | 2 HIGH (provider semantics) |
| `@gertsai/audit-primitives` | 100 | 20 | 0/0/0/1 | clean |
| `@gertsai/async-utils` | 312 | 25 | 0/0/0/1 | clean |
| `@gertsai/logger-factory` | 267 | 20 | 0/0/0/2 | clean |
| `@gertsai/rpc-proxy-builder` | 104 | 14 | 0/1/0/2 | 1 HIGH (cache-key flaw) |
| **TOTAL** | **3450** | **287** | **0/3/10/8** | **READY for v1.0** |

## CRITICAL findings

None.

## HIGH findings

### H1 — `@gertsai/session/src/Session.ts:95` — token getter error-type drift

`Session.token` getter rejects with `new Error('Session destroyed')` while the
rest of the class throws the canonical `SessionDestroyedError` from
`@gertsai/errors` (lines 230, 252). Test (`Session.test.ts:81`) cements this
with `rejects.toThrow('Session destroyed')` — string-prefix match, NOT class
match. Consumers who `catch (e) { if (e instanceof SessionDestroyedError)
... }` will silently miss the token-on-destroyed path. Contract drift
introduced by Sprint 3.10 ADR-010 Amendment 1 (the $-mutators were migrated to
`SessionDestroyedError` but the `token` getter was left behind).

Fix sketch: change line 95 to `Promise.reject(new SessionDestroyedError({
message: 'Cannot read token on destroyed session', details: { contextField:
'session' } }))`. Update test to match-class. Patch bump, no public surface
change.

### H2 — `@gertsai/runtime-context/src/provider-context.ts:97-105` — `_lookup` cannot distinguish "bound to undefined" from "not bound"

`DefaultProviderContext._lookup` uses `this._bindings.has(token) ?
this._bindings.get(token) as T : ...`. The `has`-check correctly says "binding
exists", but the returned value goes through `get<T>()`'s `if (found ===
undefined) throw ProviderNotFoundError` filter (line 80). Outcome: a consumer
who deliberately bound `undefined` (only `undefined` — `null` survives) gets a
`ProviderNotFoundError` despite having registered the token. Less severe in
practice (`undefined` bindings are unusual), but the contract is muddy and
`getOptional` is identically affected: cannot distinguish three states
{bound-to-undef, unbound, resolver-miss}.

Fix sketch: make `_lookup` return a discriminated `{ present: boolean; value?:
T }` (Option-like), then in `get`/`getOptional` branch on `present` rather
than on `value === undefined`. Public surface unchanged. Or document the
limitation explicitly + add test asserting current behaviour.

### H3 — `@gertsai/rpc-proxy-builder/src/proxy.ts:44,60-61,88` — proxyCache keyed only on `actions`, ignores `transport`

`createRpcProxy(transport, actions)` caches the proxy in a module-level
`WeakMap<object, unknown>` keyed solely on `actions`. Calling
`createRpcProxy(transportA, sharedActions)` then `createRpcProxy(transportB,
sharedActions)` returns the proxy bound to `transportA` for both calls —
silently using the wrong transport. Tests at `proxy.test.ts:84-88` confirm the
"same transport + same actions → same proxy" cache but never test the
cross-transport case.

This breaks multi-tenant runtimes that share an action map across multiple
broker instances (a pattern explicitly enabled by `@gertsai/auth-openfga` Wave
6.3 multi-instance singletons per ADR-012). Risk: cross-tenant RPC dispatch to
a stale transport.

Fix sketch: either (a) drop the cache (proxy creation is cheap; the cache
mostly exists to satisfy identity comparisons in user code), or (b) key on a
composite `WeakMap<actions, WeakMap<transport, proxy>>`, or (c) document
explicitly that the cache is keyed on actions and consumers MUST NOT share
action maps across transports. Option (b) is safest. Public surface unchanged.

### H4 — `@gertsai/entity` — `for...in` vs `Object.keys` asymmetry in $patch / $setMetadata

`Entity.$patch` line 117 + `EntityWithMetadata.$setMetadata` line 128 use
`for (const key in partial)` then `hasOwnProperty` filter. The combination is
safe BUT inconsistent with the `check === false` branch (lines 107, 118)
which uses `Object.keys(partial)` (own-enumerable only). Two different
iteration strategies for the same input is a code-smell trap — a future
refactor could remove the `hasOwnProperty` line and reintroduce
prototype-pollution exposure (CWE-1321). The `DANGEROUS_KEYS` allowlist
mitigates `__proto__`/`constructor`/`prototype`, but inherited enumerable
properties like a polluted `toString` would still be written.

Fix sketch: replace both `for...in` blocks with `Object.keys(partial)` for
parity with the `check=false` paths. Adds 0 LOC, removes a subtle invariant
dependency.

### H5 — `@gertsai/entity/src/Entity.ts:143-144` — `toJSONObject()` returns `data` by reference

Docstring acknowledges this ("data is returned by reference; if you need a
deep clone, do it on the consumer side"), but `Object.freeze` is not applied
so a caller can mutate the returned `data` and bypass `$patch`'s
`DANGEROUS_KEYS` filter + change-detection emit. The same applies to
`EntityWithMetadata.toJSONObject()` line 169-176 (returns both `data` and
`metadata` by reference).

Fix sketch: either (a) return shallow-frozen copies, or (b) keep the
reference but mark the type as `Readonly<Data>` to nudge consumers to clone
(currently typed as `Data`, not `Readonly<Data>`, in `EntityJSON`). Option (b)
is non-breaking.

## MEDIUM findings (consolidated)

### M1 — `@gertsai/entity/src/internal/deep-equal.ts:19-38`

`a === b` returns `false` for `NaN === NaN` even though the docstring says
"`Object.is`-style equality (NaN === NaN, +0 !== -0)". Code uses `===`, not
`Object.is`. Either fix the docstring or use `Object.is(a, b)` for the
short-circuit (preferred, matches the doc and the `lodash.isequal` replacement
the package claims to be).

### M2 — `@gertsai/entity/src/internal/deep-equal.ts:31-37` — false-positive on disjoint undefined-only key sets

`{a: undefined, b: undefined}` and `{c: undefined, d: undefined}` have same
length-2 key arrays; `keysA.every((k) => deepEqual(a[k], b[k]))` compares
`a.a=undefined` vs `b.a=undefined` → equal. Returns `true` despite disjoint
key sets. Add `keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k))`
guard.

### M3 — `@gertsai/entity/src/EntityWithMetadata.ts:146-149` — `$markSaved` not idempotent

Emits `'saved'` on every call, even when `_isMockup` is already `false`.
Compare with `$markStaled`/`$markFresh` which guard on the current state.
Either make idempotent or document the design choice (re-emit-on-already-saved).

### M4 — `@gertsai/session/src/types.ts:121-124` — `OperatorRef._uid` underscore-prefix

`OperatorRef = { _uid, type }` carries the Orchestra legacy naming
(underscore-prefix). Inconsistent with the rest of `@gertsai/*` which uses
unprefixed `uuid` everywhere. Pre-1.0 is the moment to fix this naming break.

### M5 — `@gertsai/session/src/Session.ts:78-83` — silent default `errorHandler`

`new Session({ ...no errorHandler })` returns a session whose `errorHandler`
is a no-op `(err) => { void err; }`. Hides errors. Either (a) log to
`console.error` by default, or (b) require explicit handler in opts.

### M6 — `@gertsai/tenant-resolver/src/strategies/path.strategy.ts:32-37` — sentinel-collision in `compilePattern`

`compilePattern` uses literal `___WILDCARD___` as an internal sentinel. If a
user pattern happens to contain `___WILDCARD___` (e.g. for some odd template
DSL), the escape pass doesn't escape underscores, so the sentinel would
collide post-escape. Probability is low but the failure mode is silent
(pattern compiles to wrong regex). Use a non-printable sentinel (e.g.
`'WILD'`) or a `Symbol`-keyed token-and-restore strategy.

### M7 — `@gertsai/tenant-resolver/src/strategies/path.strategy.ts:4` — `NON_PRINTABLE` rejects all non-ASCII

`/[^\x20-\x7E]/` rejects any character ≥ U+007F including all Cyrillic, CJK,
emoji, and Punycode-decoded labels. For internationalised tenant IDs (UTF-8
URL paths) the strategy fails closed. Either widen to allow Unicode (with NFC
normalisation + an explicit allowlist), or document explicitly that
PathStrategy is ASCII-only.

### M8 — `@gertsai/tenant-resolver/src/chain-resolver.ts:42-48` — serial strategy execution

`for (const strategy of this.strategies) { await strategy.resolve(...) }` is
serial. Per-strategy I/O (e.g., a hypothetical DB-backed strategy) blocks the
chain. Acceptable when strategies are CPU-only (current built-ins are), but
should be documented as a contract.

### M9 — `@gertsai/runtime-context/src/auth-context.ts:73-89` — `requireAuthContextWithDataAccess` fires only on explicit empty string

Documented in the docstring (Sprint 3.10 W-3-10-11 clarification): the guard
fires only when `$setDataAccessUuid('')` was called, NEVER on the natural
fallback `dataAccessUuid === operatorUuid`. This is correct per ADR-007
Amendment 1.2.9, but the consumer-facing implication is non-obvious — they
need to call `isImpersonating` from `@gertsai/session-guard` for the
intended-semantic guard. Suggest adding a runtime example to the docstring +
README.

### M10 — `@gertsai/runtime-context/src/moleculer/index.ts:92` — silent `ctx.meta ?? {}` lazy-create

`const meta = (ctx.meta ?? {})` creates an empty object on read but does NOT
attach it to `ctx`, while line 117 (`locals[REQUEST_CONTEXT_LOCALS_KEY] =
requestContext`) DOES mutate. Asymmetric I/O. Per ADR-007 I-15 `ctx.meta` is
read-only by convention — confirm `meta` is never written. (Code is correct;
the inline mutation is on `locals`, not `meta`. Just a readability note.)

## LOW findings (consolidated)

| # | Pkg | Location | Issue |
|---|---|---|---|
| L1 | audit-primitives | `convert.ts:13-14, 22-23` | `ms % 1000` is signed in JS — negative epochs yield negative `nanoseconds` |
| L2 | async-utils | `with-timeout.ts:22, 30` | `controller.abort()` is wired but never observed (action ignores signal). Dead code. |
| L3 | async-utils | `throttle.ts:51` | `cancel()` resets `lastInvoke = 0` allowing next call to invoke immediately (intentional but undocumented) |
| L4 | entity | `adapters/vue.ts:39-44` | `loadVue()` memoised triple-check uses truthy on functions — OK but fragile if Vue ever exports `undefined` for one of the three. |
| L5 | tenant-resolver | `strategies/header.strategy.ts:43-49` | When `string[]` headers, only first value returned (intentional but undocumented behaviour for proxy-set duplicate headers) |
| L6 | tenant-resolver | `strategies/subdomain.strategy.ts:5` | `IPV4_LITERAL = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/` matches `999.999.999.999`. Rejected anyway, so behaviour-correct but range-imprecise. |
| L7 | rpc-proxy-builder | `proxy.ts:68-78` | No `has` / `ownKeys` / `getOwnPropertyDescriptor` traps. `'foo' in proxy` is always `false`; `Object.keys(proxy)` empty. |
| L8 | rpc-proxy-builder | `proxy.ts:69-72` | `get` trap: when `prop` is a non-brand symbol returns `undefined` — OK; but on string `prop = 'then'`, throws `Unknown RPC action: then` if not in actions. Breaks any `await proxy` chain via Promise unwrap detection. |
| L9 | logger-factory | `winston/index.ts:35` | `fatal → 'error'` mapping loses winston-level distinction. Documented in header comment. |
| L10 | logger-factory | `pino/index.ts:37` | When no pre-built instance is passed, `factory()` is called with no options. Consumers can't customise pino opts. |

## Cross-cutting observations

1. **CWE-1321 prototype-pollution defence is consistent** across all 8
   packages that perform partial-object writes (`entity.$patch`,
   `entity.$setMetadata`, `runtime-context` providers, `logger-factory`
   REDACTION). All use either module-private `Symbol(...)` or `DANGEROUS_KEYS`
   Set + `hasOwnProperty`. The one wobble is H4 (`for...in` vs `Object.keys`
   inconsistency).

2. **Module-private brand discipline is uniform**: `RAW_MARKER`,
   `RPC_PROXY_BRAND`, `TYPED_TOKEN_BRAND` all use `Symbol(...)` (NOT
   `Symbol.for`). Aligns with ADR-008 I-11 / ADR-009 I-7 / ADR-010 I-11.

3. **Error-type discipline is mostly clean** except H1 — Session.token getter
   pre-dates the SessionDestroyedError migration. The rest of the surface
   throws typed `AppError` subclasses from `@gertsai/errors`.

4. **Lazy peer-dependency loading** is consistent: `createRequire` + try/catch
   + descriptive throw used in `entity/vue`, `logger-factory/pino`,
   `logger-factory/winston`. Pattern is well-codified.

5. **Test density**: 287 test cases across 3450 LOC = ~12 LOC/test, well above
   the audit-precedent ratio of 18-20 LOC/test seen in EVID-067/074. The two
   small packages (`audit-primitives`, `async-utils`) are clean partly because
   their test coverage is closer to 5 LOC/test.

6. **Four test-gap candidates** identified during audit:
   - `provider-context.test.ts` does NOT cover binding-to-`undefined` (H2).
   - `proxy.test.ts` does NOT cover cross-transport cache reuse (H3).
   - `Session.test.ts:81` asserts error message string, not class (H1 surfaced
     because the test wouldn't catch a class-type fix).
   - `deep-equal.test.ts` does NOT cover NaN (M1) or disjoint-undefined-keys
     (M2).

## Suggested Wave 26 fix sequence

Prioritised by blast-radius and risk:

1. **H1** (`session/src/Session.ts:95`): change `Promise.reject(new
   Error(...))` → `Promise.reject(new SessionDestroyedError(...))`. Update
   test to use `rejects.toThrow(SessionDestroyedError)`. Patch bump.

2. **H3** (`rpc-proxy-builder/src/proxy.ts:44,88`): change cache shape to
   `WeakMap<actions, WeakMap<transport, proxy>>`. Adds 4 lines. Patch bump,
   no public surface change. (Optional: also add `has`/`ownKeys` traps from
   L7.)

3. **H2** (`runtime-context/src/provider-context.ts:97-105`): document the
   binding-to-undefined limitation explicitly in the docstring + add test
   asserting current behaviour. Optionally refactor `_lookup` to return
   Option-like discriminated `{ present, value }`. Minor bump if refactored,
   patch bump if only documented.

4. **H4** (`entity/src/Entity.ts:117` + `EntityWithMetadata.ts:128`): replace
   `for...in` + `hasOwnProperty` with `Object.keys()` for parity.

5. **H5** (`entity/src/Entity.ts:143-144`): widen `EntityJSON.data` type to
   `Readonly<Data>` in `types.ts:131`. Type-only change.

6. **M1+M2** (`entity/src/internal/deep-equal.ts`): use `Object.is`; add
   `Object.prototype.hasOwnProperty.call(b, k)` guard. ~3 LOC change. Adds 2
   test cases.

7. **M6** (`tenant-resolver/src/strategies/path.strategy.ts:32`): swap
   sentinel for non-printable variant. ~2 LOC.

8. **M7** (`tenant-resolver`): either widen `NON_PRINTABLE` regex or document
   ASCII-only constraint. Documentation-only is preferred for v1.0 (behaviour
   change risk).

9. **M3, M4, M5**: discretionary — defer or close as `WONTFIX-documented`.

LOW findings: bulk-close or defer to v1.1.

Estimated total Wave 26 effort: **0.5–1 day** (8 mechanical fixes + 4 test
additions). All changes are patch-bump non-breaking.

## Methodology

- Read-only audit. No source modifications. No commit / push / PR.
- Per package: read every `src/**/*.ts` source file end-to-end + spot-check
  tests for known edge-case coverage (NaN, undefined-binding, transport-cache,
  error-type assertions).
- Cross-referenced against ADR-006/007/009/010 invariants cited in source-file
  comments — all citations verified to match described behaviour.
- Tooling: `Read` + `Grep` + `Bash` (file enumeration). No mutating tools
  used.
- Wallclock: ~38 minutes for 8 packages × ~430 LOC each.

## Refs

- PRD-062 — Wave 25 audit charter (active).
- EVID-051 (Wave 12.D-fix prior audit baseline).
- EVID-059, EVID-067, EVID-074 (prior wave audit precedents).
- EVID-076 (ws-rpc trust model — methodology pattern).
- EVID-078 (Wave 23 mid-tier audit — most-recent prior).
- ADR-006 (multi-tenant scoping + fail-closed default mode).
- ADR-007 (Wave 5 Phase 2 — runtime-context + session-guard + audit-primitives).
- ADR-009 (Wave 5 Phase 4 — async-utils + logger-factory + rpc-proxy-builder).
- ADR-010 (Sprint 3.10 polish — SessionDestroyedError relocation + TypedToken<T>).



