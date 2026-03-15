<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import CatSummaryCard from './CatSummaryCard.vue'
import { importCatIntoSave } from '../lib/save'
import { SHORT_URL_API_BASE } from '../config/share'
import { readShareImageWatermark } from '../utils/shareImage'
import {
  extractPayloadTokenFromUrl,
  parseLongShareUrl,
  parsePayloadToken,
  resolveShortShareKey,
  resolveShortShareUrl,
  type DecodedCatSharePayload,
} from '../utils/shareTransfer'

interface DecodedImportCat {
  id64: string
  sourceKey: number
  name: string | null
  wrappedBlob: Uint8Array
}

interface FilePondLikeItem {
  file?: File
}

const FilePond = vueFilePond()
const route = useRoute()

const saveFile = ref<File | null>(null)
const carrierImageFile = ref<File | null>(null)
const savePondFiles = ref<File[]>([])
const carrierImageFiles = ref<File[]>([])
const decodedCat = ref<DecodedImportCat | null>(null)
const resolvedLongUrl = ref<string | null>(null)
const decodeError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const isImporting = ref(false)
const isDecoding = ref(false)
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

const hasRoutePayload = computed(() => {
  const payloadQuery = route.query.payload
  const shareQuery = route.query.share
  return (typeof payloadQuery === 'string' && payloadQuery.length > 0)
    || (typeof shareQuery === 'string' && shareQuery.length > 0)
})

const currentStep = computed(() => {
  if (!decodedCat.value) return 1
  return 2
})

function normalizePayload(payload: DecodedCatSharePayload): DecodedImportCat {
  return {
    id64: payload.id64,
    sourceKey: payload.key,
    name: payload.name,
    wrappedBlob: payload.wrappedBlob
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const lower = file.name.toLowerCase()
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')
}

async function decodeFromUrl(rawUrl: string): Promise<DecodedImportCat> {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    throw new Error('Share URL is empty.')
  }

  let longUrl = trimmed
  let parsed = await parseLongShareUrl(longUrl)

  if (!parsed) {
    longUrl = await resolveShortShareUrl(trimmed)
    parsed = await parseLongShareUrl(longUrl)
    if (!parsed) {
      throw new Error('Short URL resolved, but no valid payload was found in the long URL.')
    }
  }

  resolvedLongUrl.value = longUrl
  return normalizePayload(parsed)
}

async function decodeFromKey(key: string): Promise<DecodedImportCat> {
  const trimmed = key.trim()
  if (!trimmed) {
    throw new Error('Short key is empty.')
  }

  const longUrl = await resolveShortShareKey(SHORT_URL_API_BASE, trimmed)
  const parsed = await parseLongShareUrl(longUrl)
  if (!parsed) {
    throw new Error('Short key resolved, but no valid payload was found in the long URL.')
  }

  resolvedLongUrl.value = longUrl
  return normalizePayload(parsed)
}

async function decodeAndSet(rawUrl: string): Promise<void> {
  isDecoding.value = true
  decodeError.value = null
  actionError.value = null
  importedResult.value = null
  decodedCat.value = null
  resolvedLongUrl.value = null

  try {
    decodedCat.value = await decodeFromUrl(rawUrl)
  } catch (error) {
    decodeError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDecoding.value = false
  }
}

async function onCarrierImageChange(items: FilePondLikeItem[]): Promise<void> {
  const file = items[0]?.file ?? null
  carrierImageFile.value = file
  carrierImageFiles.value = file ? [file] : []
  decodedCat.value = null
  decodeError.value = null
  actionError.value = null
  importedResult.value = null
  resolvedLongUrl.value = null

  if (!file) return
  if (!isImageFile(file)) {
    decodeError.value = 'Please select a JPG/PNG/WebP image.'
    return
  }

  try {
    const watermark = await readShareImageWatermark(file)
    if (!watermark) {
      throw new Error('No short key watermark found in this image.')
    }
    await decodeAndSetFromKey(watermark)
  } catch (error) {
    decodeError.value = error instanceof Error ? error.message : String(error)
  }
}

async function decodeAndSetFromKey(shortKey: string): Promise<void> {
  isDecoding.value = true
  decodeError.value = null
  actionError.value = null
  importedResult.value = null
  decodedCat.value = null
  resolvedLongUrl.value = null

  try {
    decodedCat.value = await decodeFromKey(shortKey)
  } catch (error) {
    decodeError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDecoding.value = false
  }
}

function onSaveFileChange(items: FilePondLikeItem[]): void {
  const file = items[0]?.file ?? null
  saveFile.value = file
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

const canRunImport = computed(() => saveFile.value !== null && decodedCat.value !== null && !isImporting.value)

onMounted(async () => {
  const payloadQuery = route.query.payload
  if (typeof payloadQuery === 'string' && payloadQuery.length > 0) {
    const parsed = await parsePayloadToken(payloadQuery)
    if (parsed) {
      decodedCat.value = normalizePayload(parsed)
      const url = new URL(window.location.href)
      if (!url.searchParams.has('payload')) {
        return
      }
      resolvedLongUrl.value = window.location.href
      return
    }
  }

  const shareQuery = route.query.share
  if (typeof shareQuery === 'string' && shareQuery.length > 0) {
    let normalized = shareQuery
    if (extractPayloadTokenFromUrl(shareQuery) === null) {
      try {
        normalized = decodeURIComponent(shareQuery)
      } catch {
        normalized = shareQuery
      }
    }
    await decodeAndSet(normalized)
  }
})

async function exportImportedSave(): Promise<void> {
  if (!saveFile.value || !decodedCat.value) return

  isImporting.value = true
  actionError.value = null
  importedResult.value = null

  try {
    const saveBytes = new Uint8Array(await saveFile.value.arrayBuffer())
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

    const baseName = saveFile.value.name.replace(/\.sav$/i, '')
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
</script>

<template>
  <div class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-5">
    <header class="space-y-1">
      <h2 class="text-base font-medium text-neutral-100">Import a cat</h2>
      <p class="text-sm text-neutral-400">Use a share link with URL params or provide a share image, then export the updated save.</p>
    </header>

    <section class="space-y-4">
      <div class="space-y-1">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Step {{ currentStep }} of 2</div>
        <h3 class="text-sm font-medium text-neutral-200">Step 1 · Open a share link or provide the share image</h3>
        <p class="text-sm text-neutral-400">If you opened an import URL with params, the cat will load automatically. Otherwise, provide the share image below.</p>
      </div>

      <div v-if="hasRoutePayload && isDecoding" class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3 text-sm text-neutral-300">
        Reading cat from URL...
      </div>

      <div v-if="!decodedCat" class="space-y-2">
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
    </section>

    <p v-if="decodeError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ decodeError }}
    </p>

    <section v-if="decodedCat" class="space-y-4">
      <div class="space-y-1">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Step 2 of 2</div>
        <h3 class="text-sm font-medium text-neutral-200">Step 2 · Export the updated save</h3>
      </div>

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
    </section>

    <p v-if="actionError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ actionError }}
    </p>

    <p v-if="importedResult" class="text-sm text-green-300 bg-green-950 border border-green-800 rounded p-2">
      Imported as key {{ importedResult.importedKey }} (id64 {{ importedResult.importedId64 }}).
    </p>

    <div class="pt-2">
      <button
        class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-4 py-2 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
        :disabled="!canRunImport"
        @click="exportImportedSave"
      >
        {{ isImporting ? 'Exporting...' : 'Export Updated Save' }}
      </button>
    </div>
  </div>
</template>
