<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-003) — Toast molecule (refactored from Wave 10.A
  `$lib/components/Toast.svelte` — original kept intact this wave, deleted
  by team-lead post-migration per I-6).

  Surface delta vs. Wave 10.A Toast:
    - Variants now flow through tokens.ts (`toastVariants` — RFC-015 I-4) —
      single source of truth. `loading` variant relocated into the same
      classname map (was Wave-10.A-local).
    - Auto-close timer kept (was useful behaviour) with same defaults.
    - `onDismiss` is the canonical close callback (renamed from `onClose`
      to match PRD-020 FR-003 contract).
    - Outer wrapper is `<div role="status" aria-live="polite">` so screen
      readers announce changes.
-->
<script lang="ts">
  import { toastVariants, type ToastVariant, cn } from './tokens';

  // Loading is a Toast-specific variant kept here (not in shared tokens —
  // it isn't a colour theme, it's a control mode). The base classes still
  // come from `toastVariants.neutral`; loading just toggles the spinner.
  type Variant = ToastVariant | 'loading';

  interface ToastProps {
    variant?: Variant;
    message: string;
    dismissible?: boolean;
    autoCloseMs?: number;
    onDismiss?: () => void;
  }

  let {
    variant = 'info',
    message,
    dismissible = true,
    autoCloseMs = 5000,
    onDismiss,
  }: ToastProps = $props();

  let dismissed = $state(false);

  function close(): void {
    dismissed = true;
    onDismiss?.();
  }

  // Reset dismissed flag when a fresh message arrives — same component
  // instance can show successive results without remount.
  $effect(() => {
    if (message) dismissed = false;
  });

  // Auto-close timer. `loading` never times out — the caller swaps variant
  // once async work resolves.
  $effect(() => {
    if (!message || dismissed || variant === 'loading' || autoCloseMs <= 0) return;
    const handle = setTimeout(close, autoCloseMs);
    return () => clearTimeout(handle);
  });

  // Map `loading` variant to the neutral palette; everything else hits
  // `toastVariants` directly. reason: `loading` is a runtime mode flag,
  // not a colour token, so it doesn't live in tokens.ts.
  const toneClass = $derived(
    variant === 'loading' ? toastVariants.neutral : toastVariants[variant],
  );
</script>

{#if message && !dismissed}
  <div
    role="status"
    aria-live="polite"
    data-testid="ui-toast-{variant}"
    class={cn(
      'flex items-start gap-3 rounded-md border px-4 py-3 text-sm font-medium',
      toneClass,
    )}
  >
    {#if variant === 'loading'}
      <span
        aria-hidden="true"
        class="mt-0.5 inline-block size-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
      ></span>
    {/if}
    <span class="flex-1">{message}</span>
    {#if dismissible}
      <button
        type="button"
        aria-label="Dismiss"
        onclick={close}
        class="ml-2 -mr-1 px-1.5 leading-none rounded text-current/70 hover:text-current focus:outline-none focus:ring-2 focus:ring-current/30"
      >×</button>
    {/if}
  </div>
{/if}
