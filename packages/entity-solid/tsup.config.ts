// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: ['@gertsai/entity', 'solid-js', 'solid-js/store'],
});
