// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-002) — Button stories.
//
// Storybook 8.6 + Svelte 5 snippet-as-arg note:
//   Snippets cannot be authored inline inside a plain `.stories.ts` `args`
//   object (snippets require Svelte template syntax). The `@storybook/svelte`
//   renderer, however, will lift a plain string passed as `children` into a
//   default text snippet at render time. We rely on that here and cast to
//   `unknown as Snippet` to satisfy the Component's typed prop without
//   pulling Svelte's runtime into the story file. If a story needs richer
//   children (icons, multi-line layout), prefer authoring it as a `.stories.svelte`
//   file with a `<Template>` block — out of scope for this slice.
import type { Meta, StoryObj } from '@storybook/svelte';
import type { Snippet } from 'svelte';

import Component from './Button.svelte';

// reason: Storybook's renderer accepts a string for snippet args; cast keeps
// TypeScript honest at the call site without leaking Svelte runtime types.
const textChildren = (label: string): Snippet => label as unknown as Snippet;

const meta: Meta<typeof Component> = {
  title: 'Atoms/Button',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'destructive', 'ghost', 'outline'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    type: { control: 'select', options: ['button', 'submit', 'reset'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Primary: Story = {
  args: { variant: 'primary', children: textChildren('Save changes') },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: textChildren('Cancel') },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: textChildren('Delete') },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: textChildren('Skip') },
};

export const Outline: Story = {
  args: { variant: 'outline', children: textChildren('Learn more') },
};

export const SmallSize: Story = {
  args: { variant: 'primary', size: 'sm', children: textChildren('Small') },
};

export const LargeSize: Story = {
  args: { variant: 'primary', size: 'lg', children: textChildren('Large') },
};

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: textChildren('Saving…') },
};

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: textChildren('Disabled') },
};

export const FullWidth: Story = {
  args: { variant: 'primary', fullWidth: true, children: textChildren('Full width') },
};
