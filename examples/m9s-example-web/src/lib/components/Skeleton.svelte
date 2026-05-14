<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — loading skeleton primitive. Renders `lines` stacked pulsing bars
  with the slate-200 palette per ADR-014. Used while async data is fetched on
  the client (loading states for SSR routes use SvelteKit `+loading.svelte`
  conventions; this component covers the in-component case).
-->
<script lang="ts">
  interface Props {
    lines?: number;
    height?: string;
    width?: string;
    class?: string;
  }

  let {
    lines = 3,
    height = '1rem',
    width = '100%',
    class: cls = '',
  }: Props = $props();

  // Render a small array of indices we can iterate with `{#each}` without
  // generating new keys on re-render (lines count is stable per usage).
  const items = $derived(Array.from({ length: Math.max(1, lines) }, (_, i) => i));
</script>

<div class="space-y-2 {cls}" data-testid="skeleton" aria-busy="true" aria-live="polite">
  {#each items as i (i)}
    <div
      class="bg-slate-200 animate-pulse rounded-md"
      style:height
      style:width={i === items.length - 1 && items.length > 1 ? `calc(${width} * 0.7)` : width}
    ></div>
  {/each}
</div>
