<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-002) — Badge atom.

  Compact, non-interactive status pill. Variant strings imported from
  `./tokens.ts` (RFC-015 I-4). No focus ring (not focusable).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { badgeVariants, cn, type BadgeVariant } from './tokens';

  type BadgeSize = 'sm' | 'md';

  interface BadgeProps {
    variant?: BadgeVariant;
    size?: BadgeSize;
    children?: Snippet;
  }

  let { variant = 'neutral', size = 'sm', children }: BadgeProps = $props();

  const sizeClass: Record<BadgeSize, string> = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };
</script>

<span
  class={cn(
    'inline-flex items-center gap-1 rounded-full font-medium',
    sizeClass[size],
    badgeVariants[variant],
  )}
>
  {#if children}
    {@render children()}
  {/if}
</span>
