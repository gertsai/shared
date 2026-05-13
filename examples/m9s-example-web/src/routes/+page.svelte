<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 9 home — hero + 3 stat cards. Stats are placeholders ("—") for Wave 9;
  Wave 10 wires real broker.call counts once the listing endpoint lands
  (deferred per PRD-016).
-->
<script lang="ts">
  import StatCard from '$lib/components/StatCard.svelte';
</script>

<section class="space-y-12">
  <!-- Hero -->
  <div class="space-y-6">
    <div class="space-y-3">
      <p class="text-xs font-semibold uppercase tracking-wider text-blue-600">Reference application</p>
      <h1 class="text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
        Full-stack <span class="text-blue-600">@gertsai/*</span> demo
      </h1>
      <p class="max-w-2xl text-lg text-slate-600">
        SvelteKit frontend + Moleculer backend, wired through an auto-generated OpenAPI 3.1
        contract. End-to-end typed: every request body, response shape, and error variant is
        validated by <code class="font-mono text-sm bg-slate-100 px-1.5 py-0.5 rounded">typia</code>
        and exposed via <code class="font-mono text-sm bg-slate-100 px-1.5 py-0.5 rounded">openapi-fetch</code>.
      </p>
    </div>
    <div class="flex flex-wrap gap-3">
      <a
        href="/ingest"
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
      >
        Ingest a document
      </a>
      <a
        href="/search"
        class="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 px-4 py-2 rounded-md font-medium transition-colors"
      >
        Run a search
      </a>
    </div>
  </div>

  <!-- Stat cards -->
  <div class="grid gap-4 md:grid-cols-3">
    <StatCard title="Total docs" value="—" subtitle="Wave 10 wires listing endpoint" />
    <StatCard title="Chunks indexed" value="—" subtitle="Embeddings via Ollama / pgvector" />
    <StatCard title="Last search" value="—" subtitle="Recorded per tenant" />
  </div>

  <!-- Wave map -->
  <div class="space-y-3">
    <h2 class="text-xl font-semibold text-slate-900">What's wired in this wave</h2>
    <ul class="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
      <li class="flex gap-2"><span class="text-blue-600">●</span> OpenAPI 3.1 contract auto-generated from typia types</li>
      <li class="flex gap-2"><span class="text-blue-600">●</span> Frontend typed via <code class="font-mono bg-slate-100 px-1 rounded">openapi-fetch</code></li>
      <li class="flex gap-2"><span class="text-blue-600">●</span> Ingest + search round-trip with vector similarity</li>
      <li class="flex gap-2"><span class="text-blue-600">●</span> Tenant scoping via <code class="font-mono bg-slate-100 px-1 rounded">X-Tenant-ID</code> header</li>
    </ul>
  </div>
</section>
