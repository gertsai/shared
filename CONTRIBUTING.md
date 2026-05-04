# Contributing to gertsai/shared

Thanks for considering a contribution. This monorepo houses the OSS shared
infrastructure packages used across the gerts.ai ecosystem.

## Workflow

1. Fork or create a branch from `main`
2. Implement your change
3. Run locally:
   ```sh
   pnpm install
   pnpm build
   pnpm test
   ```
4. Create a changeset describing the change and bump:
   ```sh
   pnpm changeset
   ```
5. Open a PR. CI must be green to merge.
6. After merge to `main`, the release workflow auto-publishes to npm under
   the `@gertsai/*` scope.

## Local toolchain

- Node ≥ 22 LTS
- pnpm 10.x
- TypeScript 5.9+
- (Optional) [moonrepo](https://moonrepo.dev) — `pnpm dlx @moonrepo/cli` exposes
  task graph caching. The `pnpm` scripts work standalone.

## Adding a new package

1. Create `packages/<name>/` with:
   - `package.json` (`"name": "@gertsai/<name>"`, `"version": "0.0.0"`)
   - `tsconfig.json` (extends `../../tsconfig.base.json`)
   - `src/index.ts`
   - `README.md`
   - `LICENSE` (Apache 2.0)
2. Run `pnpm install` from root to wire workspace links.
3. Add a changeset for the initial release.

## License

By contributing, you agree your work is licensed under Apache 2.0
(see [LICENSE](./LICENSE)).
