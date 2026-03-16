<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { storeToRefs } from 'pinia'
import { useExportFlowStore } from '../../stores/exportFlow'

interface FilePondLikeItem {
  file?: File
}

const windowsSavePathHint = '%APPDATA%\\Glaiel Games\\Mewgenics\\<Steam ID>\\saves\\'

const { t } = useI18n()
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
      <h2 class="text-base font-medium text-neutral-100">{{ t('export.upload.title') }}</h2>
      <p class="text-sm text-neutral-400">
        {{ t('export.upload.desc', { ext: '.sav' }) }}
      </p>
    </div>

    <FilePond
      name="sourceSave"
      :allow-multiple="false"
      :files="pondFiles"
      credits="false"
      class="export-dropzone"
      :label-idle="`<span class='filepond--label-action'>${t('export.upload.dropzone')}</span><br>${t('common.orBrowse')}`"
      @updatefiles="handleFileUpdate"
    />

    <div class="rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 space-y-1">
      <p class="text-xs text-neutral-400" v-html="t('savePathHint.label', { steamId: `<span class=\'text-neutral-200\'>${t('savePathHint.steamId')}</span>` })" />
      <input
        readonly
        :value="windowsSavePathHint"
        class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200"
        :aria-label="t('savePathHint.ariaLabel')"
      >
    </div>

    <div v-if="isLoading" class="rounded-lg border border-neutral-700 bg-neutral-700/40 px-4 py-3 text-sm text-neutral-300">
      {{ t('export.upload.parsing') }}
    </div>

    <p v-if="errorMessage" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ errorMessage }}
    </p>
  </section>
</template>
