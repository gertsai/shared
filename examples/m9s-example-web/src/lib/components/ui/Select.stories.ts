// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-002) — Select stories.
import type { Meta, StoryObj } from '@storybook/svelte';

import Component from './Select.svelte';

const fruits = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'durian', label: 'Durian', disabled: true },
];

const meta: Meta<typeof Component> = {
  title: 'Atoms/Select',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: {
    id: 'fruit',
    label: 'Favourite fruit',
    options: fruits,
    placeholder: 'Pick one…',
    value: '',
  },
};

export const PreSelected: Story = {
  args: {
    id: 'fruit-pre',
    label: 'Favourite fruit',
    options: fruits,
    value: 'banana',
  },
};

export const Required: Story = {
  args: {
    id: 'fruit-req',
    label: 'Favourite fruit',
    options: fruits,
    placeholder: 'Pick one…',
    required: true,
    value: '',
  },
};

export const Disabled: Story = {
  args: {
    id: 'fruit-dis',
    label: 'Favourite fruit',
    options: fruits,
    value: 'apple',
    disabled: true,
  },
};

export const SmallSize: Story = {
  args: {
    id: 'fruit-sm',
    label: 'Compact select',
    options: fruits,
    size: 'sm',
    value: '',
    placeholder: 'Pick one…',
  },
};

export const LargeSize: Story = {
  args: {
    id: 'fruit-lg',
    label: 'Roomy select',
    options: fruits,
    size: 'lg',
    value: '',
    placeholder: 'Pick one…',
  },
};
