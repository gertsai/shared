<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.B (PRD-019 FR-004) — admin/content list table.

  Renders a 5-column table (ID / preview / size / created / actions),
  drives pagination via `?skip=&limit=` query params, and submits Delete
  via a SvelteKit form-action POST. A native `window.confirm` interstitial
  guards against accidental deletion; the form is otherwise a plain
  hidden-input + submit pair so the server-side CSRF guard works without
  any client-side JS.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { m } from '$lib/i18n';
  import { Button, Toast } from '$lib/components/ui';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Lazy-build the dateformatter so SSR + browser both work. Uses the
  // user's runtime locale; CMS admin is internal so we don't gate this
  // on paraglide tag.
  const fmt = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  function formatCreated(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : fmt.format(d);
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function truncatePreview(preview: string, max = 80): string {
    if (preview.length <= max) return preview;
    return `${preview.slice(0, max).trimEnd()}…`;
  }

  function pageHref(nextSkip: number): string {
    const search = new URLSearchParams($page.url.searchParams);
    if (nextSkip <= 0) {
      search.delete('skip');
    } else {
      search.set('skip', String(nextSkip));
    }
    search.set('limit', String(data.limit));
    const qs = search.toString();
    return qs ? `?${qs}` : '/admin/content';
  }

  async function confirmAndSubmit(event: SubmitEvent): Promise<void> {
    if (!window.confirm(m.admin_content_delete_confirm())) {
      event.preventDefault();
      return;
    }
    // Let SvelteKit's enhanced form action take over; we don't preventDefault
    // here so the standard server-side flow runs (the action will re-render
    // the page with `form` populated).
  }

  // Pagination boundaries — derived so the template stays declarative.
  const skip = $derived(data.skip);
  const limit = $derived(data.limit);
  const total = $derived(data.total);
  const isFirstPage = $derived(skip <= 0);
  const isLastPage = $derived(skip + limit >= total);
  const pageNumber = $derived(Math.floor(skip / Math.max(1, limit)) + 1);
  const totalPages = $derived(Math.max(1, Math.ceil(total / Math.max(1, limit))));

  function goPrev(): void {
    void goto(pageHref(Math.max(0, skip - limit)));
  }
  function goNext(): void {
    void goto(pageHref(skip + limit));
  }
</script>

<section class="space-y-6">
  <header class="space-y-1">
    <h1 class="text-2xl font-bold text-slate-900">{m.admin_content_page_title()}</h1>
    <p class="text-sm text-slate-600">{m.admin_content_page_subtitle()}</p>
  </header>

  {#if data.loadError}
    <Toast variant="error" message={data.loadError} />
  {/if}
  {#if form?.deleted}
    <Toast
      variant="success"
      message={`${m.admin_content_delete_success()} (${form.docId})`}
    />
  {:else if form?.deleteError}
    <Toast variant="error" message={form.deleteError} />
  {/if}

  {#if data.items.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600"
      data-testid="admin-content-empty"
    >
      {m.admin_content_empty()}
    </div>
  {:else}
    <div class="overflow-x-auto rounded-md border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" class="px-3 py-2">{m.admin_content_table_id()}</th>
            <th scope="col" class="px-3 py-2">{m.admin_content_table_preview()}</th>
            <th scope="col" class="px-3 py-2">{m.admin_content_table_size()}</th>
            <th scope="col" class="px-3 py-2">{m.admin_content_table_created()}</th>
            <th scope="col" class="px-3 py-2 text-right">{m.admin_content_table_actions()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">
          {#each data.items as doc (doc.id)}
            <tr data-testid="admin-content-row" data-doc-id={doc.id}>
              <td class="px-3 py-2 font-mono text-xs text-slate-700">{doc.id}</td>
              <td class="px-3 py-2 text-slate-800">{truncatePreview(doc.preview)}</td>
              <td class="px-3 py-2 text-slate-600">{formatBytes(doc.bytes)}</td>
              <td class="px-3 py-2 text-slate-600">{formatCreated(doc.createdAt)}</td>
              <td class="px-3 py-2 text-right">
                <form method="POST" action="?/delete" onsubmit={confirmAndSubmit}>
                  <input type="hidden" name="docId" value={doc.id} />
                  <!-- Wave 11.A FR-006 — migrate Delete button to the Button primitive. -->
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    data-testid="admin-content-delete"
                  >
                    {m.admin_content_action_delete()}
                  </Button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <nav class="flex items-center justify-between text-sm" aria-label="Pagination">
      <span class="text-slate-600" data-testid="admin-pagination-position">
        {m.admin_pagination_position()} {pageNumber} / {totalPages} · {total}
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={goPrev}
          disabled={isFirstPage}
          data-testid="admin-pagination-prev"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {m.admin_pagination_prev()}
        </button>
        <button
          type="button"
          onclick={goNext}
          disabled={isLastPage}
          data-testid="admin-pagination-next"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {m.admin_pagination_next()}
        </button>
      </div>
    </nav>
  {/if}
</section>
