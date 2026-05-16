// SPDX-License-Identifier: Apache-2.0
/**
 * Keys that must never be assigned via untrusted `$patch` / `$setMetadata`
 * partials — CWE-1321 (Prototype Pollution) protection per PRD-033 FR-002.
 *
 * Frozen at module load to prevent any code path from mutating the set
 * after import.
 */
export const DANGEROUS_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);
