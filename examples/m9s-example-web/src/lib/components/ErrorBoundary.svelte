<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — visual error surface. SvelteKit handles thrown errors in
  load/action via the route's `+error.svelte`; this component is the visual
  primitive those error pages render. It is intentionally *not* a true
  catch-render-error boundary (Svelte 5 has no client-side equivalent of
  React's componentDidCatch), but the prop-driven shape lets callers pass
  whatever error they captured.

  Usage:
    <ErrorBoundary error={someError}>
      {#snippet children()}
        <p>Optional fallback body</p>
      {/snippet}
    </ErrorBoundary>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    error?: Error | string | null;
    title?: string;
    onRetry?: () => void;
    children?: Snippet;
  }

  let {
    error = null,
    title = 'Something went wrong',
    onRetry,
    children,
  }: Props = $props();

  const message = $derived(
    error instanceof Error ? error.message : typeof error === 'string' ? error : '',
  );

  function defaultRetry(): void {
    if (typeof location !== 'undefined') location.reload();
  }
</script>

<div
  role="alert"
  aria-live="assertive"
  data-testid="error-boundary"
  class="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 space-y-3"
>
  <h2 class="text-lg font-semibold">{title}</h2>
  {#if message}
    <p class="text-sm" data-testid="error-boundary-message">{message}</p>
  {/if}
  {#if children}
    <div class="text-sm">{@render children()}</div>
  {/if}
  <div class="flex flex-wrap gap-2 pt-1">
    <button
      type="button"
      onclick={onRetry ?? defaultRetry}
      class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
      data-testid="error-boundary-retry"
    >
      Retry
    </button>
  </div>
</div>
