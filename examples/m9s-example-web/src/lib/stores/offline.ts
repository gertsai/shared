// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A — small reactive offline store wrapping `navigator.onLine`.
 *
 * Exposes:
 *   - `isOffline()` reactive getter
 *   - `initOfflineWatcher()` — wires `online`/`offline` listeners. Returns a
 *     teardown function. Safe to call once from a top-level component; calling
 *     it more than once installs additional listeners which is wasteful but
 *     not incorrect.
 *
 * Browser-only: `navigator` is undefined during SSR, so the getter defaults to
 * `false` (assume online) until hydration runs.
 */
import { writable, type Readable } from 'svelte/store';

const initial = typeof navigator !== 'undefined' ? !navigator.onLine : false;
const _offline = writable(initial);

export const offline: Readable<boolean> = { subscribe: _offline.subscribe };

export function initOfflineWatcher(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onOnline = (): void => _offline.set(false);
  const onOffline = (): void => _offline.set(true);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  // Sync once on init in case state drifted between SSR and hydration.
  _offline.set(!navigator.onLine);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
