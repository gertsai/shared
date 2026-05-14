---
depth: standard
id: RFC-015
kind: rfc
last_modified_at: 2026-05-14T09:58:09.335124+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-020
  relation: informs
status: active
title: Wave 10.C strategy — 2 parallel teammates (atoms + molecules) + Storybook scaffold
---

## Summary

Wave 10.C introduces a design system layer at `examples/m9s-example-web/src/lib/components/ui/` with 10 production-grade primitives (5 atoms + 5 molecules) documented via Storybook 8. Two parallel teammates with disjoint file ownership (atoms vs. molecules) ship ~1200 LOC total. Team-lead pre-seeds the Storybook scaffold + `tokens.ts` + the `ui/` directory skeleton + stub files to give both teammates a clean stage.

## Motivation

Three waves have shipped routes (`/`, `/ingest`, `/search`, `/docs`, `/login`, `/admin/content`) with inline-styled markup: every button is a raw `<button class="bg-blue-600 hover:bg-blue-700 …">`, every input restates the same Tailwind utility chain, every form-action wires its own confirm-modal via the browser's `confirm()` primitive. The cost of this drift is already visible:

1. **Visual inconsistency.** "Submit" on the login form, "Ingest" on the ingest form, and "Search" on the search form use three subtly different button styles. New routes inherit whichever copy-paste the developer reached for first.
2. **A11y debt.** No primitive enforces `type="button"` defaults, focus rings, or ARIA roles. Each route reinvents (or skips) these.
3. **Theming dead-end.** Tailwind class strings live inside every component — a future dark-mode or brand-color refresh would require touching dozens of files.
4. **Discoverability for downstream developers.** The PRD-016 mission is "reference application that external developers clone as a starter." Without Storybook, the contract is "read every route file to learn the component conventions." That fails the audience test.

This wave introduces the layer + the docs in one shot so the contract becomes self-documenting BEFORE the next behavioral wave adds more routes. Doing it after another wave of routes would multiply the migration surface.

The 2-teammate split is driven by CLAUDE.md's ~400 LOC/agent guideline: ~1200 LOC across 20 files exceeds single-agent context comfort. Atomic-design (atoms + molecules) is the natural disjoint partition since atoms are leaves and molecules compose them — no shared editing.

## Context

[[PRD-020]] requires a coherent component primitive surface to replace the ad-hoc inline styling currently in routes. Storybook + atomic-design split (atoms / molecules) is the proven pattern. Two teammates avoid context dilution while still keeping wave wall-time short.

- **Teammate A (atoms)** owns 5 small, leaf primitives (`Button`, `Input`, `Select`, `Badge`, `Spinner`) + their stories.
- **Teammate M (molecules)** owns 5 composite primitives (`Card`, `Modal`, `Table`, `Pagination`, `Toast` refactor) + their stories; consumes atoms as needed.

Team-lead handles the cross-cutting integration: Storybook install, `.storybook/` config, `tokens.ts`, and migrating 3+ route call-sites after teammates land their primitives.

## Proposed Direction

**2 parallel teammates, single wave, ~1200 LOC total.** Pre-seed strategy mirrors Wave 10.A/B: team-lead installs Storybook, writes `tokens.ts`, creates `ui/` directory with empty stub files (one per primitive) before parallel spawn. Teammates own their primitives outright; no shared-file conflict.

### File Ownership Map (wave-level enforcement)

