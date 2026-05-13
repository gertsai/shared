<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — per-route /search error page. Scoped copy for query / vector
  search failures (empty embedding service, pgvector unreachable, etc.).
-->
<script lang="ts">
  import { page } from '$app/stores';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';

  const status = $derived($page.status);
  const message = $derived($page.error?.message ?? 'Search failed');
  const requestId = $derived($page.error?.requestId);

  function reload(): void {
    if (typeof location !== 'undefined') location.reload();
  }
</script>

<section class="mx-auto max-w-xl py-12 space-y-5" data-testid="search-error-page">
  <p class="text-xs font-semibold uppercase tracking-wider text-red-600">Search · Error {status}</p>
  <h1 class="text-2xl font-bold text-slate-900">Search request failed</h1>
  <ErrorBoundary error={message} title="Search error" onRetry={reload}>
    {#snippet children()}
      <p>Try a simpler query, or check that the embedding service is reachable.</p>
      {#if requestId}
        <p class="text-xs text-red-700">Request ID: <code class="font-mono">{requestId}</code></p>
      {/if}
    {/snippet}
  </ErrorBoundary>
  <a href="/search" class="text-sm text-blue-600 hover:text-blue-700">← Back to search</a>
</section>
