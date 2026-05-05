// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

/**
 * Multi-entry build: root barrel (`index`) + standalone runner (`standalone`).
 *
 * Both peer deps (bullmq, ioredis) are external — consumers install them
 * explicitly. Lazy require() guards in src/index.ts surface
 * QueuePeerDepMissingError when bullmq is not present at runtime.
 */
export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
    standalone: 'src/standalone.ts',
  },
  external: [
    ...((baseConfig.external as (string | RegExp)[] | undefined) ?? []),
    'bullmq',
    'ioredis',
  ],
});