| Path | Owner | Type | LOC est. |
|---|---|---|---|
| `examples/m9s-example-web/package.json` | team-lead pre-seed (Storybook devDeps) | MODIFY | +5 deps |
| `examples/m9s-example-web/.storybook/main.ts` | team-lead pre-seed | NEW | ~30 |
| `examples/m9s-example-web/.storybook/preview.ts` | team-lead pre-seed | NEW | ~25 |
| `examples/m9s-example-web/.storybook/tsconfig.json` | team-lead pre-seed | NEW | ~10 |
| `examples/m9s-example-web/src/lib/components/ui/tokens.ts` | team-lead pre-seed | NEW | ~80 |
| `examples/m9s-example-web/src/lib/components/ui/index.ts` | team-lead pre-seed (barrel) | NEW | ~15 |
| `examples/m9s-example-web/src/lib/components/ui/Button.svelte` | A | NEW | ~80 |
| `examples/m9s-example-web/src/lib/components/ui/Button.stories.ts` | A | NEW | ~70 |
| `examples/m9s-example-web/src/lib/components/ui/Input.svelte` | A | NEW | ~70 |
| `examples/m9s-example-web/src/lib/components/ui/Input.stories.ts` | A | NEW | ~60 |
| `examples/m9s-example-web/src/lib/components/ui/Select.svelte` | A | NEW | ~70 |
| `examples/m9s-example-web/src/lib/components/ui/Select.stories.ts` | A | NEW | ~60 |
| `examples/m9s-example-web/src/lib/components/ui/Badge.svelte` | A | NEW | ~40 |
| `examples/m9s-example-web/src/lib/components/ui/Badge.stories.ts` | A | NEW | ~50 |
| `examples/m9s-example-web/src/lib/components/ui/Spinner.svelte` | A | NEW | ~40 |
| `examples/m9s-example-web/src/lib/components/ui/Spinner.stories.ts` | A | NEW | ~40 |
| `examples/m9s-example-web/src/lib/components/ui/Card.svelte` | M | NEW | ~60 |
| `examples/m9s-example-web/src/lib/components/ui/Card.stories.ts` | M | NEW | ~60 |
| `examples/m9s-example-web/src/lib/components/ui/Modal.svelte` | M | NEW | ~120 |
| `examples/m9s-example-web/src/lib/components/ui/Modal.stories.ts` | M | NEW | ~70 |
| `examples/m9s-example-web/src/lib/components/ui/Table.svelte` | M | NEW | ~100 |
| `examples/m9s-example-web/src/lib/components/ui/Table.stories.ts` | M | NEW | ~70 |
| `examples/m9s-example-web/src/lib/components/ui/Pagination.svelte` | M | NEW | ~90 |
| `examples/m9s-example-web/src/lib/components/ui/Pagination.stories.ts` | M | NEW | ~60 |
| `examples/m9s-example-web/src/lib/components/ui/Toast.svelte` | M | NEW (refactor from old Toast) | ~80 |
| `examples/m9s-example-web/src/lib/components/ui/Toast.stories.ts` | M | NEW | ~60 |
| `examples/m9s-example-web/src/lib/components/Toast.svelte` | team-lead post-merge (re-export shim, then delete after migration) | DELETE | -73 |
| Route call-sites (login, ingest, admin/content) | team-lead post-merge | MODIFY | +50 |

**Total**: ~1500 LOC across 2 teammates + team-lead.

### Storybook 8 — Svelte 5 + SvelteKit 2 compatibility

Storybook 8 has native `@storybook/sveltekit` framework that handles Svelte 5 runes. Pin: `storybook@^8.5`, `@storybook/sveltekit@^8.5`, `@storybook/addon-essentials@^8.5`, `@storybook/addon-a11y@^8.5`, `@storybook/addon-interactions@^8.5`.

`.storybook/main.ts`:
```ts
import type { StorybookConfig } from '@storybook/sveltekit';
const config: StorybookConfig = {
  stories: ['../src/lib/components/ui/**/*.stories.ts'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y', '@storybook/addon-interactions'],
  framework: { name: '@storybook/sveltekit', options: {} },
};
export default config;
```

`.storybook/preview.ts`:
```ts
import '../src/app.css';
export const parameters = { layout: 'centered', a11y: { /* config */ } };
```

### Tokens shape

```ts
// tokens.ts — single touch-point for theming
export const buttonVariants = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-slate-200 hover:bg-slate-300 text-slate-900',
  destructive: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
} as const;

export const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
} as const;

// + badge variants, focusRing, etc.
```

## Implementation Phases

