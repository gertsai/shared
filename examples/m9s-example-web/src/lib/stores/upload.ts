// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 / RFC-014) — shared upload status store.
 *
 * Bridge between the file-upload slice (teammate F) and the SSE-streaming
 * slice (teammate S):
 *
 *   - File-upload writes the just-uploaded docId here once the XHR `onload`
 *     handler sees `{docId, ...}` in the response body.
 *   - SSE panel subscribes and opens an `EventSource("/api/stream/ingest?docId=…")`
 *     scoped to that id.
 *
 * Using a Svelte store (not a `$state` rune in a +page.svelte) because the
 * two consumers live in the same file today but may split into separate
 * components in Wave 10.C — a store is the boring, predictable seam.
 *
 * Reset semantics:
 *   - `setLastUpload({docId, bytes})` — record a new upload; SSE panel
 *     reacts via subscribe.
 *   - `clearLastUpload()` — emit null; SSE panel closes its EventSource.
 *
 * No persistence: the store is in-memory only. Refreshing the page clears
 * it intentionally — admin sees the full history via `/admin/content`, not
 * via this store.
 */
import { writable, type Readable } from 'svelte/store';

export interface LastUpload {
  /** Document id assigned by the backend (or echoed if client-supplied). */
  docId: string;
  /** Decoded byte count (post-multipart parse, server-side). */
  bytes: number;
}

const _lastUpload = writable<LastUpload | null>(null);

export const lastUpload: Readable<LastUpload | null> = {
  subscribe: _lastUpload.subscribe,
};

export function setLastUpload(value: LastUpload): void {
  _lastUpload.set(value);
}

export function clearLastUpload(): void {
  _lastUpload.set(null);
}
