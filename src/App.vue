<script setup lang="ts">
import { ref } from 'vue'
import ExportView from './components/ExportView.vue'
import ImportView from './components/ImportView.vue'

type Mode = 'export' | 'import'
const mode = ref<Mode | null>(null)
</script>

<template>
  <div class="min-h-screen bg-neutral-900 text-neutral-100 p-6 md:p-10">
    <div class="max-w-4xl mx-auto space-y-8">
      <header class="flex items-baseline gap-4">
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">Mewgenics Cat Smuggler</h1>
        <button
          v-if="mode !== null"
          class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          @click="mode = null"
        >
          ← back
        </button>
      </header>

      <!-- Choice screen -->
      <div v-if="mode === null" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          class="rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 transition-colors p-8 text-left space-y-2"
          @click="mode = 'export'"
        >
          <div class="text-lg font-medium text-neutral-100">Export</div>
          <div class="text-sm text-neutral-400">Pick cats from a save file to transfer out.</div>
        </button>
        <button
          class="rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 transition-colors p-8 text-left space-y-2"
          @click="mode = 'import'"
        >
          <div class="text-lg font-medium text-neutral-100">Import</div>
          <div class="text-sm text-neutral-400">Inject a previously exported cat into a save file.</div>
        </button>
      </div>

      <ExportView v-else-if="mode === 'export'" />
      <ImportView v-else-if="mode === 'import'" />
    </div>
  </div>
</template>
