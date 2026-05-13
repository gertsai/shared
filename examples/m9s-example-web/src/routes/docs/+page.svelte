<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 9 docs page — static list of demo documents. Wave 10 will replace
  the hardcoded list with a real backend listing endpoint
  (`GET /api/v1/docs`); the visual layout is intentionally kept stable so
  the swap is non-breaking.
-->
<script lang="ts">
  type DemoDoc = {
    docId: string;
    title: string;
    snippet: string;
    ingestedAt: string;
  };

  const demoDocs: DemoDoc[] = [
    {
      docId: 'demo-hex-arch',
      title: 'Hexagonal architecture in practice',
      snippet:
        'The core domain knows nothing about HTTP, databases, or queues. Ports declare what the core needs; adapters supply concrete implementations at the edge.',
      ingestedAt: '2026-05-12',
    },
    {
      docId: 'demo-cqrs',
      title: 'CQRS and read models',
      snippet:
        'Command and query responsibility segregation separates writes from reads, allowing each side to scale independently and use the storage shape best suited to its workload.',
      ingestedAt: '2026-05-12',
    },
    {
      docId: 'demo-event-sourcing',
      title: 'Event sourcing fundamentals',
      snippet:
        'Persist immutable domain events as the source of truth. Reconstruct current state by replaying the event stream; snapshots are an optimization, not a contract.',
      ingestedAt: '2026-05-11',
    },
    {
      docId: 'demo-saga',
      title: 'Saga orchestration vs choreography',
      snippet:
        'Orchestration centralizes the workflow in a coordinator; choreography distributes it across services reacting to events. Pick based on coupling and observability needs.',
      ingestedAt: '2026-05-11',
    },
    {
      docId: 'demo-otel',
      title: 'OpenTelemetry traces across services',
      snippet:
        'Propagate the W3C traceparent header across every hop — HTTP, message queue, RPC. A single trace id makes debugging distributed flows tractable.',
      ingestedAt: '2026-05-10',
    },
  ];
</script>

<section class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-3xl font-bold text-slate-900">Documents</h1>
    <p class="text-slate-600 max-w-2xl">
      Static demo list (Wave 9). The real listing endpoint
      (<code class="font-mono text-sm bg-slate-100 px-1.5 py-0.5 rounded">GET /api/v1/docs</code>)
      lands in Wave 10 — this page will swap its data source without visual changes.
    </p>
  </header>

  <ul class="grid gap-3 md:grid-cols-2">
    {#each demoDocs as doc (doc.docId)}
      <li class="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-2">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-base font-semibold text-slate-900">{doc.title}</h2>
          <span class="text-xs text-slate-400 font-mono">{doc.ingestedAt}</span>
        </div>
        <code class="block font-mono text-xs text-blue-700">{doc.docId}</code>
        <p class="text-sm text-slate-600">{doc.snippet}</p>
      </li>
    {/each}
  </ul>
</section>
