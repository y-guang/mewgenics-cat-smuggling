<script setup lang="ts">
import { ref, computed, h } from 'vue'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useVueTable,
  FlexRender,
  type SortingState,
  type ColumnFiltersState
} from '@tanstack/vue-table'
import { readCatsInfo, type CatInfoRecord } from '../lib/save'

const selectedFile = ref<File | null>(null)
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const cats = ref<CatInfoRecord[]>([])
const loaded = ref(false)

const globalFilter = ref('')
const sorting = ref<SortingState>([])
const columnFilters = ref<ColumnFiltersState>([])

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  errorMessage.value = null
  cats.value = []
  loaded.value = false
  rowSelection.value = {}
}

async function loadSave(): Promise<void> {
  if (!selectedFile.value) {
    errorMessage.value = 'Please choose a .sav file first.'
    return
  }
  isLoading.value = true
  errorMessage.value = null
  try {
    const bytes = new Uint8Array(await selectedFile.value.arrayBuffer())
    const result = await readCatsInfo(bytes)
    cats.value = result.cats
    loaded.value = true
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

function statCell(val: number | undefined | null): string {
  return val != null ? String(val) : '—'
}

function flagBadges(row: CatInfoRecord): string[] {
  const badges: string[] = []
  if (row.flags?.dead) badges.push('Dead')
  if (row.flags?.retired) badges.push('Retired')
  if (row.flags?.donated) badges.push('Donated')
  return badges
}

const colHelper = createColumnHelper<CatInfoRecord>()

const columns = [
  colHelper.display({
    id: 'select',
    header: ({ table }) =>
      h('input', {
        type: 'checkbox',
        class: 'accent-neutral-800',
        checked: table.getIsAllPageRowsSelected(),
        indeterminate: table.getIsSomePageRowsSelected(),
        onChange: table.getToggleAllPageRowsSelectedHandler()
      }),
    cell: ({ row }) =>
      h('input', {
        type: 'checkbox',
        class: 'accent-neutral-800',
        checked: row.getIsSelected(),
        onChange: row.getToggleSelectedHandler()
      }),
    enableSorting: false
  }),
  colHelper.accessor('name', {
    header: 'Name',
    cell: (info) => info.getValue() ?? '(unnamed)',
    enableSorting: true
  }),
  // Database row key — internal integer assigned by the save file
  colHelper.accessor('key', {
    header: 'DB Key',
    enableSorting: true
  }),
  colHelper.accessor('sex', {
    header: 'Sex',
    enableSorting: true
  }),
  colHelper.accessor('className', {
    header: 'Class',
    cell: (info) => info.getValue() ?? '—',
    enableSorting: true
  }),
  colHelper.accessor('level', {
    header: 'Lvl',
    cell: (info) => info.getValue() ?? '—',
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.str, {
    id: 'str',
    header: 'STR',
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.dex, {
    id: 'dex',
    header: 'DEX',
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.con, {
    id: 'con',
    header: 'CON',
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.int, {
    id: 'int',
    header: 'INT',
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.spd, {
    id: 'spd',
    header: 'SPD',
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.cha, {
    id: 'cha',
    header: 'CHA',
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.luck, {
    id: 'luck',
    header: 'LCK',
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor('ageYears', {
    header: 'Age (yr)',
    cell: (info) => info.getValue() ?? '—',
    enableSorting: true
  }),
  colHelper.display({
    id: 'flags',
    header: 'Status',
    cell: ({ row }) => {
      const badges = flagBadges(row.original)
      if (badges.length === 0) return h('span', { class: 'text-neutral-400' }, '—')
      return h('span', { class: 'inline-flex gap-1 flex-wrap' },
        badges.map((b) =>
          h('span', {
            class: 'rounded px-1 py-0.5 text-xs font-medium bg-neutral-200 text-neutral-700'
          }, b)
        )
      )
    },
    enableSorting: false
  }),
  colHelper.accessor((row) => row.house !== null, {
    id: 'housed',
    header: 'Housed',
    cell: (info) => (info.getValue() ? 'Yes' : '—'),
    enableSorting: true
  }),
  colHelper.display({
    id: 'issues',
    header: 'Issues',
    cell: ({ row }) => {
      const count = row.original.issues.length
      const hasError = row.original.issues.some((i) => i.severity === 'error')
      if (count === 0) return h('span', { class: 'text-neutral-400' }, '—')
      return h('span', {
        class: hasError
          ? 'rounded px-1 py-0.5 text-xs font-medium bg-red-100 text-red-700'
          : 'rounded px-1 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700',
        title: row.original.issues.map((i) => i.message).join('\n')
      }, `${count} ${hasError ? 'error' : 'warn'}${count > 1 ? 's' : ''}`)
    },
    enableSorting: false
  }),
  // Cat's 64-bit unique identity baked into the blob — used as the stable transfer identifier
  colHelper.accessor('id64', {
    header: 'ID64',
    cell: (info) => info.getValue() ?? '—',
    enableSorting: false
  })
]

const rowSelection = ref<Record<string, boolean>>({})

const table = useVueTable({
  get data() { return cats.value },
  columns,
  state: {
    get sorting() { return sorting.value },
    get globalFilter() { return globalFilter.value },
    get columnFilters() { return columnFilters.value },
    get rowSelection() { return rowSelection.value }
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  onGlobalFilterChange: (updater) => {
    globalFilter.value = typeof updater === 'function' ? updater(globalFilter.value) : updater
  },
  onRowSelectionChange: (updater) => {
    rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  enableRowSelection: true,
  getRowId: (row) => String(row.key)
})

const selectedCount = computed(() => Object.keys(rowSelection.value).length)
</script>

<template>
  <div class="space-y-6">
    <!-- File picker -->
    <section class="bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
      <h2 class="text-base font-medium">Source save file</h2>
      <label class="block space-y-1">
        <span class="text-sm text-neutral-600">Select a <code>.sav</code> file</span>
        <input
          type="file"
          accept=".sav"
          class="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:text-white file:px-3 file:py-1.5 file:cursor-pointer"
          @change="onFileChange"
        />
      </label>
      <button
        class="rounded border border-neutral-700 bg-neutral-900 text-white px-4 py-2 text-sm disabled:opacity-40 hover:bg-neutral-700 transition-colors"
        :disabled="!selectedFile || isLoading"
        @click="loadSave"
      >
        {{ isLoading ? 'Loading…' : 'Load save' }}
      </button>
      <p v-if="errorMessage" class="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
        {{ errorMessage }}
      </p>
    </section>

    <!-- Cat table -->
    <section v-if="loaded" class="bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <h2 class="text-base font-medium">
          Cats
          <span class="text-neutral-500 font-normal text-sm ml-1">({{ cats.length }})</span>
        </h2>
        <div class="flex items-center gap-3">
          <input
            v-model="globalFilter"
            type="search"
            placeholder="Search by name…"
            class="rounded border border-neutral-300 px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          <span v-if="selectedCount > 0" class="text-sm text-neutral-600">{{ selectedCount }} selected</span>
        </div>
      </div>

      <div class="overflow-x-auto rounded border border-neutral-200">
        <table class="w-full text-sm border-collapse">
          <thead class="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th
                v-for="header in table.getFlatHeaders()"
                :key="header.id"
                class="px-3 py-2 text-left font-medium text-neutral-700 whitespace-nowrap select-none"
                :class="{ 'cursor-pointer hover:bg-neutral-100': header.column.getCanSort() }"
                @click="header.column.getCanSort() ? header.column.toggleSorting() : undefined"
              >
                <span class="inline-flex items-center gap-1">
                  <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
                  <span v-if="header.column.getCanSort()" class="text-neutral-400">
                    <span v-if="header.column.getIsSorted() === 'asc'">↑</span>
                    <span v-else-if="header.column.getIsSorted() === 'desc'">↓</span>
                    <span v-else>↕</span>
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              class="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
              :class="{ 'bg-neutral-50': row.getIsSelected() }"
            >
              <td
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                class="px-3 py-2 text-neutral-800"
              >
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </td>
            </tr>
            <tr v-if="table.getRowModel().rows.length === 0">
              <td :colspan="columns.length" class="px-3 py-6 text-center text-neutral-400 text-sm">
                No cats found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex justify-end">
        <button
          class="rounded border border-neutral-700 bg-neutral-900 text-white px-4 py-2 text-sm disabled:opacity-40 hover:bg-neutral-700 transition-colors"
          :disabled="selectedCount === 0"
        >
          Export selected ({{ selectedCount }})
        </button>
      </div>
    </section>
  </div>
</template>
