// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-002) — Spinner stories.
import type { Meta, StoryObj } from '@storybook/svelte';

import Component from './Spinner.svelte';

const meta: Meta<typeof Component> = {
  title: 'Atoms/Spinner',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    label: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: { size: 'md', label: 'Loading' },
};

export const Small: Story = {
  args: { size: 'sm', label: 'Loading' },
};

export const Large: Story = {
  args: { size: 'lg', label: 'Loading' },
};

export const CustomLabel: Story = {
  args: { size: 'md', label: 'Fetching dashboard data…' },
};
