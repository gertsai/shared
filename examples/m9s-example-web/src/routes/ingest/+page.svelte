<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 9 ingest page — POST form with docId + text, server-driven submission
  via SvelteKit form actions. Result toast renders above the form on
  redirect-less response.

  Wave 10.B — pre-seeded for 3-teammate parallel execution:
    F (file-upload):  fills DROPZONE region (script + markup + upload XHR).
    S (sse-streaming): fills STATUS-PANEL region (script + EventSource subscription).
  Both teammates touch THIS file at disjoint marker comments below.
-->
<script lang="ts">
  import Toast from '$lib/components/Toast.svelte';
  import { m } from '$lib/i18n';
  import type { ActionData } from './$types';
  // WAVE-10-B/F:SCRIPT-IMPORTS — file-upload teammate adds XHR/SSE helpers here.
  import { setLastUpload } from '$lib/stores/upload';
  // WAVE-10-B/S:SCRIPT-IMPORTS — sse-streaming teammate adds EventSource client here.
  import { openSse, type SseEvent } from '$lib/sse-client';
  import { lastUpload } from '$lib/stores/upload';

  let { form }: { form: ActionData } = $props();
  // WAVE-10-B/F:STATE — file-upload teammate adds dropzone state + progress runes.
  // Dropzone + XHR progress state. `uploadProgress=null` means "no upload
  // in flight"; 0..100 means "uploading"; 100 stays briefly until onload.
  let dropzoneActive = $state(false);
  let uploadProgress = $state<number | null>(null);
  let uploadError = $state<string | null>(null);
  let uploadSuccess = $state<string | null>(null);
  let fileInputEl: HTMLInputElement | undefined = $state();

  // Client-side caps mirror the server (multipart-parser.ts MAX_UPLOAD_BYTES
  // = 10 MiB). The server is authoritative — these are UX-only.
  const MAX_BYTES = 10 * 1024 * 1024;
  const ACCEPTED_MIME = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

  function pickFile(): void {
    if (uploadProgress !== null) return;
    fileInputEl?.click();
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    dropzoneActive = true;
  }
  function handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    dropzoneActive = false;
  }
  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dropzoneActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) void startUpload(file);
  }
  function handleFileChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    if (file) void startUpload(file);
    // Reset so the same file can be picked twice in a row.
    target.value = '';
  }

  async function startUpload(file: File): Promise<void> {
    uploadError = null;
    uploadSuccess = null;
    if (file.size > MAX_BYTES) {
      uploadError = m.upload_validation_too_large();
      return;
    }
    // Allow empty mime (some OSes don't tag .md) — fall back to extension check.
    const mimeOk = file.type === '' || ACCEPTED_MIME.has(file.type);
    const extOk = /\.(txt|md)$/i.test(file.name);
    if (!mimeOk || !extOk) {
      uploadError = m.upload_validation_wrong_type();
      return;
    }

    // Use XMLHttpRequest specifically because `fetch` cannot emit upload
    // progress events (no readable ProgressEvent on the upload side as of
    // 2026 — RFC-014 confirms this trade-off).
    uploadProgress = 0;
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e: ProgressEvent): void => {
      if (e.lengthComputable && e.total > 0) {
        uploadProgress = Math.round((e.loaded / e.total) * 100);
      }
    };
    xhr.onload = (): void => {
      uploadProgress = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { data?: { docId?: string; bytes?: number } };
          const docId = body?.data?.docId;
          const bytes = body?.data?.bytes ?? file.size;
          if (typeof docId === 'string' && docId.length > 0) {
            setLastUpload({ docId, bytes });
            uploadSuccess = `${m.upload_success_toast()} (${docId})`;
            return;
          }
        } catch {
          // fall through to generic error below
        }
        uploadError = m.upload_error_network();
      } else if (xhr.status === 413) {
        uploadError = m.upload_validation_too_large();
      } else {
        uploadError = m.upload_error_network();
      }
    };
    xhr.onerror = (): void => {
      uploadProgress = null;
      uploadError = m.upload_error_network();
    };
    xhr.onabort = (): void => {
      uploadProgress = null;
      uploadError = m.upload_error_network();
    };

    const fd = new FormData();
    fd.append('file', file, file.name);
    xhr.open('POST', '/api/v1/ingest/upload');
    xhr.send(fd);
  }
  // WAVE-10-B/S:STATE — sse-streaming teammate adds events[] + connection state runes.
  let sseEvents = $state<SseEvent[]>([]);
  let sseConnected = $state(false);
  // Active stream marker so unrelated reactive updates don't tear down +
  // re-open the EventSource while the same upload is still streaming.
  // Declared as `$state` because the template reads it (Svelte 5 reactive
  // rule — non-`$state` writes from script body would still work, but the
  // panel header binds to it for the "connection lost" hint).
  let activeDocId = $state<string | null>(null);

  // SSE lifecycle bound to the upload store:
  //   - When the store publishes a new docId, open a stream and reset the
  //     events list (each upload renders an independent timeline).
  //   - $effect cleanup closes the EventSource on unmount, on docId change,
  //     and after terminal `done`/`error` frames (via onClose). The
  //     `closeOnce` flag inside `openSse` makes the teardown idempotent,
  //     so cleanup + onClose firing in any order is safe.
  $effect(() => {
    const upload = $lastUpload;
    const docId = upload?.docId ?? null;
    if (!docId || docId === activeDocId) return;

    activeDocId = docId;
    sseEvents = [];
    sseConnected = true;
    const close = openSse(docId, {
      onEvent: (event: SseEvent) => {
        sseEvents = [...sseEvents, event];
      },
      onClose: () => {
        sseConnected = false;
      },
    });
    return () => {
      close();
    };
  });

  /** Format an absolute ts as a relative "Ns ago" string for panel rows. */
  function formatRelative(ts: number): string {
    const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (seconds <= 0) return 'now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  /** i18n key dispatch for the lifecycle kinds — exhaustive over `SseEventKind`. */
  function eventLabel(kind: SseEvent['kind']): string {
    switch (kind) {
      case 'started':
        return m.sse_event_started();
      case 'embedding':
        return m.sse_event_embedding();
      case 'persisted':
        return m.sse_event_persisted();
      case 'done':
        return m.sse_event_done();
      case 'error':
        return m.sse_event_error();
    }
  }

  /** Unicode glyph for each kind — purely decorative, no a11y dependency. */
  function eventIcon(kind: SseEvent['kind']): string {
    switch (kind) {
      case 'started':
        return '▶';
      case 'embedding':
        return '◌';
      case 'persisted':
        return '◉';
      case 'done':
        return '✓';
      case 'error':
        return '!';
    }
  }
</script>

<section class="space-y-6 max-w-2xl">
  <header class="space-y-2">
    <h1 class="text-3xl font-bold text-slate-900">{m.ingest_page_title()}</h1>
    <p class="text-slate-600">{m.ingest_page_subtitle()}</p>
  </header>

  {#if form?.success}
    <Toast variant="success" message={`${m.ingest_success_toast()} (${form.docId})`} />
  {:else if form?.error}
    <Toast variant="error" message={form.error} />
  {/if}

  <!-- WAVE-10-B/F:DROPZONE — file-upload teammate adds dropzone + progress bar here. -->
  <section class="space-y-3" data-testid="upload-section">
    <header class="space-y-1">
      <h2 class="text-xl font-semibold text-slate-900">{m.upload_section_title()}</h2>
      <p class="text-sm text-slate-600">{m.upload_section_subtitle()}</p>
    </header>

    {#if uploadError}
      <Toast variant="error" message={uploadError} />
    {/if}
    {#if uploadSuccess}
      <Toast variant="success" message={uploadSuccess} />
    {/if}

    <div
      role="button"
      tabindex="0"
      aria-label={m.upload_dropzone_idle()}
      data-testid="dropzone"
      class="border-2 border-dashed rounded-md px-4 py-8 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      class:border-blue-500={dropzoneActive}
      class:bg-blue-50={dropzoneActive}
      class:border-slate-300={!dropzoneActive}
      class:bg-white={!dropzoneActive}
      class:opacity-50={uploadProgress !== null}
      class:cursor-not-allowed={uploadProgress !== null}
      onclick={pickFile}
      onkeydown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && uploadProgress === null) {
          e.preventDefault();
          pickFile();
        }
      }}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      <p class="text-sm text-slate-700">
        {dropzoneActive ? m.upload_dropzone_hover() : m.upload_dropzone_idle()}
      </p>
      <p class="text-xs text-slate-500 mt-1">{m.upload_dropzone_picking()}</p>
    </div>
    <input
      bind:this={fileInputEl}
      type="file"
      accept=".txt,.md,text/plain,text/markdown"
      class="hidden"
      data-testid="file-input"
      onchange={handleFileChange}
    />

    {#if uploadProgress !== null}
      <div class="space-y-1" data-testid="upload-progress">
        <div class="flex justify-between text-xs text-slate-600">
          <span>{uploadProgress < 100 ? m.upload_progress_label() : m.upload_progress_complete()}</span>
          <span>{uploadProgress}%</span>
        </div>
        <progress
          max="100"
          value={uploadProgress}
          class="w-full h-2 rounded-md overflow-hidden"
        ></progress>
      </div>
    {/if}
  </section>

  <!-- WAVE-10-B/S:STATUS-PANEL — sse-streaming teammate adds live events panel here. -->
  <section class="space-y-3" data-testid="sse-panel">
    <header class="space-y-1 flex items-baseline justify-between gap-3">
      <h2 class="text-xl font-semibold text-slate-900">{m.sse_panel_title()}</h2>
      {#if activeDocId && !sseConnected && sseEvents.length === 0}
        <span class="text-xs text-rose-600">{m.sse_panel_connection_lost()}</span>
      {/if}
    </header>

    {#if sseEvents.length === 0}
      <p class="text-sm text-slate-500 italic" data-testid="sse-panel-empty">
        {m.sse_panel_empty()}
      </p>
    {:else}
      <ol class="space-y-1 border border-slate-200 rounded-md divide-y divide-slate-100">
        {#each sseEvents as event, idx (idx)}
          <li
            class="flex items-center gap-3 px-3 py-2 text-sm"
            class:text-rose-700={event.kind === 'error'}
            class:text-emerald-700={event.kind === 'done'}
            class:text-slate-700={event.kind !== 'error' && event.kind !== 'done'}
            data-testid={`sse-event-${event.kind}`}
          >
            <span class="font-mono w-4 text-center" aria-hidden="true">{eventIcon(event.kind)}</span>
            <span class="flex-1">{eventLabel(event.kind)}</span>
            {#if event.detail}
              <span class="text-xs text-slate-500 font-mono">{event.detail}</span>
            {/if}
            <span class="text-xs text-slate-400">{formatRelative(event.ts)}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <form method="POST" action="?/default" class="space-y-4">
    <div class="space-y-1">
      <label for="docId" class="block text-sm font-medium text-slate-700">{m.ingest_form_doc_id_label()}</label>
      <input
        id="docId"
        name="docId"
        type="text"
        required
        placeholder="my-doc-001"
        value={form?.docId ?? ''}
        class="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p class="text-xs text-slate-500">{m.ingest_form_doc_id_hint()}</p>
    </div>

    <div class="space-y-1">
      <label for="text" class="block text-sm font-medium text-slate-700">{m.ingest_form_text_label()}</label>
      <textarea
        id="text"
        name="text"
        required
        rows="8"
        placeholder="Paste the document text here…"
        class="w-full border border-slate-300 rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      ></textarea>
    </div>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
      >
        {m.ingest_form_submit()}
      </button>
      <a href="/search" class="text-sm text-slate-600 hover:text-slate-900">
        {m.ingest_link_to_search()}
      </a>
    </div>
  </form>
</section>
