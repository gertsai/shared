<!--
  SPDX-License-Identifier: Apache-2.0
  Success / error toast — surfaces form action feedback inline above the form.
  No timer / dismiss button; SvelteKit re-renders the form result on each
  navigation so the toast is naturally scoped to the latest submission.
-->
<script lang="ts">
  type Variant = 'success' | 'error';

  interface Props {
    variant: Variant;
    message: string;
  }

  let { variant, message }: Props = $props();
</script>

{#if message}
  <div
    role="status"
    aria-live="polite"
    data-testid="toast-{variant}"
    class="rounded-md border px-4 py-3 text-sm font-medium {variant === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-red-200 bg-red-50 text-red-800'}"
  >
    {message}
  </div>
{/if}
