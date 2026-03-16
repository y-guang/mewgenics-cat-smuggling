<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
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
import type { CatInfoRecord } from '../../lib/save'
import { useExportFlowStore } from '../../stores/exportFlow'

const router = useRouter()
const { t } = useI18n()
const store = useExportFlowStore()
const { cats, sourceSaveFile } = storeToRefs(store)

if (!sourceSaveFile.value) {
  router.replace('/export/upload')
}

const globalFilter = ref('')
const sorting = ref<SortingState>([{ id: 'key', desc: true }])
const columnFilters = ref<ColumnFiltersState>([])

function statCell(val: number | undefined | null): string {
  return val != null ? String(val) : '—'
}

function flagBadges(row: CatInfoRecord): string[] {
  const badges: string[] = []
  if (row.flags?.dead) badges.push(t('cat.statusDead'))
  if (row.flags?.retired) badges.push(t('cat.statusRetired'))
  if (row.flags?.donated) badges.push(t('cat.statusDonated'))
  return badges
}

function catName(name: string | null): string {
  return name ?? t('cat.unnamed')
}

function sexLabel(sex: string | null): string {
  if (sex === 'Male') return t('cat.sexMale')
  if (sex === 'Female') return t('cat.sexFemale')
  if (sex === 'Ditto') return t('cat.sexDitto')
  return t('cat.sexUnknown')
}

function chooseCat(cat: CatInfoRecord): void {
  store.selectCat(cat.key)
  router.push('/export/details')
}

const colHelper = createColumnHelper<CatInfoRecord>()

const columns = [
  colHelper.accessor('name', {
    header: t('columns.name'),
    cell: (info) => catName(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor('key', {
    header: t('columns.dbKey'),
    enableSorting: true
  }),
  colHelper.accessor('sex', {
    header: t('columns.sex'),
    cell: (info) => sexLabel(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor('className', {
    header: t('columns.class'),
    cell: (info) => info.getValue() ?? '—',
    enableSorting: true
  }),
  colHelper.accessor('level', {
    header: t('columns.level'),
    cell: (info) => info.getValue() ?? '—',
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.str, {
    id: 'str',
    header: t('columns.str'),
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.dex, {
    id: 'dex',
    header: t('columns.dex'),
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.con, {
    id: 'con',
    header: t('columns.con'),
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.int, {
    id: 'int',
    header: t('columns.int'),
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.spd, {
    id: 'spd',
    header: t('columns.spd'),
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.cha, {
    id: 'cha',
    header: t('columns.cha'),
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor((row) => row.stats?.luck, {
    id: 'luck',
    header: t('columns.luck'),
    cell: (info) => statCell(info.getValue()),
    enableSorting: true
  }),
  colHelper.accessor('ageDays', {
    header: t('columns.ageDays'),
    cell: (info) => info.getValue() ?? '—',
    enableSorting: true
  }),
  colHelper.display({
    id: 'flags',
    header: t('columns.status'),
    cell: ({ row }) => {
      const badges = flagBadges(row.original)
      if (badges.length === 0) return h('span', { class: 'text-neutral-500' }, '—')
      return h('span', { class: 'inline-flex gap-1 flex-wrap' },
        badges.map((b) =>
          h('span', {
            class: 'rounded px-1 py-0.5 text-xs font-medium bg-neutral-700 text-neutral-300'
          }, b)
        )
      )
    },
    enableSorting: false
  }),
  colHelper.accessor((row) => row.house !== null, {
    id: 'housed',
    header: t('columns.housed'),
    cell: (info) => (info.getValue() ? t('cat.housedYes') : '—'),
    enableSorting: true
  }),
  colHelper.accessor('id64', {
    header: t('columns.id64'),
    cell: (info) => info.getValue() ?? '—',
    enableSorting: false
  })
]

const table = useVueTable({
  get data() { return cats.value },
  columns,
  state: {
    get sorting() { return sorting.value },
    get globalFilter() { return globalFilter.value },
    get columnFilters() { return columnFilters.value }
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  onGlobalFilterChange: (updater) => {
    globalFilter.value = typeof updater === 'function' ? updater(globalFilter.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getRowId: (row) => String(row.key)
})

const loadedCount = computed(() => cats.value.length)
</script>

<template>
  <section class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-4">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="space-y-1">
        <h2 class="text-base font-medium text-neutral-100">
          {{ t('export.select.title') }}
          <span class="text-neutral-500 font-normal text-sm ml-1">({{ loadedCount }})</span>
        </h2>
        <p class="text-xs text-neutral-500">{{ t('export.select.loadedFrom') }}</p>
        <p class="text-xs text-neutral-400 break-all">{{ sourceSaveFile?.name }}</p>
        <p class="text-xs text-neutral-500">{{ t('export.select.hint') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <input
          v-model="globalFilter"
          type="search"
          :placeholder="t('export.select.searchPlaceholder')"
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 placeholder-neutral-500 px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
      </div>
    </div>

    <div class="overflow-x-auto rounded border border-neutral-700">
      <table class="w-full text-sm border-collapse">
        <thead class="bg-neutral-700/60 border-b border-neutral-700">
          <tr>
            <th
              v-for="header in table.getFlatHeaders()"
              :key="header.id"
              class="px-3 py-2 text-left font-medium text-neutral-300 whitespace-nowrap select-none"
              :class="{ 'cursor-pointer hover:bg-neutral-700': header.column.getCanSort() }"
              @click="header.column.getCanSort() ? header.column.toggleSorting() : undefined"
            >
              <span class="inline-flex items-center gap-1">
                <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
                <span v-if="header.column.getCanSort()" class="text-neutral-500">
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
            class="border-b border-neutral-700/60 last:border-0 hover:bg-neutral-700/40 cursor-pointer"
            @click="chooseCat(row.original)"
          >
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="px-3 py-2 text-neutral-200"
            >
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </td>
          </tr>
          <tr v-if="table.getRowModel().rows.length === 0">
            <td :colspan="columns.length" class="px-3 py-6 text-center text-neutral-500 text-sm">
              {{ t('export.select.noCats') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-neutral-500">{{ t('export.select.sortHint') }}</p>
  </section>
</template>
