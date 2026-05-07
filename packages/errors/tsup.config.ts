// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
    'http/index': 'src/http/index.ts',
    'grpc/index': 'src/grpc/index.ts',
  },
});
