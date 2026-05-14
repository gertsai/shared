---
depth: standard
id: PRD-020
kind: prd
last_modified_at: 2026-05-14T09:55:52.036409+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-019
  relation: based_on
status: active
title: 'Wave 10.C — design system slice: Storybook + 10 component primitives'
---

## Problem Statement

Wave 10.A (PRD-018) shipped foundation slices (auth + error + i18n) and Wave 10.B (PRD-019) shipped content slices (file upload + SSE + CMS admin). Components are now spread across `examples/m9s-example-web/src/lib/components/` (Toast, Skeleton, OfflineBanner, ErrorBoundary — 4 ad-hoc) and inline markup in `routes/**/+page.svelte` (form inputs, buttons, tables, modals via `confirm()`). For a production-grade reference application, the design system surface should be:

1. **Documented in Storybook** — `pnpm --filter @gertsai-examples/m9s-example-web storybook` opens a local docs site cataloguing every primitive with variants and a11y notes.
2. **Coherent API per primitive** — `<Button variant="primary" size="md" loading>` should work the same way across the app. No inline `class="bg-blue-600 hover:..."` ad-hoc styling.
3. **Accessible by default** — keyboard navigation, ARIA attributes, focus rings, color-contrast verified.
4. **Svelte 5 runes idiomatic** — `$props()`, `$state()`, `$bindable()`, `$derived()` used correctly; no Svelte 4 patterns.

This wave introduces a **design system layer** at `src/lib/components/ui/` (renamed from the flat `src/lib/components/`) with 10 production-grade primitives + Storybook stories. Existing call-sites in routes are migrated to consume the new primitives.

## Goals

1. Storybook 8.x (latest, Svelte 5 + SvelteKit 2 compatible) installed and runnable via `pnpm --filter @gertsai-examples/m9s-example-web storybook`. Default port 6006. Zero new TypeScript errors from Storybook config.
2. **10 primitive components** in `src/lib/components/ui/` (split: 5 atoms + 5 molecules per RFC-015) — each with: (a) typed `$props()` interface, (b) consistent variant + size enums, (c) Tailwind v4-based styling, (d) one `.stories.ts` file per primitive with ≥ 3 story variants.
3. All 4 existing ad-hoc components (`Toast`, `Skeleton`, `OfflineBanner`, `ErrorBoundary`) migrated to the new pattern (renamed/refactored to live alongside the new primitives); existing call-sites updated; total Wave 10.C LOC < 1500; **0 new ESLint errors**; **0 new svelte-check errors**; pre-existing 70/71 backend tests still pass.

## Target Audience

