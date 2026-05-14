<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-002) — Button atom.

  Composes Tailwind class strings exclusively from `./tokens.ts` (RFC-015 I-4).
  Defaults to `type="button"` to prevent accidental form submission (NFR-1).

  - `loading` renders an inline <Spinner> and disables interaction.
  - `disabled` also disables, with the same disabled-cursor styling.
  - Pass-through HTML attrs forwarded to the underlying <button>.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  import Spinner from './Spinner.svelte';
  import {
    buttonBase,
    buttonVariants,
    cn,
    focusRing,
    sizes,
    type ButtonVariant,
    type Size,
  } from './tokens';

  interface ButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
    variant?: ButtonVariant;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    children?: Snippet;
    onclick?: (e: MouseEvent) => void;
  }

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    children,
    onclick,
    ...rest
  }: ButtonProps = $props();

  const spinnerSize = $derived(size === 'lg' ? 'md' : 'sm');
  const isDisabled = $derived(disabled || loading);
</script>

<button
  {type}
  disabled={isDisabled}
  aria-busy={loading || undefined}
  class={cn(
    buttonBase,
    sizes[size],
    buttonVariants[variant],
    focusRing,
    fullWidth && 'w-full',
  )}
  {onclick}
  {...rest}
>
  {#if loading}
    <Spinner size={spinnerSize} label="Loading" />
  {/if}
  {#if children}
    {@render children()}
  {/if}
</button>
