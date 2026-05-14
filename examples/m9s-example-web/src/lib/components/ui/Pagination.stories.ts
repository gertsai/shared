// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-003) — Pagination stories.
//
// Boundary stories (first / middle / last) verify the disabled-state
// invariant — the most-likely regression vector when refactoring this
// kind of two-button paginator.
import type { Meta, StoryObj } from '@storybook/svelte';

import Component from './Pagination.svelte';

const meta: Meta<typeof Component> = {
  title: 'Molecules/Pagination',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    page: { control: { type: 'number', min: 0 } },
    pageSize: { control: { type: 'number', min: 1 } },
    total: { control: { type: 'number', min: 0 } },
  },
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: {
    total: 124,
    pageSize: 20,
    page: 2,
  },
};

export const FirstPage: Story = {
  args: {
    total: 124,
    pageSize: 20,
    page: 0,
  },
};

export const LastPage: Story = {
  args: {
    total: 124,
    pageSize: 20,
    page: 6, // 124 / 20 = 7 pages, last is index 6
  },
};

export const SinglePage: Story = {
  args: {
    total: 8,
    pageSize: 20,
    page: 0,
  },
};

export const LocalisedLabels: Story = {
  args: {
    total: 50,
    pageSize: 10,
    page: 1,
    previousLabel: 'Назад',
    nextLabel: 'Вперёд',
    positionLabel: 'Страница',
  },
};
