<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 9 ingest page — POST form with docId + text, server-driven submission
  via SvelteKit form actions. Result toast renders above the form on
  redirect-less response.
-->
<script lang="ts">
  import Toast from '$lib/components/Toast.svelte';
  import { m } from '$lib/i18n';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<section class="space-y-6 max-w-2xl">
  <header class="space-y-2">
    <h1 class="text-3xl font-bold text-slate-900">{m.ingest_page_title()}</h1>
    <p class="text-slate-600">{m.ingest_page_subtitle()}</p>
  </header>

  {#if form?.success}
    <Toast variant="success" message={`${m.ingest_success_toast()} (${form.docId})`} />
  {:else if form?.error}
    <Toast variant="error" message={form.error} />
  {/if}

  <form method="POST" action="?/default" class="space-y-4">
    <div class="space-y-1">
      <label for="docId" class="block text-sm font-medium text-slate-700">{m.ingest_form_doc_id_label()}</label>
      <input
        id="docId"
        name="docId"
        type="text"
        required
        placeholder="my-doc-001"
        value={form?.docId ?? ''}
        class="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p class="text-xs text-slate-500">{m.ingest_form_doc_id_hint()}</p>
    </div>

    <div class="space-y-1">
      <label for="text" class="block text-sm font-medium text-slate-700">{m.ingest_form_text_label()}</label>
      <textarea
        id="text"
        name="text"
        required
        rows="8"
        placeholder="Paste the document text here…"
        class="w-full border border-slate-300 rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      ></textarea>
    </div>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
      >
        {m.ingest_form_submit()}
      </button>
      <a href="/search" class="text-sm text-slate-600 hover:text-slate-900">
        {m.ingest_link_to_search()}
      </a>
    </div>
  </form>
</section>
