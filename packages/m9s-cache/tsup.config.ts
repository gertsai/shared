// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
    moleculer: 'src/moleculer.ts',
    redis: 'src/redis.ts',
  },
  tsconfig: './tsconfig.build.json',
});
