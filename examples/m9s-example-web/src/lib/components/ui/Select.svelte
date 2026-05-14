<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-002) — Select atom.

  Native `<select>` with the same `inputBase + sizes` styling family as Input
  for visual consistency. Variant strings imported from `./tokens.ts`
  (RFC-015 I-4).

  - `value` is $bindable() (Svelte 5 two-way binding).
  - `placeholder`, when provided, renders as a disabled, non-selectable first
    option (matches HTMLSelectElement convention).
-->
<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';

  import { cn, focusRing, inputBase, sizes, type Size } from './tokens';

  export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface SelectProps extends Omit<HTMLSelectAttributes, 'value' | 'size'> {
    value?: string;
    options: SelectOption[];
    size?: Size;
    label?: string;
    id?: string;
    name?: string;
    disabled?: boolean;
    required?: boolean;
    placeholder?: string;
  }

  let {
    value = $bindable(''),
    options,
    size = 'md',
    label,
    id,
    name,
    disabled = false,
    required = false,
    placeholder,
    ...rest
  }: SelectProps = $props();
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
  <select
    {id}
    {name}
    {disabled}
    {required}
    bind:value
    class={cn(inputBase, sizes[size], focusRing, 'appearance-none pr-8')}
    {...rest}
  >
    {#if placeholder}
      <option value="" disabled selected={!value}>{placeholder}</option>
    {/if}
    {#each options as opt (opt.value)}
      <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
    {/each}
  </select>
</div>
