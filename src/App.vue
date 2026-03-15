<script setup lang="ts">
import { ref } from 'vue'
import ExportView from './components/ExportView.vue'
import ImportView from './components/ImportView.vue'

type Tab = 'export' | 'import'
const activeTab = ref<Tab>('export')

const tabs: { id: Tab; label: string }[] = [
  { id: 'export', label: 'Export' },
  { id: 'import', label: 'Import' }
]
</script>

<template>
  <div class="min-h-screen bg-neutral-900 text-neutral-100 p-6 md:p-10">
    <div class="max-w-4xl mx-auto space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">Mewgenics Cat Smuggler</h1>
        <p class="text-sm text-neutral-400">Transfer cats between save files.</p>
      </header>

      <!-- Tab bar -->
      <div class="flex gap-1 border-b border-neutral-700">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="px-4 py-2 text-sm font-medium transition-colors"
          :class="
            activeTab === tab.id
              ? 'border-b-2 border-neutral-200 text-neutral-100 -mb-px'
              : 'text-neutral-500 hover:text-neutral-300'
          "
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <ExportView v-if="activeTab === 'export'" />
      <ImportView v-else-if="activeTab === 'import'" />
    </div>
  </div>
</template>
