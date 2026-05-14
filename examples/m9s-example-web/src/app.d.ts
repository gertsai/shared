// See https://svelte.dev/docs/kit/types#app
declare global {
  namespace App {
    /**
     * Error shape returned by `handleError` in `src/hooks/error.ts` (Wave 10.A).
     * `message` is mandatory per SvelteKit; we extend it with our own fields
     * so `+error.svelte` pages get typed access via `$page.error`.
     */
    interface Error {
      message: string;
      code?: string;
      requestId?: string;
    }
    interface Locals {
      locale: 'en' | 'ru';
      /**
       * Demo user attached by `hooks/auth.ts` after JWT verify (Wave 10.A).
       * `undefined` for anonymous requests (Wave 9 routes stay anonymous-
       * accessible — per-route guards on Wave 10.B/C CMS).
       */
      user?: { id: string; email: string; tenantId: string };
    }
    interface PageData {
      /** Mirror of `Locals.user` exposed via `+layout.server.ts` (Wave 10.A). */
      user?: { id: string; email: string; tenantId: string };
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
