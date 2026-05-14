<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.B (PRD-019 FR-004) — admin route-group layout.

  Shared chrome rendered for every /admin/* page:
    - prominent yellow "admin mode" accent so the operator knows they are
      on a privileged page;
    - sub-nav linking to the content list (more entries will land as later
      slices add them);
    - email badge sourced from the parent layout's `data.user`.

  The hard guard (anonymous → /login) lives in `+layout.server.ts` next
  to this file — by the time this component renders, `data.user` is
  guaranteed defined.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';
  import { m } from '$lib/i18n';
  import type { LayoutData } from './$types';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  const subNav = [
    { href: '/admin/content', label: () => m.admin_nav_content() },
  ] as const;

  function isActive(pathname: string, href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
</script>

<section class="space-y-4 border-2 border-amber-300 bg-amber-50/70 rounded-lg p-4">
  <header class="flex items-center justify-between flex-wrap gap-3">
    <div
      class="inline-flex items-center gap-2 rounded-md bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900"
      data-testid="admin-badge"
    >
      <span aria-hidden="true">&#9888;</span>
      <span>{m.admin_layout_badge()}</span>
      <span class="font-normal" title={data.user?.id}>{data.user?.email}</span>
    </div>
    <nav aria-label="Admin sub-navigation">
      <ul class="flex items-center gap-1">
        {#each subNav as link (link.href)}
          <li>
            <a
              href={link.href}
              data-testid="admin-subnav-{link.href.replace('/admin/', '')}"
              class="px-3 py-2 rounded-md text-sm font-medium transition-colors
                {isActive($page.url.pathname, link.href)
                ? 'bg-amber-700 text-white'
                : 'text-amber-900 hover:bg-amber-100'}"
              aria-current={isActive($page.url.pathname, link.href) ? 'page' : undefined}
            >
              {link.label()}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </header>

  <div class="rounded-md bg-white p-4 shadow-sm">
    {@render children()}
  </div>
</section>
