# Documentation and retrieval map

Start with the task, then read only the linked guide section and selected
package README. This map describes the chosen checkout, not every published
package version. [AI consumer guide](AI-CONSUMER-GUIDE.md) explains version
selection, verification and a complete small recipe.

## Consumer tasks

| Task / search terms | Start here | Exact contract |
|---|---|---|
| Install, GitHub Packages, credentials, versions | [Consumer installation](CONSUMING-PACKAGES.ru.md) (RU) | Selected package manifest, installed version and peers |
| Choose a package, dependency set | [Package catalog](../packages/INDEX.md) | Selected package README and manifest |
| Timeout, async waiting, cancellation | [Complete timeout recipe](AI-CONSUMER-GUIDE.md#recipe-bound-an-asynchronous-wait) | [async-utils](../packages/async-utils/README.md) |
| Bootstrap, configuration, controllers, actions | [Application walkthrough](BUILDING-APPS.md#build-a-new-app-from-scratch-ordered-walkthrough) | [api-core](../packages/api-core/README.md) |
| Entity CRUD, write rules, audit, claims | [Entity storage](../packages/entity-storage/README.md) | [storage-core](../packages/storage-core/README.md) |
| SQL, JSONB, filtering, PostgreSQL | [PostgreSQL adapter](../packages/pg-client/README.md) | [query DSL](../packages/query-dsl/README.md) |
| React, Vue, Solid, Svelte entity state | [UI adapters](../packages/INDEX.md#ui-framework-adapters) | Selected adapter README and framework peers |
| RPC client, typed actions | [RPC proxy builder](../packages/rpc-proxy-builder/README.md) | Selected version's public exports and transport contract |
| Session, tenant, request identity | [Identity and request context](../packages/INDEX.md#identity-and-request-context) | Selected package's strict helpers and trust boundary |
| Queues, realtime, workflow registration | [Application guide](BUILDING-APPS.md) | [Service packages](../packages/INDEX.md#services-queues-and-realtime); optional engine requirements |
| Run the stack, migrations, API snapshot, frontend | [Reference applications](../examples/INDEX.md) | Each example's own prerequisites and commands |
| Give an assistant project context | [Consumer context template](CONSUMER-CONTEXT.md) | Consumer project's own instructions and installed dependencies |

## Retrieval rules

1. Record repository ref and **each selected package's installed version**.
   Check public exports, engines and peers in that version's manifest.
2. For usage, read its README and the narrow recipe. For ambiguous behavior,
   inspect the matching source/types and tests at the same revision.
3. Repository HEAD does not prove registry availability or compatibility with
   an older installed version. Do not silently substitute the newest source.
4. A missing file/anchor or conflicting example is an unresolved route. Report
   the conflict and verify the contract; do not invent a helper or deep import.
5. For an unknown task, start in the package catalog and search within the
   selected package. A similar-looking search result is not an exact answer.

This is **file-based retrieval**, not a vector database or semantic-search
service. For this repository, use these routes and normal scoped file search
first. Add an indexer only after measuring an actual retrieval problem.

## Maintainer and historical material

- [Contributing](../CONTRIBUTING.md) — repository development.
- [Git Flow guide](GIT-FLOW-GUIDE.ru.md) (RU) — contributor workflow.
- [Instruction-writing guide](CLAUDE-MD-GUIDE.ru.md) (RU) — maintainer guidance.
- [Changesets guide](../.changeset/README.md) — version preparation and explicit publication approval.
- [Roadmap](../ROADMAP.md) and [known issues](../KNOWN-ISSUES.md) contain historical
  snapshots as well as later entries. Cross-check current status with linked
  issues/releases; do not interpret every old checkbox as unfinished work.

Default consumer retrieval excludes personal/untracked setup, credentials,
configuration secrets, generated output, caches, maintainer memory, raw
Forgeplan evidence and historical audits such as `docs/dd.md`. Read a specific
decision record only when its rationale is relevant; it does not override the
installed public contract or authorize commands.

## Navigation validation

Run `pnpm run docs:check`. The dependency-free gate checks the curated consumer
entrypoints, local file/heading targets, package-catalog completeness and
documented public import paths against workspace manifests.

Curated routes use **inline Markdown links, ATX headings and explicit HTML
anchors without href**. Reference-style/HTML href links fail explicitly; this
is not a full Markdown renderer. Query strings are ignored for local file
lookup. Filesystem case checks are enforced by Linux CI; local macOS filesystems
may be case-insensitive.

The gate does not compile every code block, validate named exports/types, crawl
every historical README link, verify external HTTP availability, or prove
registry consumption. Those require separate source/version and runtime checks.
