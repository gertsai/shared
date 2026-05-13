import { paraglide } from '@inlang/paraglide-js-adapter-sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Wave 10.A — paraglide() runs BEFORE sveltekit() so generated runtime in
  // ./src/paraglide is available when SvelteKit scans modules. Compile-time
  // codegen: messages from ./project.inlang + ./messages/{en,ru}.json.
  plugins: [paraglide({ project: './project.inlang', outdir: './src/paraglide' }), tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 5173,
  },
});
