// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.C (PRD-020 FR-001) — Storybook main config.
 *
 * Auto-discovers stories under src/lib/components/ui/. Wired to the SvelteKit
 * framework adapter so Storybook resolves $lib, $app, and SvelteKit runtime
 * exactly as production builds do — no story-only mocks.
 */
import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
  stories: ['../src/lib/components/ui/**/*.stories.@(ts|svelte)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/sveltekit',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  typescript: {
    check: false,
  },
};

export default config;
