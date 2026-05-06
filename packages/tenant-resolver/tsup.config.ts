// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'moleculer/index': 'src/moleculer/index.ts',
    'http/index': 'src/http/index.ts',
  },
});
