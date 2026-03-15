<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { toast } from 'vue-sonner'
import CatSummaryCard from '../../components/CatSummaryCard.vue'
import shareCoverPlaceholderUrl from '../../assets/share-cover-placeholder.jpg'
import { extractCatByKey } from '../../lib/save'
import { useExportFlowStore } from '../../stores/exportFlow'
import { SHORT_URL_API_BASE } from '../../config/share'
import { writeShareImage } from '../../utils/shareImage'
import {
  buildLongShareUrl,
  createShortShareUrl,
  type CatSharePayload,
} from '../../utils/shareTransfer'

interface FilePondLikeItem {
  file?: File
}

const router = useRouter()
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
const showCatInfo = ref(false)
const importUrlBase = ref(`${window.location.origin}/import`)
const longShareUrl = ref<string | null>(null)
const shortShareUrl = ref<string | null>(null)
const shortShareKey = ref<string | null>(null)
const isGeneratingLongUrl = ref(false)
const isCreatingShortUrl = ref(false)
const isGeneratingShare = ref(false)
const shareError = ref<string | null>(null)
const shortUrlError = ref<string | null>(null)
const longUrlError = ref<string | null>(null)
const shareImageUrl = ref<string | null>(null)
const shareImageFileName = ref('cat-share.jpg')
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

const statusBadges = computed(() => {
  if (!selectedCat.value?.flags) return [] as string[]
  const badges: string[] = []
  if (selectedCat.value.flags.dead) badges.push('Dead')
  if (selectedCat.value.flags.retired) badges.push('Retired')
  if (selectedCat.value.flags.donated) badges.push('Donated')
  return badges
})

const baseStats = computed(() => {
  const s = selectedCat.value?.stats
  if (!s) return null
  return [
    { key: 'STR', value: s.str },
    { key: 'DEX', value: s.dex },
    { key: 'CON', value: s.con },
    { key: 'INT', value: s.int },
    { key: 'SPD', value: s.spd },
    { key: 'CHA', value: s.cha },
    { key: 'LCK', value: s.luck }
  ]
})

const levelBonusStats = computed(() => {
  const s = selectedCat.value?.levelBonuses
  if (!s) return null
  return [
    { key: 'STR', value: s.str },
    { key: 'DEX', value: s.dex },
    { key: 'CON', value: s.con },
    { key: 'INT', value: s.int },
    { key: 'SPD', value: s.spd },
    { key: 'CHA', value: s.cha },
    { key: 'LCK', value: s.luck }
  ]
})

