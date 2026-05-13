<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 9 root layout — sticky header with brand + 3 nav links (Ingest, Search,
  Docs), full-bleed slate-50 page surface, simple footer. Active route is
  highlighted from `$page.url.pathname` via the `nav-link` helper.
-->
<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';

  let { children }: { children: Snippet } = $props();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/ingest', label: 'Ingest' },
    { href: '/search', label: 'Search' },
    { href: '/docs', label: 'Docs' },
  ] as const;

  function isActive(pathname: string, href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }
</script>

<div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
  <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
    <div class="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-lg font-semibold text-slate-900 hover:text-blue-600 transition-colors">
        m9s-example <span class="text-slate-400 font-normal">· Wave 9</span>
      </a>
      <nav aria-label="Primary">
        <ul class="flex items-center gap-1">
          {#each navLinks as link (link.href)}
            <li>
              <a
                href={link.href}
                class="px-3 py-2 rounded-md text-sm font-medium transition-colors
                  {isActive($page.url.pathname, link.href)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}"
                aria-current={isActive($page.url.pathname, link.href) ? 'page' : undefined}
              >
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </div>
  </header>

  <main class="flex-1">
    <div class="mx-auto max-w-6xl px-6 py-8">
      {@render children()}
    </div>
  </main>

  <footer class="border-t border-slate-200 bg-white">
    <div class="mx-auto max-w-6xl px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
      <span>m9s-example reference · Apache 2.0</span>
      <span>tenant-acme · @gertsai/* monorepo</span>
    </div>
  </footer>
</div>
