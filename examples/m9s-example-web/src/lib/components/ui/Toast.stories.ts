// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-003) — Toast stories.
//
// Covers the five colour variants + the `loading` runtime mode + the
// non-dismissible flag. autoCloseMs is set to 0 so stories don't disappear
// mid-inspection (Storybook docs page would otherwise show blank slots).
import type { Meta, StoryObj } from '@storybook/svelte';

import Component from './Toast.svelte';

const meta: Meta<typeof Component> = {
  title: 'Molecules/Toast',
  component: Component,
  tags: ['autodocs'],
  args: { autoCloseMs: 0 },
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'error', 'info', 'warning', 'neutral', 'loading'],
    },
    dismissible: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Success: Story = {
  args: { variant: 'success', message: 'Document saved successfully.' },
};

export const Error: Story = {
  args: { variant: 'error', message: 'Upload failed — please retry.' },
};

export const Info: Story = {
  args: { variant: 'info', message: 'New release notes are available.' },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    message: 'Storage is at 90% capacity. Consider archiving older items.',
  },
};

export const Neutral: Story = {
  args: { variant: 'neutral', message: 'Plain neutral notice.' },
};

export const Loading: Story = {
  args: { variant: 'loading', message: 'Ingesting document — this may take a moment.' },
};

export const NonDismissible: Story = {
  args: {
    variant: 'info',
    message: 'This toast cannot be dismissed manually.',
    dismissible: false,
  },
};
