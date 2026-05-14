<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 9 home — hero + 3 stat cards. Stats are placeholders ("—") for Wave 9;
  Wave 10 wires real broker.call counts once the listing endpoint lands
  (deferred per PRD-016).
-->
<script lang="ts">
  import StatCard from '$lib/components/StatCard.svelte';
  import { m } from '$lib/i18n';
</script>

<section class="space-y-12">
  <!-- Hero -->
  <div class="space-y-6">
    <div class="space-y-3">
      <p class="text-xs font-semibold uppercase tracking-wider text-blue-600">{m.home_hero_eyebrow()}</p>
      <h1 class="text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
        {m.home_hero_title()}
      </h1>
      <p class="max-w-2xl text-lg text-slate-600">
        {m.home_hero_subtitle()}
      </p>
    </div>
    <div class="flex flex-wrap gap-3">
      <a
        href="/ingest"
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
      >
        {m.home_cta_ingest()}
      </a>
      <a
        href="/search"
        class="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 px-4 py-2 rounded-md font-medium transition-colors"
      >
        {m.home_cta_search()}
      </a>
    </div>
  </div>

  <!-- Stat cards -->
  <div class="grid gap-4 md:grid-cols-3">
    <StatCard title={m.home_stat_docs_title()} value="—" subtitle={m.home_stat_docs_subtitle()} />
    <StatCard title={m.home_stat_chunks_title()} value="—" subtitle={m.home_stat_chunks_subtitle()} />
    <StatCard title={m.home_stat_last_search_title()} value="—" subtitle={m.home_stat_last_search_subtitle()} />
  </div>

  <!-- Wave map -->
  <div class="space-y-3">
    <h2 class="text-xl font-semibold text-slate-900">{m.home_wavemap_heading()}</h2>
    <ul class="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
      <li class="flex gap-2"><span class="text-blue-600">●</span> {m.home_wavemap_item_openapi()}</li>
      <li class="flex gap-2"><span class="text-blue-600">●</span> {m.home_wavemap_item_typed_fetch()}</li>
      <li class="flex gap-2"><span class="text-blue-600">●</span> {m.home_wavemap_item_round_trip()}</li>
      <li class="flex gap-2"><span class="text-blue-600">●</span> {m.home_wavemap_item_tenant()}</li>
    </ul>
  </div>
</section>
