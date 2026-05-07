// SPDX-License-Identifier: Apache-2.0
/**
 * Lua script loader.
 *
 * Resolves bundled Lua scripts in a way that works for both:
 *   - vitest reading from `src/` (this file lives at `src/lua-loader.ts`,
 *     so `__dirname` = `<pkg>/src/` and `scripts/<name>.lua` resolves to
 *     `<pkg>/src/scripts/<name>.lua`).
 *   - tsup-bundled output: this module is inlined into `dist/index.{js,cjs}`,
 *     so `__dirname` = `<pkg>/dist/` and `scripts/<name>.lua` resolves to
 *     `<pkg>/dist/scripts/<name>.lua` (where the build copies the .lua files).
 *
 * For ESM consumers, tsup's `cjsInterop`/banner shims `__dirname` based on
 * `import.meta.url`, so the same path resolution works.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export function loadLuaScript(name: string): string {
  return fs.readFileSync(path.join(moduleDir, 'scripts', `${name}.lua`), 'utf8');
}
