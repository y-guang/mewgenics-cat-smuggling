<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { toast } from 'vue-sonner'
import CatDetailCard from '../../components/CatDetailCard.vue'
import shareCoverPlaceholderUrl from '../../assets/share-cover-placeholder.jpg'
import { extractCatByKey } from '../../lib/save'
import { useExportFlowStore } from '../../stores/exportFlow'
import { SHORT_URL_API_BASE } from '../../config/share'
import { writeShareImage } from '../../utils/shareImage'
import {
  buildLongShareUrl,
  createShortShareUrl,
  extractPayloadTokenFromUrl,
  type CatSharePayload,
} from '../../utils/shareTransfer'

interface FilePondLikeItem {
  file?: File
}

const router = useRouter()
const { t } = useI18n()
const store = useExportFlowStore()
const { sourceSaveFile, selectedCat, portraitFile } = storeToRefs(store)
const FilePond = vueFilePond()

if (!sourceSaveFile.value) {
  router.replace('/export/upload')
}
if (!selectedCat.value) {
  router.replace('/export/select')
}

const portraitFiles = ref<File[]>(portraitFile.value ? [portraitFile.value] : [])
const importUrlBase = ref(new URL('#/import', window.location.href).toString())
const longShareUrl = ref<string | null>(null)
const shortShareKey = ref<string | null>(null)
const isGeneratingLongUrl = ref(false)
const isCreatingShortUrl = ref(false)
const isGeneratingShare = ref(false)
const shareError = ref<string | null>(null)
const shortUrlError = ref<string | null>(null)
const longUrlError = ref<string | null>(null)
const shareImageUrl = ref<string | null>(null)
const shareImageFileName = ref('cat-share.png')
const extractedPayload = ref<CatSharePayload | null>(null)
const refreshRunId = ref(0)
const isLongUrlExpanded = ref(false)
let defaultCoverFilePromise: Promise<File> | null = null

function handlePortraitUpdate(items: FilePondLikeItem[]): void {
  const file = items[0]?.file ?? null
  store.setPortrait(file)
  portraitFiles.value = file ? [file] : []
  if (shortShareKey.value) {
    void generateShareImage(shortShareKey.value)
  }
}

const portraitName = computed(() => portraitFile.value?.name ?? null)
const shortShareUrl = computed(() => {
  if (!shortShareKey.value) return null
  const url = new URL(importUrlBase.value)
  url.searchParams.set('share', shortShareKey.value)
  return url.toString()
})

function cleanupShareUrl(): void {
  if (!shareImageUrl.value) return
  URL.revokeObjectURL(shareImageUrl.value)
  shareImageUrl.value = null
}

async function getDefaultCoverFile(): Promise<File> {
  if (!defaultCoverFilePromise) {
    defaultCoverFilePromise = (async () => {
      const response = await fetch(shareCoverPlaceholderUrl)
      if (!response.ok) {
        throw new Error('Failed to load default share cover image.')
      }

      const blob = await response.blob()
      return new File([blob], 'share-cover-placeholder.jpg', { type: blob.type || 'image/jpeg' })
    })()
  }

  return await defaultCoverFilePromise
}

async function extractPayload(): Promise<CatSharePayload> {
  if (!sourceSaveFile.value || !selectedCat.value) {
    throw new Error('Source save and selected cat are required.')
  }

  if (extractedPayload.value) return extractedPayload.value

  const saveBytes = new Uint8Array(await sourceSaveFile.value.arrayBuffer())
  const extracted = await extractCatByKey(saveBytes, selectedCat.value.key)
  extractedPayload.value = {
    v: 2,
    type: 'mewgenics-cat',
    id64: extracted.id64,
    key: extracted.sourceKey,
    name: extracted.name,
    wrappedBlob: extracted.wrappedBlob,
  }
  return extractedPayload.value
}

