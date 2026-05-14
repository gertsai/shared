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
  import OfflineBanner from '$lib/components/OfflineBanner.svelte';
  import { m } from '$lib/i18n';
  import type { LayoutData } from './$types';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Wave 10.A — paraglide tagged calls (cookie 'lang' > Accept-Language > 'en').
  const navLinks = [
    { href: '/', label: () => m.nav_link_home() },
    { href: '/ingest', label: () => m.nav_link_ingest() },
    { href: '/search', label: () => m.nav_link_search() },
    { href: '/docs', label: () => m.nav_link_docs() },
  ] as const;

  // Wave 10.B — auth-only nav entry; rendered only when `data.user` is set.
  // Kept out of `navLinks` so the SSR for anonymous users never emits the
  // markup (defence against NFR-1 flash-of-protected-content).
  const adminLink = { href: '/admin/content', label: () => m.nav_link_admin() } as const;

  function isActive(pathname: string, href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }
</script>

<div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
  <OfflineBanner />
  <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
    <div class="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-lg font-semibold text-slate-900 hover:text-blue-600 transition-colors">
        m9s-example <span class="text-slate-400 font-normal">· Wave 9</span>
      </a>
      <nav aria-label="Primary" class="flex items-center gap-4">
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
                {link.label()}
              </a>
            </li>
          {/each}
          {#if data?.user}
            <li>
              <a
                href={adminLink.href}
                data-testid="nav-link-admin"
                class="px-3 py-2 rounded-md text-sm font-medium transition-colors
                  {isActive($page.url.pathname, adminLink.href)
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-amber-700 hover:bg-amber-50 hover:text-amber-900'}"
                aria-current={isActive($page.url.pathname, adminLink.href) ? 'page' : undefined}
              >
                {adminLink.label()}
              </a>
            </li>
          {/if}
        </ul>
        {#if data?.user}
          <div class="flex items-center gap-2 border-l border-slate-200 pl-4" data-testid="auth-badge">
            <span class="text-xs text-slate-500" title={data.user.id}>{data.user.email}</span>
            <form method="POST" action="/logout?/default">
              <button
                type="submit"
                data-testid="logout-submit"
                class="text-xs text-slate-600 hover:text-rose-700 underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        {:else}
          <a
            href="/login"
            data-testid="login-link"
            class="text-xs text-blue-600 hover:text-blue-700 border-l border-slate-200 pl-4"
          >
            Sign in
          </a>
        {/if}
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
      <span>{m.footer_tagline()}</span>
      <span>{m.footer_meta()}</span>
    </div>
  </footer>
</div>
