# @gertsai/shared

Shared OSS infrastructure packages for the **gerts.ai** ecosystem.

Apache 2.0 licensed npm packages under `@gertsai/*`, currently distributed through GitHub Packages.

## Documentation

- [Use these packages with an AI assistant](./guides/AI-CONSUMER-GUIDE.md) — version-aware retrieval, a complete small recipe and verification boundaries.
- [Guides and task-based retrieval map](./guides/INDEX.md) — find the smallest relevant set of files.
- [Package catalog](./packages/INDEX.md) — all package READMEs, grouped by task.
- [Install in another project](./guides/CONSUMING-PACKAGES.ru.md) — registry access, versions and required peers (Russian).
- [Build an application](./guides/BUILDING-APPS.md) — composition patterns and linked references/templates.
- [Reference applications](./examples/INDEX.md) — backend, API snapshot and frontend.

Package versions are independent. A source checkout, a GitHub release and an
installed registry artifact are different sources of evidence; verify the
selected package version before copying an example. Maintainer history and
personal configuration are not consumer instructions.

## Reference applications

End-to-end examples wiring the packages above into runnable apps. Useful for
adopters who want a working starting point rather than a snippet.

| Path | Purpose |
|---|---|
| [`examples/m9s-example`](./examples/m9s-example) | Moleculer broker with hex layering, Wave 5–8 composition facade, real-infra Postgres + pgvector + OpenFGA + Redis + Ollama (Sprint 3.11). |
| [`examples/m9s-example-api-types`](./examples/m9s-example-api-types) | Hand-aligned API contract snapshot shared by the backend and web example. |
| [`examples/m9s-example-web`](./examples/m9s-example-web) | SvelteKit 2 + Svelte 5 + Tailwind v4 + `openapi-fetch` frontend for m9s-example (Wave 9). |

The backend, hand-aligned API snapshot and web example demonstrate the shared
contract boundary. Update the snapshot explicitly when the backend contract
changes, then typecheck consumers; do not assume automatic schema generation.
See the [snapshot update instructions](./examples/m9s-example-api-types/README.md)
and [ADR-014](./.forgeplan/adrs/ADR-014-sveltekit-2-openapi-fetch-as-the-full-stack-reference-pattern-for-gertsai-example-applications.md)
for the framework choice rationale.

## Install

> Packages currently publish to **GitHub Packages**. Visibility is configured
> separately in GitHub; public npm publication requires an intentional registry
> and authentication migration. See [Publishing](#publishing).

### From GitHub Packages (current registry)

Use a **classic** GitHub Personal Access Token with `read:packages` and permission
to read the selected packages. Inject it as `NODE_AUTH_TOKEN` from your secret
manager; do not paste it into commands, files, logs or AI chat.

Commit only the placeholder configuration in the consumer project's `.npmrc`:

```ini
@gertsai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Select an available exact version and its peers before installing. See the
[consumer guide](./guides/CONSUMING-PACKAGES.ru.md) for local/Actions access,
SSO, version selection and troubleshooting. Installing does not require
publish or delete permissions.

### From public npm (when published)

Once we flip to public npm release, the GitHub Packages step disappears —
just `pnpm add @gertsai/<package>` works from any machine.

## Publishing

This monorepo uses Changesets to version public packages independently. The
current registry is **GitHub Packages**; setting Changesets `access` to `public`
does not make a GitHub package publicly visible. Package visibility is
configured separately. Moving to public npm requires a separate intentional
registry and authentication change and has not been performed.

Contributors add changesets for consumer-facing package changes. After merge to
`main`, the release bot opens or updates a version PR; maintainers review its
generated versions and changelogs and require CI before merging. Merging that
PR prepares versions but does **not** publish them. Run the guarded workflow
from `main` in read-only `PREVIEW` mode first. Publishing then requires owner
approval of the exact listed versions, the preview plan SHA-256 and the tested
`main` commit. The publisher uses only tarballs packed from that approved plan.

See the [Changesets guide](./.changeset/README.md) for bump selection, review
and verification commands, the explicit publish gate, and partial-publish
recovery.

## Develop

```sh
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

## License

[Apache-2.0](./LICENSE) © gerts.ai
