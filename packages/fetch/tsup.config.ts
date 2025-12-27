import type { Options } from 'tsup';
import { defineConfig } from 'tsup';
import { esbuildPluginVersionInjector } from 'esbuild-plugin-version-injector';

function createTsupConfig({
  entry = ['src/index.ts'],
  external = [],
  noExternal = [],
  platform = 'node',
  format = ['esm', 'cjs'],
  target = 'es2022',
  skipNodeModulesBundle = true,
  clean = true,
  shims = format.includes('cjs'),
  cjsInterop = format.includes('cjs'),
  minify = false,
  terserOptions = {
    mangle: false,
    keep_classnames: true,
    keep_fnames: true,
  },
  splitting = false,
  keepNames = true,
  dts = true,
  sourcemap = true,
  esbuildPlugins = [],
  treeshake = false,
}: Options = {}) {
  return defineConfig({
    entry,
    external,
    noExternal,
    platform,
    format,
    skipNodeModulesBundle,
    target,
    clean,
    shims,
    cjsInterop,
    minify,
    terserOptions,
    splitting,
    keepNames,
    dts,
    sourcemap,
    esbuildPlugins,
    treeshake,
  });
}

export default createTsupConfig({
  entry: ['src/index.ts'],
  esbuildPlugins: [esbuildPluginVersionInjector()],
});
