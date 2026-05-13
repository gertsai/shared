<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — per-route /docs error page. Static docs route rarely throws, but
  ships a tailored fallback for completeness with the other route error pages.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';

  const status = $derived($page.status);
  const message = $derived($page.error?.message ?? 'Documentation page failed to load');
  const requestId = $derived($page.error?.requestId);

  function reload(): void {
    if (typeof location !== 'undefined') location.reload();
  }
</script>

<section class="mx-auto max-w-xl py-12 space-y-5" data-testid="docs-error-page">
  <p class="text-xs font-semibold uppercase tracking-wider text-red-600">Docs · Error {status}</p>
  <h1 class="text-2xl font-bold text-slate-900">Docs page failed</h1>
  <ErrorBoundary error={message} title="Render error" onRetry={reload}>
    {#snippet children()}
      <p>This is usually transient. Refresh the page to retry.</p>
      {#if requestId}
        <p class="text-xs text-red-700">Request ID: <code class="font-mono">{requestId}</code></p>
      {/if}
    {/snippet}
  </ErrorBoundary>
  <a href="/" class="text-sm text-blue-600 hover:text-blue-700">← Back to home</a>
</section>