- **Primary:** developers building atop `m9s-example` who need a vetted starter design system rather than crafting their own — Storybook serves as the contract + docs.
- **Secondary:** Wave 10 /audit reviewer (task #63) — needs evidence of architectural coherence across primitives + a11y + Storybook integration.
- **Tertiary:** new internal contributors — Storybook is the discoverable surface that replaces "grep through routes to learn the component conventions."

## Functional Requirements

- [ ] **FR-001 — Storybook installation**: a developer can run `pnpm --filter @gertsai-examples/m9s-example-web storybook` and see a browser-rendered docs site at `http://localhost:6006`. Stories auto-discovered from `src/lib/components/ui/**/*.stories.ts`.
  - **Acceptance:** `pnpm --filter @gertsai-examples/m9s-example-web build-storybook` produces a static `storybook-static/` directory without errors.
- [ ] **FR-002 — 5 atom primitives (atoms)**: `Button`, `Input`, `Select`, `Badge`, `Spinner` each implement the standard primitive contract (typed props with `variant`, `size` where relevant, slots/snippets for children, accessibility annotations).
  - **Acceptance:** each atom has `<Component>.svelte` + `<Component>.stories.ts` with ≥ 3 stories; svelte-check 0 errors.
- [ ] **FR-003 — 5 molecule primitives (molecules)**: `Card`, `Modal`, `Table`, `Pagination`, `Toast` (refactored from existing) each implement the molecule contract (compose atoms, slot-driven content, optional bound state via `$bindable()`).
  - **Acceptance:** each molecule has `<Component>.svelte` + `<Component>.stories.ts` with ≥ 3 stories; Modal uses native `<dialog>` element for keyboard a11y (Esc to close).
- [ ] **FR-004 — Migration of existing ad-hoc components**: `Toast` is refactored into the new `ui/` layout (other 3 — `Skeleton`, `OfflineBanner`, `ErrorBoundary` — migrate too, but only `Toast` becomes a true primitive with variants).
  - **Acceptance:** all references in `routes/**/+page.svelte` updated to new import paths; svelte-check still 0 errors.
- [ ] **FR-005 — Call-site migration**: at least 3 routes use the new primitives (e.g., `/ingest` dropzone button → `<Button variant="primary">`; `/admin/content` table → `<Table>` + `<Pagination>`; `/login` form inputs → `<Input>`).
  - **Acceptance:** `git diff` shows replacements; visual smoke (manual or screenshot) confirms parity.
- [ ] **FR-006 — Design tokens centralised**: a `src/lib/components/ui/tokens.ts` exports the Tailwind classname maps used by primitives so future theming has a single touch-point.
  - **Acceptance:** every primitive imports variant classnames from `tokens.ts`; no hardcoded Tailwind class strings inside `*.svelte` `<script>` blocks.

## Non-Functional Requirements

**NFR-1 — Accessibility (WCAG 2.1 AA baseline)**
  - Every interactive primitive (Button, Input, Select, Modal, Pagination) has visible focus indicators (focus ring class).
  - All `<button>` elements have `type="button"` unless explicitly `type="submit"` (prevent accidental form submit).
  - `<Modal>` traps focus while open + restores focus on close.
  - Color contrast: text on backgrounds ≥ 4.5:1 (verify via Tailwind palette — `slate-700` on `white` = 9.4:1, OK).
  - All form inputs (`Input`, `Select`) accept and require a label via slot or prop.

**NFR-2 — Bundle size**
  - Per-primitive `*.svelte` ≤ 200 LOC each (forces composition over kitchen-sink components).
  - Storybook is `devDependency`-only; production build excludes it (Vite's tree-shake + SvelteKit's adapter handle this naturally).
  - Total new prod-shipped LOC ≤ 1500.

**NFR-3 — TypeScript strictness**
  - Every primitive exposes a `<ComponentName>Props` interface as the typed `$props()` parameter; consumers get autocomplete + type errors on misuse.
  - No `any` in primitive surfaces; if a slot/snippet requires generic typing, use `Snippet<T>` from Svelte.

**NFR-4 — Storybook configuration**
  - `.storybook/main.ts` framework: `@storybook/sveltekit`; addons: `@storybook/addon-essentials`, `@storybook/addon-a11y`, `@storybook/addon-interactions`.
  - Tailwind v4 import wired in `.storybook/preview.ts` so stories render with app styles.

**NFR-5 — i18n compatibility**
  - Primitives accept localised strings via slots/snippets — they don't bake-in English labels. The exception is `Pagination` which may expose `previousLabel` / `nextLabel` props (consumer passes `m.admin_pagination_prev()`).

**NFR-6 — Backward compatibility**
  - All existing routes continue to function during/after migration. The migration is performed as part of this wave; no feature flag needed.

## Stakeholders

- **Owner:** `@gertsai-examples/m9s-example-web` `src/lib/components/ui/` (NEW layer) + the 5 routes that consume migrated primitives.
- **Consumers:** developers using m9s-example-web as a SvelteKit + `@gertsai/*` starter template.
- **Reviewers:** Wave 10 /audit (task #63) — verifies a11y annotations, variant coverage, story completeness.

## Related Artifacts

- [[PRD-018]] / [[EVID-033]] — Wave 10.A foundation slices (existing Toast component refactored here).
- [[PRD-019]] / [[EVID-034]] — Wave 10.B content slices (Admin table + ingest form will be migrated to primitives).
- [[PRD-016]] — Wave 10 super-PRD; this PRD closes the design-system deferred slice.
- [[RFC-015]] — Wave 10.C 2-teammate strategy doc (this PRD's implementation plan).

## Out of Scope

- Visual regression tests (Chromatic / Percy) — Wave 10.D or later.
- Component-level unit tests via `@testing-library/svelte` — story-driven QA suffices for this slice.
- Dark mode / theme switcher — `tokens.ts` opens the door but theme toggle UX is deferred.
- Publishing primitives as a separate `@gertsai-ui/*` package — example-app-scoped only for this wave.
- Storybook on CI / GitHub Pages — local-dev only for this wave.
- Touch/swipe gestures on Mobile for Modal/Table — desktop-first only.





