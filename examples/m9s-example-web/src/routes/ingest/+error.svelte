<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — per-route /ingest error page. Falls back to the global
  `+error.svelte` layout but keeps copy scoped to ingestion failures
  (validation, broker.call timeouts, Ollama-down, etc.).
-->
<script lang="ts">
  import { page } from '$app/stores';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';

  const status = $derived($page.status);
  const message = $derived($page.error?.message ?? 'Ingest pipeline failed');
  const requestId = $derived($page.error?.requestId);

  function reload(): void {
    if (typeof location !== 'undefined') location.reload();
  }
</script>

<section class="mx-auto max-w-xl py-12 space-y-5" data-testid="ingest-error-page">
  <p class="text-xs font-semibold uppercase tracking-wider text-red-600">Ingest · Error {status}</p>
  <h1 class="text-2xl font-bold text-slate-900">Document ingest failed</h1>
  <ErrorBoundary error={message} title="Pipeline error" onRetry={reload}>
    {#snippet children()}
      <p>Check that the backend and Ollama are running, then retry.</p>
      {#if requestId}
        <p class="text-xs text-red-700">Request ID: <code class="font-mono">{requestId}</code></p>
      {/if}
    {/snippet}
  </ErrorBoundary>
  <a href="/ingest" class="text-sm text-blue-600 hover:text-blue-700">← Back to ingest</a>
</section>
