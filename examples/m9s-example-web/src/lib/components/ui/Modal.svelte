<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-003) — Modal molecule.

  Uses the native <dialog> element (RFC-015 I-5) to inherit:
    - browser-supplied focus trap,
    - Esc key handling,
    - `inert` semantics for background tree,
    - top-layer rendering (no z-index war).

  Surface:
    - `open` is $bindable so the consumer can two-way bind it.
    - `closeOnOverlay` / `closeOnEscape` toggle native behaviours (we cancel
      the `cancel` event when `closeOnEscape` is false to suppress Esc).
    - Backdrop click closes only when the click lands directly on the
      <dialog> backdrop (event.target === dialog) — clicking the dialog's
      inner content has target = a child element.

  A11y:
    - aria-labelledby points to the title id when a title is set.
    - aria-describedby points to the description id when one is set.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from './tokens';

  type Size = 'sm' | 'md' | 'lg' | 'xl';

  interface ModalProps {
    open?: boolean;
    title?: string;
    description?: string;
    size?: Size;
    closeOnOverlay?: boolean;
    closeOnEscape?: boolean;
    children?: Snippet;
    footer?: Snippet;
    onClose?: () => void;
  }

  let {
    open = $bindable(false),
    title,
    description,
    size = 'md',
    closeOnOverlay = true,
    closeOnEscape = true,
    children,
    footer,
    onClose,
  }: ModalProps = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  // Each instance gets unique ids so multiple modals can coexist without
  // colliding aria-labelledby targets.
  // reason: $props.id() is not stable in Svelte 5 SSR — generate once.
  const uid = Math.random().toString(36).slice(2, 10);
  const titleId = `modal-title-${uid}`;
  const descId = `modal-desc-${uid}`;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  } as const satisfies Record<Size, string>;

  // Sync `open` prop -> dialog imperative API.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function handleClose(): void {
    open = false;
    onClose?.();
  }

  // Browser fires `cancel` on Esc; intercept to honour closeOnEscape.
  function handleCancel(event: Event): void {
    if (!closeOnEscape) {
      event.preventDefault();
    }
  }

  // Backdrop click — fires when user clicks the ::backdrop pseudo of the
  // <dialog>. event.target === dialog in that case (the dialog's content
  // sits inside an inner wrapper, so its clicks have a deeper target).
  function handleBackdropClick(event: MouseEvent): void {
    if (!closeOnOverlay) return;
    if (event.target === dialog) {
      handleClose();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  data-testid="ui-modal"
  aria-labelledby={title ? titleId : undefined}
  aria-describedby={description ? descId : undefined}
  onclose={handleClose}
  oncancel={handleCancel}
  onclick={handleBackdropClick}
  class={cn(
    'p-0 rounded-lg shadow-xl border border-slate-200 bg-white w-full',
    'backdrop:bg-slate-900/50',
    sizes[size],
  )}
>
  <div class="flex flex-col max-h-[85vh]">
    {#if title || description}
      <header class="px-5 py-4 border-b border-slate-200">
        {#if title}
          <h2 id={titleId} class="text-lg font-semibold text-slate-900">{title}</h2>
        {/if}
        {#if description}
          <p id={descId} class="text-sm text-slate-600 {title ? 'mt-1' : ''}">
            {description}
          </p>
        {/if}
      </header>
    {/if}

    {#if children}
      <div class="px-5 py-4 overflow-y-auto flex-1 text-sm text-slate-700">
        {@render children()}
      </div>
    {/if}

    {#if footer}
      <footer class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
        {@render footer()}
      </footer>
    {/if}
  </div>
</dialog>
