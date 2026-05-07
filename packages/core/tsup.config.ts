// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import UnpluginTypia from '@ryoppippi/unplugin-typia/esbuild';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'rag/index': 'src/rag/index.ts',
    'llm/index': 'src/llm/index.ts',
  },
  esbuildPlugins: [UnpluginTypia({ cache: false })],
});