const summaryPairs = computed(() => [
  { label: 'Name', value: selectedCat.value?.name ?? '(unnamed)' },
  { label: 'DB Key', value: selectedCat.value ? String(selectedCat.value.key) : '—' },
  { label: 'ID64', value: selectedCat.value?.id64 ?? '—' },
  { label: 'Age', value: `${selectedCat.value?.ageDays ?? '—'} days` }
])

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
    shortShareUrl.value = created.shortUrl
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

  shortShareUrl.value = null
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
    const shareBlob = await writeShareImage({
      watermarkText,
      portraitFile: effectivePortraitFile,
      jpegQuality: 0.42
    })

    cleanupShareUrl()
    shareImageUrl.value = URL.createObjectURL(shareBlob)

    const safeName = (selectedCat.value.name ?? `cat-${selectedCat.value.key}`)
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    shareImageFileName.value = `${safeName || 'cat'}-share.jpg`
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
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Copy failed')
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
        <h2 class="text-base font-medium text-neutral-100">Export setup</h2>
        <p class="text-sm text-neutral-400">
          Prepare export metadata for <span class="text-neutral-200">{{ selectedCat.name ?? '(unnamed)' }}</span>.
        </p>
      </div>
    </div>

    <CatSummaryCard
      :summary-pairs="summaryPairs"
      :expanded="showCatInfo"
      toggle-label="More details"
      @update:expanded="showCatInfo = $event"
    >
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Name</div>
          <div class="mt-1 text-sm text-neutral-100">{{ selectedCat.name ?? '(unnamed)' }}</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">DB Key</div>
          <div class="mt-1 text-sm text-neutral-100">{{ selectedCat.key }}</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">ID64</div>
          <div class="mt-1 text-sm text-neutral-100 break-all">{{ selectedCat.id64 ?? '—' }}</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Age</div>
          <div class="mt-1 text-sm text-neutral-100">{{ selectedCat.ageDays ?? '—' }} days</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Sex</div>
          <div class="mt-1 text-sm text-neutral-100">{{ selectedCat.sex }}</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Class</div>
          <div class="mt-1 text-sm text-neutral-100">{{ selectedCat.className ?? '—' }}</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Level</div>
          <div class="mt-1 text-sm text-neutral-100">{{ selectedCat.level ?? '—' }}</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Housed</div>
          <div class="mt-1 text-sm text-neutral-100">{{ selectedCat.house ? 'Yes' : 'No' }}</div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3 sm:col-span-2">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Status</div>
          <div class="mt-1 flex items-center gap-2 flex-wrap">
            <span v-if="statusBadges.length === 0" class="text-sm text-neutral-100">Normal</span>
            <span
              v-for="badge in statusBadges"
              :key="badge"
              class="rounded px-2 py-1 text-xs font-medium bg-neutral-700 text-neutral-300"
            >
              {{ badge }}
            </span>
          </div>
        </div>
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3 sm:col-span-2">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Issues</div>
          <div class="mt-1 text-sm text-neutral-100">
            <span v-if="selectedCat.issues.length === 0">None</span>
            <span v-else>{{ selectedCat.issues.length }} issue(s)</span>
          </div>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-2">
        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3 space-y-2">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Base Stats</div>
          <div v-if="baseStats" class="grid grid-cols-4 gap-2">
            <div v-for="stat in baseStats" :key="stat.key" class="rounded border border-neutral-700 px-2 py-1">
              <div class="text-[10px] text-neutral-500">{{ stat.key }}</div>
              <div class="text-sm text-neutral-100">{{ stat.value }}</div>
            </div>
          </div>
          <div v-else class="text-sm text-neutral-400">No base stat block found.</div>
        </div>

        <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3 space-y-2">
          <div class="text-xs uppercase tracking-wide text-neutral-500">Level Bonus Stats</div>
          <div v-if="levelBonusStats" class="grid grid-cols-4 gap-2">
            <div v-for="stat in levelBonusStats" :key="stat.key" class="rounded border border-neutral-700 px-2 py-1">
              <div class="text-[10px] text-neutral-500">{{ stat.key }}</div>
              <div class="text-sm text-neutral-100">{{ stat.value }}</div>
            </div>
          </div>
          <div v-else class="text-sm text-neutral-400">No level bonus stat block found.</div>
        </div>
      </div>

      <div v-if="selectedCat.issues.length > 0" class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3 space-y-2">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Issue Details</div>
        <ul class="space-y-1 text-sm text-neutral-200">
          <li v-for="(issue, index) in selectedCat.issues" :key="`${issue.severity}-${index}`">
            <span class="uppercase text-xs text-neutral-500">{{ issue.severity }}</span>
            : {{ issue.message }}
          </li>
        </ul>
      </div>
    </CatSummaryCard>

    <div class="space-y-2">
      <h3 class="text-sm font-medium text-neutral-200">Portrait image</h3>
      <p class="text-sm text-neutral-400">Optional. Upload an image to use it as the cover.</p>
      <p v-if="portraitName" class="text-xs text-neutral-500">Selected image: {{ portraitName }}</p>
    </div>

    <FilePond
      name="catPortrait"
      :allow-multiple="false"
      :files="portraitFiles"
      credits="false"
      class="export-dropzone"
      label-idle="<span class='filepond--label-action'>Drop portrait image here</span><br>or click to browse"
      @updatefiles="handlePortraitUpdate"
    />

    <div class="space-y-3 rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="text-sm font-medium text-neutral-200">Share image</h3>
          <p class="text-sm text-neutral-400">If you upload an image above, it will be used as the cover.</p>
        </div>
      </div>

      <p v-if="isGeneratingLongUrl || isCreatingShortUrl || isGeneratingShare" class="text-sm text-neutral-400">
        Preparing share image...
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
          Download share image
        </a>
      </div>
    </div>

    <div class="space-y-3 rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-4">
      <div class="space-y-1">
        <h3 class="text-sm font-medium text-neutral-200">Short URL</h3>
        <p class="text-sm text-neutral-400">Good for share, but avoid using this short URL to archive your cat. The validity of this link depends on how long the server stays alive — it may not outlive your cat.</p>
      </div>

      <p v-if="shortUrlError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
        {{ shortUrlError }}
      </p>

      <div v-if="shortShareUrl" class="flex items-start gap-2 rounded border border-neutral-700 bg-neutral-900/50 px-3 py-2">
        <p class="text-xs text-neutral-300 break-all flex-1">{{ shortShareUrl }}</p>
        <button
          class="shrink-0 rounded border border-neutral-600 bg-neutral-700 text-neutral-100 p-1.5 hover:bg-neutral-600 transition-colors"
          title="Copy short URL"
          aria-label="Copy short URL"
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
      <h3 class="text-sm font-medium text-neutral-200">Long URL</h3>
      <p class="text-sm text-neutral-400">Archive your cat with it!</p>

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
          :title="isLongUrlExpanded ? 'Collapse URL' : 'Expand URL'"
          :aria-label="isLongUrlExpanded ? 'Collapse URL' : 'Expand URL'"
          @click="isLongUrlExpanded = !isLongUrlExpanded"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
            <path v-if="isLongUrlExpanded" d="M12 8a1 1 0 0 1 .707.293l5 5a1 1 0 1 1-1.414 1.414L12 10.414l-4.293 4.293a1 1 0 0 1-1.414-1.414l5-5A1 1 0 0 1 12 8Z" />
            <path v-else d="M12 16a1 1 0 0 1-.707-.293l-5-5a1 1 0 1 1 1.414-1.414L12 13.586l4.293-4.293a1 1 0 0 1 1.414 1.414l-5 5A1 1 0 0 1 12 16Z" />
          </svg>
        </button>

        <button
          class="shrink-0 rounded border border-neutral-600 bg-neutral-700 text-neutral-100 p-1.5 hover:bg-neutral-600 transition-colors"
          title="Copy long URL"
          aria-label="Copy long URL"
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
