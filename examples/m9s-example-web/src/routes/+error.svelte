<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — global SvelteKit error page. SvelteKit renders this whenever a
  `load` / `action` throws or when an HTTP error is returned from any route
  that doesn't ship a more specific `+error.svelte`. Shows status code,
  user-safe message (from `handleError` hook), requestId for support, and
  retry / home CTAs.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';

  // `$page.error` carries the shape returned by `handleError` in
  // `src/hooks/error.ts`. The default `App.Error` interface is `{ message }`;
  // we extend it (see app.d.ts) to optionally include `code` + `requestId`.
  const status = $derived($page.status);
  const message = $derived($page.error?.message ?? 'An unexpected error occurred');
  const code = $derived($page.error?.code);
  const requestId = $derived($page.error?.requestId);

  function reload(): void {
    if (typeof location !== 'undefined') location.reload();
  }
  function home(): void {
    void goto('/');
  }
</script>

<section class="mx-auto max-w-2xl py-16 space-y-6" data-testid="error-page">
  <div class="space-y-2">
    <p class="text-xs font-semibold uppercase tracking-wider text-red-600" data-testid="error-status">
      Error {status}
    </p>
    <h1 class="text-3xl font-bold text-slate-900">
      {#if status === 404}Page not found{:else}Something went wrong{/if}
    </h1>
  </div>

  <ErrorBoundary error={message} title={status === 404 ? 'Not found' : 'Server error'} onRetry={reload}>
    {#snippet children()}
      {#if code}
        <p>Code: <code class="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-red-200">{code}</code></p>
      {/if}
      {#if requestId}
        <p class="text-xs text-red-700">
          Request ID: <code class="font-mono">{requestId}</code>
        </p>
      {/if}
    {/snippet}
  </ErrorBoundary>

  <div class="flex flex-wrap gap-2">
    <button
      type="button"
      onclick={home}
      class="rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium transition-colors"
      data-testid="error-home"
    >
      Back to home
    </button>
  </div>
</section>