async function generateLongUrl(): Promise<void> {
  isGeneratingLongUrl.value = true
  longUrlError.value = null

  try {
    const payload = await extractPayload()
    longShareUrl.value = await buildLongShareUrl(payload, importUrlBase.value)
  } catch (error) {
    longShareUrl.value = null
    longUrlError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isGeneratingLongUrl.value = false
  }
}

async function createShortUrl(): Promise<void> {
  shortUrlError.value = null
  if (!longShareUrl.value) return

  isCreatingShortUrl.value = true

  try {
    const created = await createShortShareUrl(SHORT_URL_API_BASE, longShareUrl.value)
    shortShareKey.value = created.key
    await generateShareImage(created.key)
  } catch (error) {
    shortUrlError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCreatingShortUrl.value = false
  }
}

async function refreshShareArtifacts(): Promise<void> {
  const runId = ++refreshRunId.value

  shortShareKey.value = null
  shortUrlError.value = null
  shareError.value = null
  cleanupShareUrl()

  await generateLongUrl()
  if (refreshRunId.value !== runId || !longShareUrl.value) return

  await createShortUrl()
}

async function generateShareImage(watermarkText: string): Promise<void> {
  if (!selectedCat.value) return

  isGeneratingShare.value = true
  shareError.value = null

  try {
    const effectivePortraitFile = portraitFile.value ?? await getDefaultCoverFile()
    const longPayloadToken = longShareUrl.value
      ? (extractPayloadTokenFromUrl(longShareUrl.value) ?? undefined)
      : undefined
    const shareBlob = await writeShareImage({
      watermarkText,
      longPayloadToken,
      portraitFile: effectivePortraitFile,
    })

    cleanupShareUrl()
    shareImageUrl.value = URL.createObjectURL(shareBlob)

    const safeName = (selectedCat.value.name ?? `cat-${selectedCat.value.key}`)
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    shareImageFileName.value = `${safeName || 'cat'}-share.png`
  } catch (error) {
    cleanupShareUrl()
    shareError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isGeneratingShare.value = false
  }
}

async function copyText(value: string | null): Promise<void> {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copied'))
  } catch {
    toast.error(t('common.copyFailed'))
  }
}

onMounted(() => {
  void refreshShareArtifacts()
})

onBeforeUnmount(() => {
  cleanupShareUrl()
})
</script>

