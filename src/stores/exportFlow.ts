import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { readCatsInfo, type CatInfoRecord } from '../lib/save'

export const useExportFlowStore = defineStore('exportFlow', () => {
  const sourceSaveFile = ref<File | null>(null)
  const cats = ref<CatInfoRecord[]>([])
  const selectedCatKey = ref<number | null>(null)
  const portraitFile = ref<File | null>(null)
  const isLoading = ref(false)
  const errorMessage = ref<string | null>(null)

  const selectedCat = computed(() => cats.value.find((cat) => cat.key === selectedCatKey.value) ?? null)

  function resetAll(): void {
    sourceSaveFile.value = null
    cats.value = []
    selectedCatKey.value = null
    portraitFile.value = null
    isLoading.value = false
    errorMessage.value = null
  }

  function resetSelection(): void {
    selectedCatKey.value = null
    portraitFile.value = null
  }

  function setPortrait(file: File | null): void {
    portraitFile.value = file
  }

  function selectCat(key: number): void {
    selectedCatKey.value = key
  }

  async function loadFromSaveFile(file: File): Promise<boolean> {
    if (!file.name.toLowerCase().endsWith('.sav')) {
      errorMessage.value = 'Please select a .sav file.'
      return false
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await readCatsInfo(bytes)
      sourceSaveFile.value = file
      cats.value = result.cats
      selectedCatKey.value = null
      portraitFile.value = null
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    sourceSaveFile,
    cats,
    selectedCatKey,
    selectedCat,
    portraitFile,
    isLoading,
    errorMessage,
    resetAll,
    resetSelection,
    setPortrait,
    selectCat,
    loadFromSaveFile
  }
})
