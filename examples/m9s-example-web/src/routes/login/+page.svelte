<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.A — Login page.

  Demo notice rendered prominently so visitors know any credentials work
  and the underlying backend is NOT a real auth system. Form posts to the
  default action (../+page.server.ts) which sets the auth cookie + redirects
  to /. Errors render as inline Toast above the form.
-->
<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<section class="max-w-md mx-auto space-y-6">
  <header class="space-y-2">
    <h1 class="text-3xl font-bold text-slate-900">Sign in</h1>
    <p class="text-slate-600">
      DEMO authentication — any email + password is accepted. The backend issues a
      short-lived JWT (15 min) plus a 24 h refresh token.
    </p>
  </header>

  {#if form?.error}
    <div
      role="alert"
      data-testid="login-error"
      class="border border-rose-200 bg-rose-50 text-rose-800 rounded-md px-4 py-2 text-sm"
    >
      {form.error}
    </div>
  {/if}

  <form method="POST" action="?/default" class="space-y-4">
    <div class="space-y-1">
      <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autocomplete="email"
        placeholder="demo@example.com"
        value={form?.email ?? ''}
        class="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div class="space-y-1">
      <label for="password" class="block text-sm font-medium text-slate-700">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autocomplete="current-password"
        placeholder="anything works in demo mode"
        class="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <button
      type="submit"
      data-testid="login-submit"
      class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
    >
      Sign in
    </button>

    <p class="text-xs text-slate-500 text-center">
      Wave 10.A demo — see <code>examples/m9s-example/src/services/auth/</code> for the backend.
    </p>
  </form>
</section>
