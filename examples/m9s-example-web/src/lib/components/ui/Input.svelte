<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-002) — Input atom.

  Text-style form input with label + optional error helper. Variant class strings
  imported from `./tokens.ts` (RFC-015 I-4).

  - `value` is $bindable() for Svelte 5 two-way binding.
  - `error` overrides the default border + shows helper text below.
  - Label is associated via `for={id}` (a11y NFR-1).
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  import { cn, focusRing, inputBase, sizes, type Size } from './tokens';

  type InputType = 'text' | 'email' | 'password' | 'url' | 'search';

  interface InputProps extends Omit<HTMLInputAttributes, 'value' | 'size' | 'type'> {
    value?: string;
    type?: InputType;
    size?: Size;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    error?: string;
    label?: string;
    id?: string;
    name?: string;
    autocomplete?: HTMLInputAttributes['autocomplete'];
  }

  let {
    value = $bindable(''),
    type = 'text',
    size = 'md',
    placeholder,
    disabled = false,
    readonly = false,
    required = false,
    error,
    label,
    id,
    name,
    autocomplete,
    ...rest
  }: InputProps = $props();

  const helperId = $derived(id ? `${id}-error` : undefined);
</script>

<div class="w-full">
  {#if label}
    <label for={id} class="mb-1 block text-sm font-medium text-slate-700">
      {label}
      {#if required}
        <span aria-hidden="true" class="text-red-600">*</span>
      {/if}
    </label>
  {/if}
  <input
    {id}
    {name}
    {type}
    {placeholder}
    {disabled}
    {readonly}
    {required}
    {autocomplete}
    bind:value
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? helperId : undefined}
    class={cn(
      inputBase,
      sizes[size],
      focusRing,
      error && 'border-red-500 focus-visible:ring-red-500',
    )}
    {...rest}
  />
  {#if error}
    <p id={helperId} class="mt-1 text-xs text-red-600">{error}</p>
  {/if}
</div>
