// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.C (PRD-020 FR-006) — design token classname maps.
 *
 * Single source of truth for Tailwind class strings used by every UI
 * primitive. No primitive should hardcode `bg-blue-600 hover:...` strings
 * inside its <script> block — they import from here.
 *
 * Adding a new variant or size means editing this file once; every primitive
 * that exposes the matching `variant` / `size` prop picks it up automatically.
 *
 * Theming the whole app (dark mode, brand-color refresh) becomes a one-file
 * change for the most-touched surfaces (button, badge, focus rings).
 */

// =============================================================================
// Button variants
// =============================================================================

export const buttonVariants = {
  primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm',
  secondary: 'bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-900',
  destructive: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
  ghost: 'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700',
  outline: 'border border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-slate-700',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

// =============================================================================
// Sizes — used by Button, Input, Select, Badge
// =============================================================================

export const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
} as const;

export type Size = keyof typeof sizes;

// =============================================================================
// Badge variants
// =============================================================================

export const badgeVariants = {
  neutral: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  info: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
} as const;

export type BadgeVariant = keyof typeof badgeVariants;

// =============================================================================
// Toast variants — match the 5 levels Wave 10.A introduced
// =============================================================================

export const toastVariants = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  error: 'bg-red-50 border-red-200 text-red-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  neutral: 'bg-slate-50 border-slate-200 text-slate-900',
} as const;

export type ToastVariant = keyof typeof toastVariants;

// =============================================================================
// Shared classnames
// =============================================================================

/** Focus ring used by all interactive primitives (WCAG 2.1 AA visibility). */
export const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

/** Common button radius + transition. */
export const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** Common input/select shape. */
export const inputBase =
  'w-full rounded-md border border-slate-300 bg-white text-slate-900 placeholder-slate-400 disabled:bg-slate-50 disabled:cursor-not-allowed transition-colors';

/** Composes Tailwind class strings safely (drops falsy, joins with space). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
