<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import CatSummaryCard from '../../components/CatSummaryCard.vue'
import { importCatIntoSave } from '../../lib/save'
import { useImportFlowStore } from '../../stores/importFlow'

interface FilePondLikeItem {
  file?: File
}

const FilePond = vueFilePond()
const router = useRouter()
const store = useImportFlowStore()
const { decodedCat, targetSaveFile } = storeToRefs(store)

if (!decodedCat.value) {
  router.replace('/import')
}

const savePondFiles = ref<File[]>(targetSaveFile.value ? [targetSaveFile.value] : [])
const actionError = ref<string | null>(null)
const isImporting = ref(false)
const importedResult = ref<{ importedKey: number, importedId64: string } | null>(null)

const summaryPairs = computed(() => {
  if (!decodedCat.value) return [] as Array<{ label: string, value: string }>

  return [
    { label: 'Name', value: decodedCat.value.name ?? '(unnamed)' },
    { label: 'Source Key', value: String(decodedCat.value.sourceKey) },
    { label: 'ID64', value: decodedCat.value.id64 },
    { label: 'Blob Bytes', value: String(decodedCat.value.wrappedBlob.byteLength) }
  ]
})

const canRunImport = computed(() => targetSaveFile.value !== null && decodedCat.value !== null && !isImporting.value)

function onSaveFileChange(items: FilePondLikeItem[]): void {
  const file = items[0]?.file ?? null
  store.setTargetSaveFile(file)
  savePondFiles.value = file ? [file] : []
  actionError.value = null
  importedResult.value = null
}

function triggerDownload(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const blob = new Blob([copy.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function exportImportedSave(): Promise<void> {
  if (!targetSaveFile.value || !decodedCat.value) return

  isImporting.value = true
  actionError.value = null
  importedResult.value = null

  try {
    const saveBytes = new Uint8Array(await targetSaveFile.value.arrayBuffer())
    const result = await importCatIntoSave(
      saveBytes,
      {
        id64: decodedCat.value.id64,
        sourceKey: decodedCat.value.sourceKey,
        name: decodedCat.value.name,
        wrappedBlob: decodedCat.value.wrappedBlob,
        originalHouseEntry: null
      },
      { housePlacement: 'safe' }
    )

    const baseName = targetSaveFile.value.name.replace(/\.sav$/i, '')
    const safeCat = (decodedCat.value.name ?? 'cat').replace(/[^A-Za-z0-9_-]+/g, '-')
    const outName = `${baseName}-import-${safeCat || 'cat'}.sav`
    triggerDownload(result.saveBytes, outName)

    importedResult.value = {
      importedKey: result.importedKey,
      importedId64: result.importedId64
    }
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isImporting.value = false
  }
}

function goBack(): void {
  router.push('/import')
}
</script>

<template>
  <section v-if="decodedCat" class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-5">
    <header class="space-y-1">
      <div class="text-xs uppercase tracking-wide text-neutral-500">Step 2 of 2</div>
      <h2 class="text-base font-medium text-neutral-100">Apply to target save</h2>
      <p class="text-sm text-neutral-400">Choose the save file that should receive this cat.</p>
    </header>

    <CatSummaryCard :summary-pairs="summaryPairs" />

    <div class="space-y-2">
      <span class="text-sm text-neutral-300">Target save (.sav)</span>
      <FilePond
        name="targetSave"
        :allow-multiple="false"
        :files="savePondFiles"
        accepted-file-types=".sav"
        credits="false"
        class="export-dropzone"
        label-idle="<span class='filepond--label-action'>Drop target save here</span><br>or click to browse"
        @updatefiles="onSaveFileChange"
      />
    </div>

    <p v-if="actionError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ actionError }}
    </p>

    <p v-if="importedResult" class="text-sm text-green-300 bg-green-950 border border-green-800 rounded p-2">
      Imported as key {{ importedResult.importedKey }} (id64 {{ importedResult.importedId64 }}).
    </p>

    <div class="flex items-center justify-between gap-3 pt-2 flex-wrap">
      <button
        class="rounded border border-neutral-600 bg-neutral-800 text-neutral-100 px-4 py-2 text-sm hover:bg-neutral-700 transition-colors"
        @click="goBack"
      >
        Back
      </button>

      <button
        class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-4 py-2 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
        :disabled="!canRunImport"
        @click="exportImportedSave"
      >
        {{ isImporting ? 'Exporting...' : 'Export Updated Save' }}
      </button>
    </div>
  </section>
</template>