**Phase 1 — Pre-seed (team-lead, ~15 min)**
1. Install Storybook devDeps in `examples/m9s-example-web/package.json` (5 entries).
2. Write `.storybook/main.ts`, `.storybook/preview.ts`, `.storybook/tsconfig.json`.
3. Write `src/lib/components/ui/tokens.ts` with documented variant maps.
4. Write `src/lib/components/ui/index.ts` barrel with 10 re-exports.
5. Create empty stub `*.svelte` + `*.stories.ts` files for all 10 primitives (so teammates' typecheck stays green during work).

**Phase 2 — Parallel teammates (single wave, ~30-60 min wall-clock)**
- A, M spawn simultaneously via Agent calls.
- Each claims `PRD-020` with their own agent identity.
- Each fills their owned files; releases on completion.

**Phase 3 — Integration + migration (team-lead, ~10-15 min)**
- Run Storybook `pnpm storybook` to verify all 10 primitives render.
- Migrate ≥ 3 route call-sites to consume primitives:
  - `routes/login/+page.svelte` — form inputs → `<Input>`, submit → `<Button>`.
  - `routes/ingest/+page.svelte` — buttons in dropzone → `<Button>`.
  - `routes/(admin)/admin/content/+page.svelte` — table → `<Table>`, pagination → `<Pagination>`, delete button → `<Button variant="destructive">`.
- Delete `src/lib/components/Toast.svelte` (now in `ui/`); update all `import Toast from '$lib/components/Toast.svelte'` to `import { Toast } from '$lib/components/ui'`.
- Full smoke (tsc + svelte-check + lint + tests + Storybook build).

**Phase 4 — Evidence + activate**
- Create EVID-035 with structured fields.
- Link + activate PRD-020 / RFC-015 / EVID-035.

**Phase 5 — Commit + PR**
- Two commits: feat code + docs activate (proven Wave 10.A/B pattern).
- `gh pr create --base main`.

## Decisions

**D-1: Storybook 8 vs. 7 vs. Svelte's own histoire**
- Storybook 8 has the best Svelte 5 + SvelteKit 2 integration as of 2026; Histoire is leaner but less ecosystem support. Pick Storybook for the audit/training value.
- Pin to `^8.5` — current stable.

**D-2: Atomic-design split atoms vs. molecules**
- Atoms = no nested primitives; molecules = compose atoms or contain non-trivial logic (focus trap, table state, etc).
- 5 + 5 keeps each teammate's surface ~500 LOC.

**D-3: `ui/` namespace vs. flat `components/`**
- New namespace `src/lib/components/ui/` allows future categorisation (`ui/`, `feedback/`, `layout/`) without renames.
- Old flat `src/lib/components/` keeps `Skeleton`, `OfflineBanner`, `ErrorBoundary` (not refactored this wave — out of scope; they remain wave-9 layout primitives).

**D-4: Migration scope — Toast only**
- `Toast` is the only ad-hoc component that becomes a true primitive (variants in Wave 10.A already). The others (`Skeleton`, `OfflineBanner`, `ErrorBoundary`) stay where they are — they're SvelteKit layout fragments, not reusable UI atoms.

**D-5: Pre-seed stub files vs. let teammates create**
- Pre-seed stub files (empty `<script lang="ts">\n</script>\n<div></div>` for `*.svelte`, empty array for `*.stories.ts`). Reason: tsc + svelte-check would fail mid-wave if barrel index.ts references missing files. Pre-seed keeps gates green.

## Invariants

- **I-1**: No `@gertsai/*` package surface changes — only example-app code mutates.
- **I-2**: All Wave 9 + 10.A + 10.B routes continue to function with **zero behavioral change**.
- **I-3**: Every primitive has matching `<Name>.svelte` + `<Name>.stories.ts` pair — no orphan stories or undocumented primitives.
- **I-4**: `tokens.ts` is the single source of variant class strings; no hardcoded Tailwind class strings inside primitives' `<script>` blocks.
- **I-5**: `<Modal>` uses native `<dialog>` element for keyboard a11y — no custom focus-trap implementation.
- **I-6**: Old `$lib/components/Toast.svelte` deleted in same wave as primitive Toast is shipped (no dangling shim).

## Rollback Plan

If the wave introduces regressions after merge:

1. **Storybook-only revert**: `git revert -- '.storybook/' 'package.json' 'pnpm-lock.yaml'` removes Storybook scaffold while keeping the primitives in `ui/`. Primitives are tree-shakable — unused ones don't ship.
2. **Per-primitive revert**: each primitive lives in 2 files (component + stories). Drop ones causing issues; keep the rest.
3. **Full wave revert**: `git revert <merge-commit>` restores Wave 10.B surface; old `Toast.svelte` was preserved in the same commit so route call-sites snap back.

## Consequences

**Positive**
- Storybook docs become the canonical contract for primitives — discoverability ↑.
- Variant-driven styling stabilises the visual language; future routes don't reinvent buttons.
- a11y verifiable via `@storybook/addon-a11y` per story.
- Open path to publishing primitives as `@gertsai-ui/*` package in a future wave (out of scope here).

**Negative**
- ~5 new devDependencies + ~15 MB `node_modules` growth for Storybook.
- 10 primitives × 2 files each = 20 new files + 1 tokens + 3 storybook config + 1 barrel = 25 new files (LOC stays under 1500 per goal).
- Wave 10.C migration touches 3 route files — minor refactor risk.

**Mitigation**
- Storybook devDep-only; production bundle unaffected.
- Pre-seeded stubs keep typecheck green during teammate work.
- Migration commits are atomic per route file (easy revert per route).

## Alternatives Considered

**A-1: Histoire instead of Storybook**
- Rejected: smaller community, less audit coverage, fewer addons. Storybook is the industry default.

**A-2: Inline-styled primitives without tokens.ts**
- Rejected: scatters Tailwind class strings across components, breaks theming (NFR + I-4).

**A-3: Single mono-teammate**
- Rejected: ~1200 LOC + 20 files pushes single-agent context past CLAUDE.md's ~400 LOC guideline.

**A-4: Skip migration, ship primitives only**
- Rejected: leaves the value invisible — primitives must be consumed by ≥ 3 routes to prove they work (PRD-020 FR-005).

**A-5: Add visual regression tests via Chromatic**
- Rejected for this wave: requires Chromatic account + CI integration; out of scope per PRD-020. Tracked as backlog.

## Validation Plan

1. **Pre-flight**: team-lead reads `EVID-034` to confirm Wave 10.B state stable.
2. **Per-teammate**: each spawns with explicit "Follow CLAUDE.md project rules" + file-ownership table + tokens.ts contract.
3. **Smoke after teammates return**:
   - `pnpm --filter @gertsai-examples/m9s-example-web check` → 0 errors
   - `pnpm --filter @gertsai-examples/m9s-example-web build` → success
   - `pnpm --filter @gertsai-examples/m9s-example-web build-storybook` → static dir produced
   - `pnpm --filter @gertsai-examples/m9s-example test` → all green
4. **Manual**: open `pnpm --filter @gertsai-examples/m9s-example-web storybook`, visually inspect 10 primitives.
5. **Evidence**: EVID-035 records smoke + Storybook build + migration diffs.
6. **Activate**: after R_eff ≥ 0.5.

## Open Questions

- **Storybook tsconfig conflicts with SvelteKit tsconfig**: pin Storybook tsconfig to extend the SvelteKit one. Confirmed during pre-seed.
- **Storybook + Tailwind v4 preview**: Tailwind v4 uses Lightning CSS; ensure preview imports `app.css` directly.

## References

- [[PRD-020]] — this wave's requirements doc.
- [[PRD-018]] / [[EVID-033]] — Wave 10.A foundation slices (existing Toast).
- [[PRD-019]] / [[EVID-034]] — Wave 10.B content slices (Admin table to migrate).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel (no impact, just continuity).



