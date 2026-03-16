<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { storeToRefs } from 'pinia'
import { useExportFlowStore } from '../../stores/exportFlow'

interface FilePondLikeItem {
  file?: File
}

const windowsSavePathHint = '%APPDATA%\\Glaiel Games\\Mewgenics\\<Steam ID>\\saves\\'

const router = useRouter()
const store = useExportFlowStore()
const { isLoading, errorMessage } = storeToRefs(store)
const pondFiles = ref<File[]>([])
const FilePond = vueFilePond()

async function handleFileUpdate(items: FilePondLikeItem[]): Promise<void> {
  const file = items[0]?.file
  if (!file) {
    store.resetAll()
    pondFiles.value = []
    return
  }

  pondFiles.value = [file]
  const ok = await store.loadFromSaveFile(file)
  if (ok) {
    router.push('/export/select')
  } else {
    pondFiles.value = []
  }
}
</script>

<template>
  <section class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-4">
    <div class="space-y-1">
      <h2 class="text-base font-medium text-neutral-100">Source save file</h2>
      <p class="text-sm text-neutral-400">
        Drop a <code class="text-neutral-300">.sav</code> file here or click to browse.
      </p>
    </div>

    <FilePond
      name="sourceSave"
      :allow-multiple="false"
      :files="pondFiles"
      credits="false"
      class="export-dropzone"
      label-idle="<span class='filepond--label-action'>Drop save file here</span><br>or click to browse"
      @updatefiles="handleFileUpdate"
    />

    <div class="rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 space-y-1">
      <p class="text-xs text-neutral-400">
        Windows save path: open this folder, then choose your save from the <span class="text-neutral-200">Steam ID</span> folder.
      </p>
      <input
        readonly
        :value="windowsSavePathHint"
        class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200"
        aria-label="Windows save path"
      >
    </div>

    <div v-if="isLoading" class="rounded-lg border border-neutral-700 bg-neutral-700/40 px-4 py-3 text-sm text-neutral-300">
      Parsing save file and loading cat data...
    </div>

    <p v-if="errorMessage" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ errorMessage }}
    </p>
  </section>
</template>
