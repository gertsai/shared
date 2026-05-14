<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-003) — Card molecule.

  Surface:
    - Optional header (title + subtitle) — only renders if either is set.
    - Configurable padding (none | sm | md | lg).
    - Optional border (default true).
    - Children snippet for body content.
    - Optional footer snippet rendered in a separated section.

  All Tailwind classnames come from tokens.ts (RFC-015 I-4) where shared; a
  small local map covers Card-only padding scales.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from './tokens';

  type Padding = 'none' | 'sm' | 'md' | 'lg';

  interface CardProps {
    title?: string;
    subtitle?: string;
    padding?: Padding;
    bordered?: boolean;
    children?: Snippet;
    footer?: Snippet;
  }

  let {
    title,
    subtitle,
    padding = 'md',
    bordered = true,
    children,
    footer,
  }: CardProps = $props();

  // Card-specific padding scale (component-local; not a shared token).
  // reason: Tokens.sizes targets text-bearing primitives (button/input) —
  // a card body needs larger block padding than `sizes.md` provides.
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  } as const satisfies Record<Padding, string>;

  const bodyPad = $derived(paddings[padding]);
  const hasHeader = $derived(Boolean(title) || Boolean(subtitle));
</script>

<article
  data-testid="ui-card"
  class={cn(
    'bg-white rounded-lg shadow-sm',
    bordered && 'border border-slate-200',
  )}
>
  {#if hasHeader}
    <header class={cn('border-b border-slate-200', paddings[padding === 'none' ? 'sm' : padding])}>
      {#if title}
        <h3 class="text-base font-semibold text-slate-900">{title}</h3>
      {/if}
      {#if subtitle}
        <p class="text-sm text-slate-600 {title ? 'mt-1' : ''}">{subtitle}</p>
      {/if}
    </header>
  {/if}

  {#if children}
    <div class={bodyPad}>
      {@render children()}
    </div>
  {/if}

  {#if footer}
    <footer class={cn('border-t border-slate-200', paddings[padding === 'none' ? 'sm' : padding])}>
      {@render footer()}
    </footer>
  {/if}
</article>
