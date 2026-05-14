// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.C — Storybook preview-side config.
 *
 * Imports app.css so Tailwind v4 + design tokens are available in every story
 * (matching production rendering). Sets default layout + a11y panel options.
 */
import type { Preview } from '@storybook/svelte';
import '../src/app.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      element: '#storybook-root',
      manual: false,
    },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: '#ffffff' },
        { name: 'slate', value: '#f1f5f9' },
        { name: 'dark', value: '#0f172a' },
      ],
    },
  },
  tags: ['autodocs'],
};

export default preview;
