<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import CatDetailCard from '../../components/CatDetailCard.vue'
import { importCatIntoSave, readCatsInfo } from '../../lib/save'
import {
  buildEditedImportCatBlobForSave,
  parseImportCatBlobWithContext,
  type ImportCatBlobInfo,
  type ImportCatEditInfo,
} from '../../lib/save/importCatBlob'
import { useImportFlowStore } from '../../stores/importFlow'

const router = useRouter()
const { t } = useI18n()
const store = useImportFlowStore()
const { decodedCat, targetSaveFile } = storeToRefs(store)

if (!decodedCat.value) {
  router.replace('/import')
}
if (!targetSaveFile.value) {
  router.replace('/import/apply')
}

const isLoading = ref(false)
const actionError = ref<string | null>(null)
const isImporting = ref(false)
const importedResult = ref<{ importedKey: number, importedId64: string } | null>(null)
const parsedCatInfo = ref<ImportCatBlobInfo | null>(null)
const editInfo = ref<ImportCatEditInfo>({
  ageDays: 2,
  flags: {
    retired: false,
    dead: false,
    donated: false
  }
})

const canRunImport = computed(() => targetSaveFile.value !== null && decodedCat.value !== null && !isImporting.value)

const importCatInfo = computed(() => {
  if (!parsedCatInfo.value) return null

  return {
    ...parsedCatInfo.value,
    ageDays: editInfo.value.ageDays,
    flags: { ...editInfo.value.flags }
  }
})

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

function toggleStatus(flag: 'retired' | 'dead' | 'donated'): void {
  editInfo.value = {
    ...editInfo.value,
    flags: {
      ...editInfo.value.flags,
      [flag]: !editInfo.value.flags[flag]
    }
  }
}

async function loadCatDetails(): Promise<void> {
  if (!decodedCat.value || !targetSaveFile.value) return

  isLoading.value = true
  actionError.value = null
  parsedCatInfo.value = null

  try {
    const saveBytes = new Uint8Array(await targetSaveFile.value.arrayBuffer())
    const { currentDay } = await readCatsInfo(saveBytes)
    const info = await parseImportCatBlobWithContext(decodedCat.value.wrappedBlob, {
      sourceKey: decodedCat.value.sourceKey,
      fallbackName: decodedCat.value.name,
      currentDay
    })
    parsedCatInfo.value = info
    editInfo.value = {
      ageDays: info.ageDays ?? 2,
      flags: info.flags
        ? { ...info.flags }
        : { retired: false, dead: false, donated: false }
    }
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

async function exportImportedSave(): Promise<void> {
  if (!targetSaveFile.value || !decodedCat.value) return

  isImporting.value = true
  actionError.value = null
  importedResult.value = null

  try {
    const saveBytes = new Uint8Array(await targetSaveFile.value.arrayBuffer())
    const editedWrappedBlob = await buildEditedImportCatBlobForSave(saveBytes, decodedCat.value.wrappedBlob, editInfo.value)

    const result = await importCatIntoSave(
      saveBytes,
      {
        id64: decodedCat.value.id64,
        sourceKey: decodedCat.value.sourceKey,
        name: decodedCat.value.name,
        wrappedBlob: editedWrappedBlob,
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

onMounted(() => {
  void loadCatDetails()
})
</script>

<template>
  <section v-if="decodedCat && targetSaveFile" class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-5">
    <header class="space-y-1">
      <h2 class="text-base font-medium text-neutral-100">{{ t('import.edit.title') }}</h2>
      <p class="text-sm text-neutral-400">{{ t('import.edit.desc') }}</p>
    </header>

    <div v-if="isLoading" class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3 text-sm text-neutral-300">
      {{ t('import.edit.readingDetails') }}
    </div>

    <CatDetailCard v-if="importCatInfo" :cat-info="importCatInfo" />

    <div class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3 space-y-3">
      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-2">
          <div class="text-xs uppercase tracking-wide text-neutral-500">{{ t('import.edit.ageDays') }}</div>
          <input
            v-model.number="editInfo.ageDays"
            type="number"
            min="0"
            step="1"
            class="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          >
        </label>

        <div class="space-y-2">
          <div class="text-xs uppercase tracking-wide text-neutral-500">{{ t('import.edit.status') }}</div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded border px-3 py-2 text-sm transition-colors"
              :class="editInfo.flags.retired ? 'border-neutral-300 bg-neutral-200 text-neutral-900' : 'border-neutral-600 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'"
              @click="toggleStatus('retired')"
            >
              {{ t('import.edit.retired') }}
            </button>
            <button
              type="button"
              class="rounded border px-3 py-2 text-sm transition-colors"
              :class="editInfo.flags.donated ? 'border-neutral-300 bg-neutral-200 text-neutral-900' : 'border-neutral-600 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'"
              @click="toggleStatus('donated')"
            >
              {{ t('import.edit.donated') }}
            </button>
            <button
              type="button"
              class="rounded border px-3 py-2 text-sm transition-colors"
              :class="editInfo.flags.dead ? 'border-neutral-300 bg-neutral-200 text-neutral-900' : 'border-neutral-600 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'"
              @click="toggleStatus('dead')"
            >
              {{ t('import.edit.dead') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="actionError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ actionError }}
    </p>

    <p v-if="importedResult" class="text-sm text-green-300 bg-green-950 border border-green-800 rounded p-2">
      {{ t('import.edit.importedMsg', { key: importedResult.importedKey, id64: importedResult.importedId64 }) }}
    </p>

    <div class="flex items-center justify-end gap-3 pt-2 flex-wrap">
      <button
        class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-4 py-2 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
        :disabled="!canRunImport"
        @click="exportImportedSave"
      >
        {{ isImporting ? t('import.edit.exporting') : t('import.edit.exportBtn') }}
      </button>
    </div>
  </section>
</template>