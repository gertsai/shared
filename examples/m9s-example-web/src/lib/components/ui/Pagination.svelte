<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-003) — Pagination molecule.

  Page navigation strip: Prev / Position / Next.

    - `page` is 0-indexed and $bindable so the parent can two-way bind.
    - `total` + `pageSize` derive the page count.
    - Labels are props (with English defaults) so callers wire i18n via
      paraglide messages — `previousLabel={m.admin_pagination_prev()}` etc.
    - `onChange` callback fires with the new page index when navigation
      happens. Idiomatic Svelte 5: callback prop, not custom event.

  Visual styling pulls Tailwind class strings from tokens.ts so a theme
  refresh stays a one-file change (RFC-015 I-4). Prev/Next render as
  native <button>s with the ghost variant + sm sizing for visual parity
  with what <Button variant="ghost" size="sm"> would produce — avoiding
  a cross-teammate coupling on the Button atom stub during the wave.
-->
<script lang="ts">
  import { buttonBase, buttonVariants, sizes, focusRing, cn } from './tokens';

  interface PaginationProps {
    total: number;
    pageSize: number;
    page?: number;
    previousLabel?: string;
    nextLabel?: string;
    positionLabel?: string;
    onChange?: (newPage: number) => void;
  }

  let {
    total,
    pageSize,
    page = $bindable(0),
    previousLabel = 'Previous',
    nextLabel = 'Next',
    positionLabel = 'Page',
    onChange,
  }: PaginationProps = $props();

  // Guard against zero/negative pageSize — division would explode.
  // reason: a pageSize of 0 indicates a misconfigured caller; clamp to 1
  // rather than throw so the UI still renders something sensible.
  const safePageSize = $derived(Math.max(1, pageSize));
  const totalPages = $derived(Math.max(1, Math.ceil(total / safePageSize)));
  const pageNumber = $derived(page + 1); // 1-indexed for display
  const isFirstPage = $derived(page <= 0);
  const isLastPage = $derived(page >= totalPages - 1);

  const navButtonClass = cn(buttonBase, buttonVariants.ghost, sizes.sm, focusRing);

  function goTo(next: number): void {
    const clamped = Math.min(Math.max(0, next), totalPages - 1);
    if (clamped === page) return;
    page = clamped;
    onChange?.(clamped);
  }

  function goPrev(): void {
    goTo(page - 1);
  }
  function goNext(): void {
    goTo(page + 1);
  }
</script>

<nav
  aria-label="Pagination"
  data-testid="ui-pagination"
  class="flex items-center justify-between gap-3 text-sm"
>
  <button
    type="button"
    class={navButtonClass}
    disabled={isFirstPage}
    onclick={goPrev}
    data-testid="ui-pagination-prev"
  >
    {previousLabel}
  </button>

  <span class="text-slate-600" data-testid="ui-pagination-position">
    {positionLabel} {pageNumber} / {totalPages} · {total}
  </span>

  <button
    type="button"
    class={navButtonClass}
    disabled={isLastPage}
    onclick={goNext}
    data-testid="ui-pagination-next"
  >
    {nextLabel}
  </button>
</nav>
