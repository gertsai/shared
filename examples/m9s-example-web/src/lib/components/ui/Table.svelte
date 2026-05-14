<!--
  SPDX-License-Identifier: Apache-2.0
  Wave 10.C (PRD-020 FR-003) — Table molecule.

  Generic <TRow> data table:
    - `columns` declares column key + label + optional render/align/width.
    - `rows` is the data list; `rowKey` selects the {#each} key (default 'id').
    - `empty` text shows when rows.length === 0.
    - `rowActions` is an optional Snippet rendered as a trailing actions
      column (typical use: per-row delete button).

  No sorting / no in-component pagination — consumers compose <Pagination>
  outside. Keeps the molecule single-responsibility.
-->
<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { cn } from './tokens';

  interface TableColumn<TRow> {
    key: keyof TRow & string;
    label: string;
    render?: (row: TRow) => string;
    width?: string;
    align?: 'left' | 'center' | 'right';
  }

  interface TableProps<TRow> {
    rows: TRow[];
    columns: TableColumn<TRow>[];
    empty?: string;
    rowKey?: keyof TRow & string;
    rowActions?: Snippet<[TRow]>;
  }

  let {
    rows,
    columns,
    empty = 'No data',
    // reason: 'id' is the de-facto convention across our route data; consumers
    // override when their row shape uses a different primary key.
    rowKey = 'id' as keyof TRow & string,
    rowActions,
  }: TableProps<TRow> = $props();

  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  } as const;

  function cellText(row: TRow, col: TableColumn<TRow>): string {
    if (col.render) return col.render(row);
    const v = row[col.key];
    return v == null ? '' : String(v);
  }

  // Total column count including the (optional) actions column — used by the
  // empty-state row's colspan so the placeholder fills the table width.
  const totalCols = $derived(columns.length + (rowActions ? 1 : 0));
</script>

<div class="overflow-x-auto rounded-md border border-slate-200">
  <table data-testid="ui-table" class="min-w-full divide-y divide-slate-200 text-sm">
    <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
      <tr>
        {#each columns as col (col.key)}
          <th
            scope="col"
            class={cn('px-3 py-2 font-medium', alignClass[col.align ?? 'left'])}
            style={col.width ? `width: ${col.width}` : undefined}
          >
            {col.label}
          </th>
        {/each}
        {#if rowActions}
          <th scope="col" class="px-3 py-2 text-right font-medium">Actions</th>
        {/if}
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-200 bg-white">
      {#if rows.length === 0}
        <tr>
          <td
            colspan={totalCols}
            class="px-3 py-6 text-center text-sm text-slate-500"
            data-testid="ui-table-empty"
          >
            {empty}
          </td>
        </tr>
      {:else}
        {#each rows as row (row[rowKey])}
          <tr data-testid="ui-table-row">
            {#each columns as col (col.key)}
              <td class={cn('px-3 py-2 text-slate-800', alignClass[col.align ?? 'left'])}>
                {cellText(row, col)}
              </td>
            {/each}
            {#if rowActions}
              <td class="px-3 py-2 text-right">
                {@render rowActions(row)}
              </td>
            {/if}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
