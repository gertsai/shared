<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — top sticky bar that surfaces a "you're offline" warning. Mounted
  once in `+layout.svelte`. Auto-shows when `navigator.onLine` flips to false,
  auto-hides on reconnect. "Retry" reloads the page (covers cases where the
  app already reconnected but a stale SSR snapshot is still rendered).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { initOfflineWatcher, offline } from '$lib/stores/offline';

  // Local mirror of the store so we can use `$state` semantics without
  // shipping the store to components that don't need it.
  let isOffline = $state(false);

  onMount(() => {
    const teardown = initOfflineWatcher();
    const unsub = offline.subscribe((v) => (isOffline = v));
    return () => {
      unsub();
      teardown();
    };
  });

  function retry(): void {
    if (typeof location !== 'undefined') location.reload();
  }
</script>

{#if isOffline}
  <div
    role="alert"
    aria-live="assertive"
    data-testid="offline-banner"
    class="sticky top-0 z-20 bg-amber-100 text-amber-900 border-b border-amber-300 transition"
  >
    <div class="mx-auto max-w-6xl px-6 py-2 flex items-center justify-between gap-4 text-sm font-medium">
      <span class="flex items-center gap-2">
        <span aria-hidden="true">⚠</span>
        <span>You are offline. Some features may not work until the connection is restored.</span>
      </span>
      <button
        type="button"
        onclick={retry}
        class="rounded-md border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-semibold hover:bg-amber-200 transition-colors"
      >
        Retry
      </button>
    </div>
  </div>
{/if}
