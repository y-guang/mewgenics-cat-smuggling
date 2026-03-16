<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { useImportFlowStore } from '../../stores/importFlow'

interface FilePondLikeItem {
  file?: File
}

const FilePond = vueFilePond()
const route = useRoute()
const router = useRouter()
const store = useImportFlowStore()
const { decodedCat, carrierImageFile, isDecoding, decodeError, targetSaveFile } = storeToRefs(store)

const carrierImageFiles = ref<File[]>(carrierImageFile.value ? [carrierImageFile.value] : [])

const hasRoutePayload = computed(() => {
  const payloadQuery = route.query.payload
  const shareQuery = route.query.share
  return (typeof payloadQuery === 'string' && payloadQuery.length > 0)
    || (typeof shareQuery === 'string' && shareQuery.length > 0)
})

async function moveToApplyIfReady(): Promise<void> {
  if (decodedCat.value) {
    await router.replace('/import/apply')
  }
}

async function onCarrierImageChange(items: FilePondLikeItem[]): Promise<void> {
  const file = items[0]?.file ?? null
  carrierImageFiles.value = file ? [file] : []
  const ok = await store.loadFromCarrierImage(file)
  if (ok) {
    await moveToApplyIfReady()
  }
}

onMounted(async () => {
  if (!hasRoutePayload.value) {
    store.resetAll()
    carrierImageFiles.value = []
    return
  }

  const ok = await store.loadFromRouteQuery(route.query, window.location.href)
  if (ok) {
    await moveToApplyIfReady()
  }
})
</script>

<template>
  <section class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-5">
    <header class="space-y-1">
      <h2 class="text-base font-medium text-neutral-100">Load shared cat</h2>
      <p class="text-sm text-neutral-400">Open an import URL with params, or provide the exported share image.</p>
    </header>

    <div v-if="hasRoutePayload && isDecoding" class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3 text-sm text-neutral-300">
      Reading cat from URL...
    </div>

    <div class="space-y-2">
      <span class="text-sm text-neutral-300">Share image</span>
      <FilePond
        name="carrierImage"
        :allow-multiple="false"
        :files="carrierImageFiles"
        accepted-file-types="image/jpeg, image/png, image/webp"
        credits="false"
        class="export-dropzone"
        label-idle="<span class='filepond--label-action'>Drop share image here</span><br>or click to browse"
        @updatefiles="onCarrierImageChange"
      />
    </div>

    <p v-if="decodeError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ decodeError }}
    </p>
  </section>
</template>