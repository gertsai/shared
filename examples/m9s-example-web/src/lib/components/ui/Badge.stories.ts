// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-002) — Badge stories.
//
// See Button.stories.ts for the snippet-as-arg pattern justification.
import type { Meta, StoryObj } from '@storybook/svelte';
import type { Snippet } from 'svelte';

import Component from './Badge.svelte';

// reason: Storybook's renderer lifts string `children` into a default snippet.
const textChildren = (label: string): Snippet => label as unknown as Snippet;

const meta: Meta<typeof Component> = {
  title: 'Atoms/Badge',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['neutral', 'info', 'success', 'warning', 'danger'],
    },
    size: { control: 'select', options: ['sm', 'md'] },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Neutral: Story = {
  args: { variant: 'neutral', children: textChildren('Draft') },
};

export const Info: Story = {
  args: { variant: 'info', children: textChildren('Beta') },
};

export const Success: Story = {
  args: { variant: 'success', children: textChildren('Active') },
};

export const Warning: Story = {
  args: { variant: 'warning', children: textChildren('Stale') },
};

export const Danger: Story = {
  args: { variant: 'danger', children: textChildren('Deprecated') },
};

export const MediumSize: Story = {
  args: { variant: 'info', size: 'md', children: textChildren('Larger badge') },
};
