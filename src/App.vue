<script setup lang="ts">
import { ref } from 'vue'
import { listCatsInSave } from './lib/save'

const selectedFile = ref<File | null>(null)
const isRunning = ref(false)
const errorMessage = ref<string | null>(null)
const reportText = ref('')

const catListText = ref('')

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  errorMessage.value = null
}

async function listCats(): Promise<void> {
  if (!selectedFile.value) {
    errorMessage.value = 'Please choose a .sav file first.'
    return
  }

  isRunning.value = true
  errorMessage.value = null

  try {
    const bytes = new Uint8Array(await selectedFile.value.arrayBuffer())
    const cats = await listCatsInSave(bytes)
    const lines = cats.map((cat) => {
      const name = cat.name ?? '(unnamed)'
      return `${name} | key=${cat.key} | id64=${cat.id64}`
    })
    catListText.value = lines.join('\n')
    reportText.value = [
      `Cat list loaded: ${cats.length}`,
      '',
      ...lines
    ].join('\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errorMessage.value = message
  } finally {
    isRunning.value = false
  }
}


async function copyReport(): Promise<void> {
  if (!reportText.value) return
  await navigator.clipboard.writeText(reportText.value)
}
</script>

<template>
  <div class="min-h-screen bg-neutral-100 text-neutral-900 p-6 md:p-10">
    <div class="max-w-3xl mx-auto space-y-6">
      <header class="space-y-2">
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">
          Cat Save Inspector
        </h1>
        <p class="text-sm text-neutral-600">
          Load a save and list cat names, keys, and IDs.
        </p>
      </header>

      <section class="bg-white border border-neutral-200 rounded-lg p-4 md:p-5 space-y-4">
        <label class="block space-y-2">
          <span class="text-sm font-medium">Save file (.sav)</span>
          <input
            type="file"
            accept=".sav"
            class="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-neutral-900 file:text-white file:px-3 file:py-2"
            @change="onFileChange"
          >
        </label>

        <div class="flex flex-wrap gap-3">
          <button
            class="rounded border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"
            :disabled="isRunning"
            @click="listCats"
          >
            List Cats In Save
          </button>

          <button
            class="rounded border border-neutral-400 px-4 py-2 text-sm disabled:opacity-40"
            :disabled="!reportText"
            @click="copyReport"
          >
            Copy Report
          </button>
        </div>

        <p
          v-if="errorMessage"
          class="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2"
        >
          {{ errorMessage }}
        </p>
      </section>

      <section
        v-if="reportText"
        class="bg-white border border-neutral-200 rounded-lg p-4 md:p-5 space-y-3"
      >
        <h2 class="text-lg font-medium">
          Report
        </h2>

        <textarea
          readonly
          :value="reportText"
          class="w-full min-h-56 rounded border border-neutral-300 p-3 text-xs font-mono"
        />

      </section>

      <section
        v-if="catListText"
        class="bg-white border border-neutral-200 rounded-lg p-4 md:p-5 space-y-3"
      >
        <h2 class="text-lg font-medium">
          Cat Names
        </h2>

        <textarea
          readonly
          :value="catListText"
          class="w-full min-h-56 rounded border border-neutral-300 p-3 text-xs font-mono"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
</style>