<template>
  <section v-if="selectedCat" class="bg-neutral-800 border border-neutral-700 rounded-lg p-5 space-y-5">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="space-y-1">
        <h2 class="text-base font-medium text-neutral-100">{{ t('export.details.title') }}</h2>
        <p class="text-sm text-neutral-400">
          {{ t('export.details.desc', { name: selectedCat.name ?? t('cat.unnamed') }) }}
        </p>
      </div>
    </div>

    <CatDetailCard :cat-info="selectedCat" />

    <div class="space-y-2">
      <h3 class="text-sm font-medium text-neutral-200">{{ t('export.details.coverTitle') }}</h3>
      <p class="text-sm text-neutral-400">{{ t('export.details.coverDesc') }}</p>
      <p v-if="portraitName" class="text-xs text-neutral-500">{{ t('export.details.coverSelected', { name: portraitName }) }}</p>
    </div>

    <FilePond
      name="catPortrait"
      :allow-multiple="false"
      :files="portraitFiles"
      credits="false"
      class="export-dropzone"
      :label-idle="`<span class='filepond--label-action'>${t('export.details.dropCover')}</span><br>${t('common.orBrowse')}`"
      @updatefiles="handlePortraitUpdate"
    />

    <div class="space-y-3 rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="text-sm font-medium text-neutral-200">{{ t('export.details.shareTitle') }}</h3>
          <p class="mt-2 text-sm text-neutral-400">
            <span class="font-medium text-neutral-200">{{ t('export.details.shareHint') }}</span>
          </p>
        </div>
      </div>

      <p v-if="isGeneratingLongUrl || isCreatingShortUrl || isGeneratingShare" class="text-sm text-neutral-400">
        {{ t('export.details.preparing') }}
      </p>

      <p v-if="shareError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
        {{ shareError }}
      </p>

      <div v-if="shareImageUrl" class="space-y-3">
        <img
          :src="shareImageUrl"
          alt="Cat share image with short-key watermark"
          class="w-full max-w-xl rounded border border-neutral-700 bg-neutral-900"
        >
        <a
          :href="shareImageUrl"
          :download="shareImageFileName"
          class="inline-flex rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors"
        >
          {{ t('export.details.download') }}
        </a>
      </div>
    </div>

    <div class="space-y-3 rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-4">
      <div class="space-y-1">
        <h3 class="text-sm font-medium text-neutral-200">{{ t('export.details.shortUrlTitle') }}</h3>
        <p class="text-sm text-neutral-400">{{ t('export.details.shortUrlDesc') }}</p>
      </div>

      <p v-if="shortUrlError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
        {{ shortUrlError }}
      </p>

      <div v-if="shortShareUrl" class="flex items-start gap-2 rounded border border-neutral-700 bg-neutral-900/50 px-3 py-2">
        <p class="text-xs text-neutral-300 break-all flex-1">{{ shortShareUrl }}</p>
        <button
          class="shrink-0 rounded border border-neutral-600 bg-neutral-700 text-neutral-100 p-1.5 hover:bg-neutral-600 transition-colors"
          :title="t('export.details.copyShortUrl')"
          :aria-label="t('export.details.copyShortUrl')"
          @click="copyText(shortShareUrl)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
            <path d="M8 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1v-2h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v1H8V7Z" />
            <path d="M6 9a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-7a3 3 0 0 0-3-3H6Zm-1 3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Z" />
          </svg>
        </button>
      </div>

    </div>

    <div class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-4 space-y-3">
      <h3 class="text-sm font-medium text-neutral-200">{{ t('export.details.longUrlTitle') }}</h3>
      <p class="text-sm text-neutral-400">{{ t('export.details.longUrlDesc') }}</p>

      <p v-if="longUrlError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
        {{ longUrlError }}
      </p>

      <div v-if="longShareUrl" class="flex items-start gap-2 rounded border border-neutral-700 bg-neutral-900/50 px-3 py-2">
        <p
          class="text-xs text-neutral-300 flex-1"
          :class="isLongUrlExpanded ? 'break-all' : 'truncate'"
        >
          {{ longShareUrl }}
        </p>

        <button
          class="shrink-0 rounded border border-neutral-600 bg-neutral-700 text-neutral-100 p-1.5 hover:bg-neutral-600 transition-colors"
          :title="isLongUrlExpanded ? t('export.details.collapseUrl') : t('export.details.expandUrl')"
          :aria-label="isLongUrlExpanded ? t('export.details.collapseUrl') : t('export.details.expandUrl')"
          @click="isLongUrlExpanded = !isLongUrlExpanded"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
            <path v-if="isLongUrlExpanded" d="M12 8a1 1 0 0 1 .707.293l5 5a1 1 0 1 1-1.414 1.414L12 10.414l-4.293 4.293a1 1 0 0 1-1.414-1.414l5-5A1 1 0 0 1 12 8Z" />
            <path v-else d="M12 16a1 1 0 0 1-.707-.293l-5-5a1 1 0 1 1 1.414-1.414L12 13.586l4.293-4.293a1 1 0 0 1 1.414 1.414l-5 5A1 1 0 0 1 12 16Z" />
          </svg>
        </button>

        <button
          class="shrink-0 rounded border border-neutral-600 bg-neutral-700 text-neutral-100 p-1.5 hover:bg-neutral-600 transition-colors"
          :title="t('export.details.copyLongUrl')"
          :aria-label="t('export.details.copyLongUrl')"
          @click="copyText(longShareUrl)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
            <path d="M8 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1v-2h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v1H8V7Z" />
            <path d="M6 9a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-7a3 3 0 0 0-3-3H6Zm-1 3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Z" />
          </svg>
        </button>
      </div>
    </div>

  </section>
</template>
