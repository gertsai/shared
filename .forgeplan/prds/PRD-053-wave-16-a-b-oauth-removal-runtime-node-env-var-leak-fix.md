---
depth: standard
id: PRD-053
kind: prd
last_modified_at: 2026-05-20T05:25:45.211800+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 16.A+B — OAuth removal + runtime/node env-var leak fix
---

## Problem Statement

EVID-067 §Doctor Strange surfaced 2 cleanup items deferred from Wave 15:

**§DS#4 — OAuth self-deprecated by source but mounted by default**
`packages/api-core/src/lib/oauth/index.ts:2-4` literally says `@deprecated This OAuth2 implementation is legacy and will be removed in a future version`, yet `apiGateService.template.ts` still mounts the `MX()` mixin by default (only skipped when `options.disableAuth === true`). **494 LOC of deprecated-but-default code**.

**§DS#3 — runtime/node "no side effects" guarantee partially leaky**
`runtime/node/index.ts` is deliberately kept out of root re-export to prevent `dotenv` eager-load side effects, yet `apiGateService.template.ts` and `oauth.class.ts` import `from '../../config'` which itself calls `loadConfig({...})` at module load time. The `/moleculer` subpath consumers transitively load ~30 env vars on import. The "no side effects" guarantee is partially leaky.

## Goals

**Wave 16.A — OAuth removal**:
1. Audit consumers of OAuth mixin across `packages/*` + `examples/*` + downstream Hub repos (best effort via local grep).
2. If zero active consumers (confirmed via grep): DELETE 494 LOC of OAuth code + back-compat shim with `@deprecated` + throw.
3. If active consumers: defer to v1.0.0 with a stronger deprecation marker.

**Wave 16.B — runtime/node env-var fix**:
1. Identify `config` import side effects in `apiGateService.template.ts` + `oauth.class.ts` (or post-16.A: just template).
2. Refactor: lazy-load config in subpath OR move env-var-reading code out of `/moleculer` entry-point reachable chain.
3. Verify `import '@gertsai/api-core/moleculer'` does NOT trigger env-var reads at module-load.

## Functional Requirements

**FR-A-1** — Grep audit: `git grep -rn 'oauth\|OAuth\|MX()' packages/ examples/` (excluding api-core's own OAuth dir). Identify any non-api-core consumer of the OAuth mixin.

**FR-A-2** — Decision:
- If FR-A-1 returns ZERO active consumer call sites: DELETE OAuth module entirely
- If FR-A-1 returns ≥1 active consumer: surface in EVID-071; defer to v1.0.0

**FR-A-3** — Back-compat shim (only if deleting): keep `packages/api-core/src/lib/oauth/index.ts` as a minimal `throw new Error('OAuth removed in Wave 16.A — see CHANGELOG; mount your own OAuth middleware')` stub. Or delete file + add migration note to CHANGELOG.

**FR-A-4** — Update `apiGateService.template.ts` to no longer mount the OAuth mixin by default. Users wanting OAuth bring their own.

**FR-B-1** — Identify `loadConfig({...})` call sites that fire at module-load time in the `/moleculer` subpath reach.

**FR-B-2** — Refactor: convert eager `loadConfig` to lazy (called inside function body, not at module top-level) OR move side-effect-bearing code to its own subpath that's NOT in the `/moleculer` reach.

**FR-B-3** — Add a sanity check: `node -e "require('@gertsai/api-core/moleculer'); console.log(process.env.SOME_KNOWN_VAR_THAT_LOADCONFIG_READS);"` — should NOT show the side-effect-loaded value if env var was unset before require.

## Non-Functional Requirements

**NFR-001** — Build green + workspace typecheck 0 errors.
**NFR-002** — api-core test suite passes (currently 284 tests post Wave 15.C).
**NFR-003** — Bump strategy: if 16.A is DELETE → minor (technically breaking but pre-1.0 + already `@deprecated`). 16.B alone is patch.

## Out of Scope

- Wave 14.6 GertsErrorResponse REMOVAL (separate v1.0.0 PR)
- Wave 15.D ApiController action-pipeline extraction
- v1.0.0 preparation coordination

## Related Artifacts

- EVID-067 (Wave 15 audit — §Doctor Strange #3, #4)
- EVID-068/069/070 (Wave 15.A/B/C precedents)

## Target Audience

- Maintainers of `@gertsai/api-core`
- Operators expecting `/moleculer` subpath to be side-effect-free
- v1.0.0 release coordinators



