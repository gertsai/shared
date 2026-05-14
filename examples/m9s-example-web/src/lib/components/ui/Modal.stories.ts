// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-003) — Modal stories.
//
// Native <dialog> means the story renders open via the `open` arg and the
// browser handles focus trap + Esc. The Storybook "centered" layout cannot
// host a top-layer dialog perfectly — we set `layout: 'fullscreen'` so the
// dialog reveals against the viewport, mirroring production usage.
import type { Meta, StoryObj } from '@storybook/svelte';
import type { Snippet } from 'svelte';

import Component from './Modal.svelte';

const textChildren = (label: string): Snippet => label as unknown as Snippet;

const meta: Meta<typeof Component> = {
  title: 'Molecules/Modal',
  component: Component,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    open: { control: 'boolean' },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl'] },
    closeOnOverlay: { control: 'boolean' },
    closeOnEscape: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Confirm deletion',
    description: 'This action cannot be undone.',
    children: textChildren('Are you sure you want to delete this item?'),
  },
};

export const Small: Story = {
  args: {
    open: true,
    size: 'sm',
    title: 'Quick prompt',
    children: textChildren('Compact dialog body.'),
  },
};

export const ExtraLarge: Story = {
  args: {
    open: true,
    size: 'xl',
    title: 'Wide content',
    description: 'Useful for forms with many fields or media.',
    children: textChildren('Plenty of horizontal space for a richer layout.'),
  },
};

export const NoOverlayClose: Story = {
  args: {
    open: true,
    title: 'Modal that survives backdrop clicks',
    closeOnOverlay: false,
    closeOnEscape: false,
    children: textChildren('Only the explicit close action will dismiss this.'),
  },
};

export const WithFooter: Story = {
  args: {
    open: true,
    title: 'Save changes?',
    description: 'You have unsaved edits.',
    children: textChildren('Discard or save before leaving.'),
    footer: textChildren('Cancel · Save'),
  },
};
