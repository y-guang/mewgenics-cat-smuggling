<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import CatDetailCard from '../../components/CatDetailCard.vue'
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
const selectError = ref<string | null>(null)

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

function onSaveFileChange(items: FilePondLikeItem[]): void {
  const file = items[0]?.file ?? null
  store.setTargetSaveFile(file)
  savePondFiles.value = file ? [file] : []
  selectError.value = null
  if (file) {
    router.push('/import/edit')
  }
}
</script>

<template>
  <section v-if="decodedCat" class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-5">
    <header class="space-y-1">
      <h2 class="text-base font-medium text-neutral-100">Choose target save</h2>
      <p class="text-sm text-neutral-400">Select the destination save file. You will edit age/status in the next step.</p>
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
    </div>

    <p v-if="selectError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ selectError }}
    </p>

  </section>
</template>