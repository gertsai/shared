---
depth: standard
id: EVID-035
kind: evidence
last_modified_at: 2026-05-14T10:11:02.377378+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-020
  relation: informs
- target: RFC-015
  relation: informs
status: active
title: Wave 10.C ship evidence — Storybook + 10 UI primitives + Toast migration — 2 teammates / check 1087-0-0 / storybook build OK
---

## Summary

Wave 10.C ships a design system layer at `examples/m9s-example-web/src/lib/components/ui/` with 10 production-grade primitives (5 atoms + 5 molecules) documented via Storybook 8.6, plus migration of the existing Toast component from the flat `components/` directory into the new namespace. Three routes (`/ingest`, `/search`, `/admin/content`) updated to import `Toast` from the new barrel. Two parallel teammates with disjoint file ownership shipped ~1300 LOC. All smoke gates green: svelte-check 1087 / 0 / 0, lint clean, Storybook static build success, 70/71 backend tests passing (1 pre-existing pg-vector read-only-FS infra flake, unrelated).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: internal-test-result + manual-verification

`congruence_level: CL3` because the smoke ran against this exact m9s-example-web target (same-target validation): the project's own `pnpm check`, ESLint workspace, `pnpm build-storybook`, and Vitest suite. R_eff contribution = max(0, 1.0 − 0.0) = 1.0.

## What was built

### Pre-seed by team-lead (`team-lead-wave-10-c/v1`, ~15 min)
- `examples/m9s-example-web/package.json` — added 5 Storybook devDeps (`storybook@^8.5`, `@storybook/sveltekit@^8.5`, `@storybook/svelte@^8.5`, `@storybook/addon-essentials@^8.5`, `@storybook/addon-a11y@^8.5`, `@storybook/addon-interactions@^8.5`) + 2 npm scripts (`storybook`, `build-storybook`).
- `.storybook/main.ts` — Storybook config: framework `@storybook/sveltekit`, 3 addons, auto-discover stories at `src/lib/components/ui/**/*.stories.@(ts|svelte)`.
- `.storybook/preview.ts` — imports `app.css` (Tailwind v4), 3 background themes (app/slate/dark), a11y addon enabled, layout: `centered`.
- `.storybook/tsconfig.json` — extends app tsconfig, includes `.stories.ts` + `.svelte`.
- `src/lib/components/ui/tokens.ts` — 5 token maps (`buttonVariants`, `sizes`, `badgeVariants`, `toastVariants`, focus/base helpers) + `cn()` compose helper. Per-file ~95 LOC.
- `src/lib/components/ui/index.ts` — barrel exporting 10 components + 4 typed token enums + 4 helpers.
- 10 stub files created via shell loop so teammates have clean stage and barrel imports don't break mid-wave.

### Slice A — atoms (teammate `m9s-ui-atoms-teammate/v1`)
- `Button.svelte` (65 LOC) — `variant` × 5 (`primary|secondary|destructive|ghost|outline`), `size` × 3, `type='button'` default per NFR-1, embedded `<Spinner>` when `loading`, `disabled || loading` → `<button disabled>`, `focusRing` applied. `aria-busy` on loading.
- `Input.svelte` (69 LOC) — `$bindable` value, label + error helper text, `aria-invalid` + `aria-describedby` when error set.
- `Select.svelte` (60 LOC) — native `<select bind:value>` styled identically to Input; placeholder = disabled first option.
- `Badge.svelte` (35 LOC) — 5 variants (`neutral|info|success|warning|danger`), non-interactive `<span>` (no focus ring).
- `Spinner.svelte` (40 LOC) — inline SVG with `animate-spin`, `role="status"` + `aria-label`, sizes `w-4|w-6|w-8`.
- Stories: 5 `.stories.ts` files with 4-10 variants each (Button 10, Input 8, Select 6, Badge 6, Spinner 4 = 34 stories total).

### Slice M — molecules (teammate `m9s-ui-molecules-teammate/v1`)
- `Card.svelte` (82 LOC) — header/body/footer slots, 4 padding scales, optional border.
- `Modal.svelte` (143 LOC) — **native `<dialog>`** per RFC-015 I-5, `$bindable open`, `$effect` syncs `showModal()/close()`, 4 sizes, configurable `closeOnOverlay` + `closeOnEscape`, backdrop click via `event.target === dialog`, free focus-restoration on close.
- `Table.svelte` (109 LOC) — Svelte 5 `generics="TRow extends Record<string, unknown>"`, columns map with optional `render(row) → string`, empty state, `rowActions?: Snippet<[TRow]>`.
- `Pagination.svelte` (97 LOC) — `$bindable page`, boundary-disabled buttons, i18n-friendly `previousLabel`/`nextLabel`/`positionLabel` props per NFR-5, `onChange` callback (Svelte 5 convention).
- `Toast.svelte` (96 LOC) — refactored from Wave 10.A, pulls `toastVariants` from tokens, added `dismissible` + `onDismiss`, `role="status"` for a11y.
- Stories: 5 `.stories.ts` files with 4-7 variants each (Card 5, Modal 5, Table 4, Pagination 5, Toast 7 = 26 stories total).

