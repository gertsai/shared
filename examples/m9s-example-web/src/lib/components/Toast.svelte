<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — feedback toast. Variants: success | error | info | warning | loading.
  Border-bg-text triad follows ADR-014 (Tailwind v4 + slate / accent palette).

  Behaviour:
    - `dismissible` (default true) shows an × close button.
    - Auto-close timer of `autoCloseMs` ms (default 5000) for non-loading
      variants. `loading` never auto-closes; caller is expected to swap to
      `success`/`error` once the in-flight work resolves.
    - Setting `message=''` hides the toast (Wave 9 behaviour preserved).
-->
<script lang="ts">
  type Variant = 'success' | 'error' | 'info' | 'warning' | 'loading';

  interface Props {
    variant: Variant;
    message: string;
    dismissible?: boolean;
    autoCloseMs?: number;
    onClose?: () => void;
  }

  let {
    variant,
    message,
    dismissible = true,
    autoCloseMs = 5000,
    onClose,
  }: Props = $props();

  let dismissed = $state(false);

  const tone: Record<Variant, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    loading: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  function close(): void {
    dismissed = true;
    onClose?.();
  }

  // Reset dismissed flag whenever a fresh message arrives so the same toast
  // instance can show successive results without the caller having to mount
  // a new component.
  $effect(() => {
    if (message) dismissed = false;
  });

  // Auto-close timer. `loading` never times out — the caller swaps variant.
  $effect(() => {
    if (!message || dismissed || variant === 'loading' || autoCloseMs <= 0) return;
    const handle = setTimeout(close, autoCloseMs);
    return () => clearTimeout(handle);
  });
</script>

{#if message && !dismissed}
  <div
    role="status"
    aria-live="polite"
    data-testid="toast-{variant}"
    class="flex items-start gap-3 rounded-md border px-4 py-3 text-sm font-medium {tone[variant]}"
  >
    {#if variant === 'loading'}
      <span aria-hidden="true" class="inline-block size-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent mt-0.5"></span>
    {/if}
    <span class="flex-1">{message}</span>
    {#if dismissible}
      <button
        type="button"
        aria-label="Dismiss"
        onclick={close}
        class="ml-2 -mr-1 rounded text-current/70 hover:text-current focus:outline-none focus:ring-2 focus:ring-current/30 px-1.5 leading-none"
      >×</button>
    {/if}
  </div>
{/if}
