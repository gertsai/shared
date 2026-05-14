// SPDX-License-Identifier: Apache-2.0
// Wave 10.C (PRD-020 FR-003) — Table stories.
//
// Demonstrates the generic <TRow> shape with a realistic Document row that
// mirrors the admin/content table; gives Storybook readers a one-glance
// sense of how the molecule maps onto live data.
import type { Meta, StoryObj } from '@storybook/svelte';

import Component from './Table.svelte';

interface DocRow {
  // index signature keeps the row compatible with the generic constraint
  // `TRow extends Record<string, unknown>` on the Table component.
  [k: string]: unknown;
  id: string;
  preview: string;
  bytes: number;
  createdAt: string;
}

const sampleRows: DocRow[] = [
  {
    id: 'doc_1',
    preview: 'Quarterly review summary',
    bytes: 4096,
    createdAt: '2026-04-12T10:14:00Z',
  },
  {
    id: 'doc_2',
    preview: 'Engineering RFC draft for storage compaction',
    bytes: 18_204,
    createdAt: '2026-04-22T16:02:00Z',
  },
  {
    id: 'doc_3',
    preview: 'Onboarding checklist',
    bytes: 1280,
    createdAt: '2026-05-01T09:30:00Z',
  },
];

const columns = [
  { key: 'id', label: 'ID', width: '120px' },
  { key: 'preview', label: 'Preview' },
  {
    key: 'bytes',
    label: 'Size',
    align: 'right' as const,
    render: (r: DocRow) => `${(r.bytes / 1024).toFixed(1)} KB`,
  },
  { key: 'createdAt', label: 'Created' },
];

const meta: Meta<typeof Component> = {
  title: 'Molecules/Table',
  component: Component,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: {
    rows: sampleRows,
    // reason: Storybook's Meta<typeof Component> can't capture the <TRow>
    // generic param, so the args type widens to Record<string, unknown>;
    // cast preserves the realistic DocRow shape inside the stories.
    columns: columns as never,
  },
};

export const Empty: Story = {
  args: {
    rows: [],
    columns: columns as never,
    empty: 'No documents yet — upload one to get started.',
  },
};

export const SingleRow: Story = {
  args: {
    rows: [sampleRows[0]],
    // reason: Storybook's Meta<typeof Component> can't capture the <TRow>
    // generic param, so the args type widens to Record<string, unknown>;
    // cast preserves the realistic DocRow shape inside the stories.
    columns: columns as never,
  },
};

export const WithCustomRowKey: Story = {
  args: {
    rows: sampleRows.map((r) => ({ ...r, slug: r.id })),
    columns: [
      { key: 'slug', label: 'Slug' },
      { key: 'preview', label: 'Preview' },
    ] as never,
    rowKey: 'slug',
  },
};
