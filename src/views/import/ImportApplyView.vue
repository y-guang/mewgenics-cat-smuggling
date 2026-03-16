<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import CatDetailCard from '../../components/CatDetailCard.vue'
import { readCatsInfo } from '../../lib/save'
import { useImportFlowStore } from '../../stores/importFlow'

interface FilePondLikeItem {
  file?: File
}

const windowsSavePathHint = '%APPDATA%\\Glaiel Games\\Mewgenics\\<Steam ID>\\saves\\'

const FilePond = vueFilePond()
const router = useRouter()
const store = useImportFlowStore()
const { decodedCat } = storeToRefs(store)

if (!decodedCat.value) {
  router.replace('/import')
}

const savePondFiles = ref<File[]>([])
const selectError = ref<string | null>(null)
const isLoading = ref(false)

onMounted(() => {
  store.clearTargetSave()
})

const importCatInfo = computed(() => {
  if (!decodedCat.value) return null

  return {
    key: decodedCat.value.sourceKey,
    id64: decodedCat.value.id64,
    name: decodedCat.value.name,
    ageDays: null,
    sex: 'Unknown',
    className: null,
    level: null,
    house: null,
    stats: null,
    levelBonuses: null,
    flags: null,
    issues: []
  }
})

async function onSaveFileChange(items: FilePondLikeItem[]): Promise<void> {
  const file = items[0]?.file ?? null
  selectError.value = null
  if (!file) {
    store.setTargetSaveFile(null)
    savePondFiles.value = []
    return
  }

  if (!file.name.toLowerCase().endsWith('.sav')) {
    selectError.value = 'Please select a .sav file.'
    savePondFiles.value = []
    return
  }

  isLoading.value = true
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    await readCatsInfo(bytes)
    store.setTargetSaveFile(file)
    savePondFiles.value = [file]
    router.push('/import/edit')
  } catch (error) {
    selectError.value = error instanceof Error ? error.message : 'Failed to read save file.'
    savePondFiles.value = []
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <section v-if="decodedCat" class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-5">
    <header class="space-y-1">
      <h2 class="text-base font-medium text-neutral-100">Choose target save</h2>
      <p class="text-sm text-neutral-400">Select the destination save file. You will get a new cat in your save file! Don't forget to back up your original save file.</p>
    </header>

    <CatDetailCard v-if="importCatInfo" :cat-info="importCatInfo" />

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
      <div class="rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 space-y-1">
        <p class="text-xs text-neutral-400">
          Windows save path: open this folder, then pick your file from the <span class="text-neutral-200">Steam ID</span> folder.
        </p>
        <input
          readonly
          :value="windowsSavePathHint"
          class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200"
          aria-label="Windows save path"
        >
      </div>
    </div>

    <div v-if="isLoading" class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3 text-sm text-neutral-300">
      Validating save file...
    </div>

    <p v-if="selectError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ selectError }}
    </p>

  </section>
</template>