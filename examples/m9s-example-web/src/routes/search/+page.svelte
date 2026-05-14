<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 9 search page — query input + submit, results rendered as cards with
  docId, text snippet, and similarity score (0..1). Empty + error states
  share the same Toast component as ingest.
-->
<script lang="ts">
  import Toast from '$lib/components/Toast.svelte';
  import { m } from '$lib/i18n';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  const results = $derived(form?.results ?? []);
</script>

<section class="space-y-6">
  <header class="space-y-2 max-w-2xl">
    <h1 class="text-3xl font-bold text-slate-900">{m.search_page_title()}</h1>
    <p class="text-slate-600">{m.search_page_subtitle()}</p>
  </header>

  <form method="POST" action="?/default" class="space-y-3 max-w-2xl">
    <div class="space-y-1">
      <label for="query" class="block text-sm font-medium text-slate-700">{m.search_form_query_label()}</label>
      <div class="flex gap-2">
        <input
          id="query"
          name="query"
          type="text"
          required
          placeholder="hexagonal architecture"
          value={form?.query ?? ''}
          class="flex-1 border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          {m.search_form_submit()}
        </button>
      </div>
    </div>
  </form>

  {#if form?.error}
    <Toast variant="error" message={form.error} />
  {/if}

  {#if form?.success}
    {#if results.length === 0}
      <div class="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        {m.search_empty_state()} <span class="font-mono">{form.query}</span>
        <a href="/ingest" class="text-blue-600 underline">{m.nav_link_ingest()}</a>.
      </div>
    {:else}
      <div class="space-y-3">
        <h2 class="text-sm font-medium text-slate-500">
          {results.length}
          {results.length === 1 ? m.search_results_count_one() : m.search_results_count_many()}
          <span class="font-mono text-slate-900">{form.query}</span>
        </h2>
        <ul class="space-y-3" data-testid="search-results">
          {#each results as hit, idx (idx)}
            <li
              data-testid="search-result"
              class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
            >
              <div class="flex items-center justify-between gap-3 mb-2">
                <code class="font-mono text-sm font-semibold text-blue-700">{hit.docId}</code>
                <span class="text-xs font-medium text-slate-500">
                  {m.search_result_similarity_label()} <span class="text-slate-900 font-mono">{hit.similarity.toFixed(3)}</span>
                </span>
              </div>
              <p class="text-sm text-slate-700 whitespace-pre-wrap">{hit.text}</p>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</section>
