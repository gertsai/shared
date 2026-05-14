// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-002) — Input stories.
import type { Meta, StoryObj } from '@storybook/svelte';

import Component from './Input.svelte';

const meta: Meta<typeof Component> = {
  title: 'Atoms/Input',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'url', 'search'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    required: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: {
    id: 'name',
    label: 'Name',
    placeholder: 'Jane Doe',
    value: '',
  },
};

export const WithValue: Story = {
  args: {
    id: 'email',
    label: 'Email',
    type: 'email',
    value: 'user@example.com',
  },
};

export const WithError: Story = {
  args: {
    id: 'email-err',
    label: 'Email',
    type: 'email',
    value: 'not-an-email',
    error: 'Please enter a valid email address.',
  },
};

export const Required: Story = {
  args: {
    id: 'username',
    label: 'Username',
    required: true,
    placeholder: 'pick a unique handle',
  },
};

export const Password: Story = {
  args: {
    id: 'pw',
    label: 'Password',
    type: 'password',
    placeholder: '••••••••',
    autocomplete: 'current-password',
  },
};

export const Disabled: Story = {
  args: {
    id: 'disabled',
    label: 'Read-only field',
    value: 'cannot edit',
    disabled: true,
  },
};

export const SmallSize: Story = {
  args: {
    id: 'small',
    label: 'Small input',
    size: 'sm',
    placeholder: 'compact',
  },
};

export const LargeSize: Story = {
  args: {
    id: 'large',
    label: 'Large input',
    size: 'lg',
    placeholder: 'roomy',
  },
};
