// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: { 'index': 'src/index.ts' },
  // Mark peer deps + their optional/transitive native modules as external —
  // consumers install them; bundling them pulls in deep optional native deps
  // (dtrace, avsc, thrift, kafka-node) that fail to resolve in pure-Node builds.
  external: [
    ...((baseConfig.external as (string | RegExp)[] | undefined) ?? []),
    'ioredis',
    'moleculer',
    'moleculer-web',
    'bunyan',
    'dtrace-provider',
    'consola',
  ],
  // Copy Lua scripts into dist/scripts/ — runtime resolves them via lua-loader.
  onSuccess: 'pnpm copy:lua',
});
