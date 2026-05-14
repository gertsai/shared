<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-002) — Spinner atom.

  Accessible loading indicator. Uses Tailwind `animate-spin` on an inline SVG so
  the same primitive embeds inside Button (loading state) and standalone in
  pages waiting on async data.

  - `role="status"` + `aria-label` for screen-reader announcement.
  - No focus ring (not interactive).
-->
<script lang="ts">
  type SpinnerSize = 'sm' | 'md' | 'lg';

  interface SpinnerProps {
    size?: SpinnerSize;
    label?: string;
  }

  let { size = 'md', label = 'Loading' }: SpinnerProps = $props();

  const sizeClass: Record<SpinnerSize, string> = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };
</script>

<svg
  role="status"
  aria-label={label}
  class="animate-spin text-current {sizeClass[size]}"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <circle
    class="opacity-25"
    cx="12"
    cy="12"
    r="10"
    stroke="currentColor"
    stroke-width="4"
  ></circle>
  <path
    class="opacity-75"
    fill="currentColor"
    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
  ></path>
</svg>