### Migration (team-lead post-teammate)
- 3 route imports updated: `routes/ingest/+page.svelte`, `routes/(admin)/admin/content/+page.svelte`, `routes/search/+page.svelte` — `import Toast from '$lib/components/Toast.svelte'` → `import { Toast } from '$lib/components/ui'`. This satisfies FR-005 (≥ 3 routes consume new primitives).
- `src/lib/components/Toast.svelte` (old, 73 LOC) **deleted** per RFC-015 I-6.
- `eslint.config.mjs` — added `**/storybook-static/**` to workspace ignores (generated bundles fail lint with foreign rule names).
- `src/lib/components/ui/Table.stories.ts` — added `as never` cast on 3 `columns` args (`// reason:` comment block) to handle Storybook's `Meta<typeof Component>` not capturing the `<TRow>` generic parameter.

### Storybook 8 + Svelte 5 + SvelteKit 2 compatibility

Both teammates settled on the **string-cast-as-Snippet** pattern for story args:
```ts
const textChildren = (label: string): Snippet => label as unknown as Snippet;
```
Documented in `Button.stories.ts` header. For richer content (icons, multi-line), future work should switch to `.stories.svelte` with `<Template>` blocks. Tracked in PRD-020 open questions.

## Smoke results (2026-05-14 ≈ 13:09 UTC)

| Gate | Command | Result |
|---|---|---|
| Web check | `pnpm --filter @gertsai-examples/m9s-example-web check` | **1087 files · 0 errors · 0 warnings** |
| Storybook build | `pnpm --filter @gertsai-examples/m9s-example-web build-storybook` | **Success** (storybook-static/ produced, ~7.6s wall-clock) |
| Workspace lint | `pnpm lint` (eslint --max-warnings 0) | **0 errors, 0 warnings** |
| Backend tests | `pnpm --filter @gertsai-examples/m9s-example test` | **70/71 PASS** (1 pre-existing `pg-vector` read-only FS infra flake) |

## Acceptance criteria status (PRD-020)

- [x] **FR-001** — Storybook installation + scripts wired (`pnpm storybook` / `pnpm build-storybook`); auto-discovery from `ui/**/*.stories.@(ts|svelte)`.
- [x] **FR-002** — 5 atom primitives (Button/Input/Select/Badge/Spinner) with typed props, variants, sizes, ≥3 stories each.
- [x] **FR-003** — 5 molecule primitives (Card/Modal/Table/Pagination/Toast) with typed props, native `<dialog>` for Modal, generic TRow for Table, ≥3 stories each.
- [x] **FR-004** — Toast migrated from `components/` → `ui/`; old file deleted (I-6).
- [x] **FR-005** — 3 routes consume new primitives (ingest, search, admin/content all import from `$lib/components/ui`).
- [x] **FR-006** — All variant/size class strings centralised in `tokens.ts`; no hardcoded Tailwind in `<script>` blocks.

All 6 NFRs verified in code (WCAG 2.1 AA focus rings, ≤200 LOC per primitive, TypeScript strict, Storybook config NFR-4, i18n-friendly Pagination props, backward-compat — Wave 9/10.A/10.B routes untouched).

## Non-trespass verification

- Teammate A's atom files (Button/Input/Select/Badge/Spinner + stories) untouched by teammate M.
- Teammate M's molecule files (Card/Modal/Table/Pagination/Toast + stories) untouched by teammate A.
- Old `src/lib/components/Toast.svelte` preserved during the wave; deleted only in team-lead Phase 3 (I-6).
- `tokens.ts` and `index.ts` (pre-seeded) untouched by teammates.
- `.storybook/` config (pre-seeded) untouched by teammates.
- Routes (`src/routes/**`) — only the 3 Toast imports modified by team-lead post-merge.

## R_eff (target ≥ 0.5)

```
R_eff = min(evidence_scores) = min(1.0 [supports CL3]) = 1.0
```

R_eff = 1.0 — well above the 0.5 activation gate.

## Backlog / out-of-scope (deferred)

- Replace remaining inline `<button>` / `<input>` markup with `<Button>` / `<Input>` across login, ingest, admin/content full surface — minimal migration shipped (Toast import × 3 routes); fuller migration tracked as Wave 10.D follow-up.
- Storybook story-driven a11y tests via `@storybook/test-runner` — out of scope for this wave, addon-a11y panel suffices.
- Visual regression (Chromatic / Percy) — backlog per PRD-020 out-of-scope.
- Switch atom stories from `.stories.ts` (text args) to `.stories.svelte` (`<Template>` blocks) for richer slots — open question per RFC-015.

## References

- [[PRD-020]] — Wave 10.C requirements doc.
- [[RFC-015]] — Wave 10.C 2-teammate strategy.
- [[PRD-018]] / [[EVID-033]] — Wave 10.A foundation (original Toast).
- [[PRD-019]] / [[EVID-034]] — Wave 10.B content slices (Admin table currently inline; future migration to `<Table>` primitive backlog).
- [[ADR-006]] — `@gertsai/errors` Shared Kernel (no impact, continuity only).




