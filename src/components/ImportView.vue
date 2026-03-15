<script setup lang="ts">
import { computed, ref } from 'vue'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { importCatIntoSave } from '../lib/save'
import { type DecodedCatSharePayload, parseCatShareText } from '../utils/qrPayload'
import { readShareImage } from '../utils/shareQrImage'

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

const saveFile = ref<File | null>(null)
const catFile = ref<File | null>(null)
const savePondFiles = ref<File[]>([])
const catPondFiles = ref<File[]>([])
const decodedCat = ref<DecodedImportCat | null>(null)
const decodeError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const isImporting = ref(false)
const importedResult = ref<{ importedKey: number, importedId64: string } | null>(null)

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

async function decodeCatFile(file: File): Promise<DecodedImportCat> {
  if (isImageFile(file)) {
    const qrText = await readShareImage(file)
    if (!qrText) {
      throw new Error('No QR payload was found in the selected image.')
    }

    const parsed = parseCatShareText(qrText)
    if (!parsed) {
      throw new Error('QR payload exists but is not a valid cat share payload.')
    }

    return normalizePayload(parsed)
  }

  const text = (await file.text()).trim()
  const parsed = parseCatShareText(text)
  if (!parsed) {
    throw new Error('Selected cat file is not a valid share payload. Use a share image from Export Setup.')
  }

  return normalizePayload(parsed)
}

async function onCatFileChange(items: FilePondLikeItem[]): Promise<void> {
  const file = items[0]?.file ?? null
  catFile.value = file
  catPondFiles.value = file ? [file] : []
  decodedCat.value = null
  decodeError.value = null
  actionError.value = null
  importedResult.value = null

  if (!file) return

  try {
    decodedCat.value = await decodeCatFile(file)
  } catch (error) {
    decodeError.value = error instanceof Error ? error.message : String(error)
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
      <p class="text-sm text-neutral-400">Select target save and exported cat file, then export the updated save.</p>
    </header>

    <section class="grid gap-4 md:grid-cols-2">
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

      <div class="space-y-2">
        <span class="text-sm text-neutral-300">Cat file (share image or payload text)</span>
        <FilePond
          name="catPayload"
          :allow-multiple="false"
          :files="catPondFiles"
          accepted-file-types="image/jpeg, image/png, image/webp, text/plain"
          credits="false"
          class="export-dropzone"
          label-idle="<span class='filepond--label-action'>Drop cat share file here</span><br>or click to browse"
          @updatefiles="onCatFileChange"
        />
      </div>
    </section>

    <p v-if="decodeError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
      {{ decodeError }}
    </p>

    <section v-if="decodedCat" class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3 space-y-3">
      <h3 class="text-sm font-medium text-neutral-200">Decoded cat info</h3>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="space-y-1">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Name</div>
          <div class="text-sm text-neutral-100">{{ decodedCat.name ?? '(unnamed)' }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Source key</div>
          <div class="text-sm text-neutral-100">{{ decodedCat.sourceKey }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-xs uppercase tracking-wide text-neutral-500">ID64</div>
          <div class="text-sm text-neutral-100 break-all">{{ decodedCat.id64 }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Blob bytes</div>
          <div class="text-sm text-neutral-100">{{ decodedCat.wrappedBlob.byteLength }}</div>
        </div>
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
