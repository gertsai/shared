// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-003) — Card stories.
//
// Storybook 8 + Svelte 5 quirk: `children` and slot-style snippets must be
// passed as Snippet values. Storybook's renderer lifts a plain string into
// the default snippet at runtime — same pattern as Badge.stories.ts.
import type { Meta, StoryObj } from '@storybook/svelte';
import type { Snippet } from 'svelte';

import Component from './Card.svelte';

// reason: Storybook's renderer lifts string `children` into a default snippet.
const textChildren = (label: string): Snippet => label as unknown as Snippet;

const meta: Meta<typeof Component> = {
  title: 'Molecules/Card',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    padding: { control: 'select', options: ['none', 'sm', 'md', 'lg'] },
    bordered: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: {
    title: 'Card title',
    subtitle: 'Short supporting copy under the title.',
    children: textChildren(
      'A card body wraps any content; padding and border are configurable via props.',
    ),
  },
};

export const BodyOnly: Story = {
  args: {
    children: textChildren(
      'No title, no subtitle — just a clean container with the default border + padding.',
    ),
  },
};

export const NoBorderLargePadding: Story = {
  args: {
    title: 'Spacious surface',
    padding: 'lg',
    bordered: false,
    children: textChildren('Larger inner padding, no surrounding border.'),
  },
};

export const WithFooter: Story = {
  args: {
    title: 'Order summary',
    subtitle: '3 items',
    children: textChildren('Item list goes here.'),
    footer: textChildren('Total: $42.00'),
  },
};

export const PaddingNone: Story = {
  args: {
    padding: 'none',
    children: textChildren('No body padding — caller controls inner spacing.'),
  },
};
