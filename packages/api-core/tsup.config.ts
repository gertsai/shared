// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import UnpluginTypia from '@ryoppippi/unplugin-typia/esbuild';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'contracts/index': 'src/contracts/index.ts',
    'moleculer/index': 'src/moleculer/index.ts',
    'runtime/node/index': 'src/runtime/node/index.ts',
  },
  esbuildPlugins: [UnpluginTypia({ cache: false })],
});
