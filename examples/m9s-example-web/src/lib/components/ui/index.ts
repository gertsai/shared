// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.C — design system barrel.
 *
 * Single import surface for every primitive:
 *
 *   import { Button, Input, Modal, Toast } from '$lib/components/ui';
 *
 * Token + helper exports live here too so call-sites composing variants can
 * grab `cn()` + the typed enums in one go.
 */

// Atoms (PRD-020 FR-002)
export { default as Button } from './Button.svelte';
export { default as Input } from './Input.svelte';
export { default as Select } from './Select.svelte';
export { default as Badge } from './Badge.svelte';
export { default as Spinner } from './Spinner.svelte';

// Molecules (PRD-020 FR-003)
export { default as Card } from './Card.svelte';
export { default as Modal } from './Modal.svelte';
export { default as Table } from './Table.svelte';
export { default as Pagination } from './Pagination.svelte';
export { default as Toast } from './Toast.svelte';

// Tokens + helpers
export {
  buttonVariants,
  badgeVariants,
  toastVariants,
  sizes,
  focusRing,
  buttonBase,
  inputBase,
  cn,
  type ButtonVariant,
  type BadgeVariant,
  type ToastVariant,
  type Size,
} from './tokens';
