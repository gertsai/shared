<!--
  SPDX-License-Identifier: Apache-2.0
  Reusable stat card — minimal card with title, large value, and subtitle.
  Used on the home page to surface ingest / search aggregates.
-->
<script lang="ts">
  interface Props {
    title: string;
    value: string;
    subtitle?: string;
  }

  let { title, value, subtitle = '' }: Props = $props();
</script>

<div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
  <div class="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</div>
  <div class="mt-2 text-3xl font-bold text-slate-900">{value}</div>
  {#if subtitle}
    <div class="mt-1 text-sm text-slate-500">{subtitle}</div>
  {/if}
</div>
