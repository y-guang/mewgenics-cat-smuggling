<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { extractCatByKey } from '../../lib/save'
import { useExportFlowStore } from '../../stores/exportFlow'
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
const shortApiBase = ref('')
const longShareUrl = ref<string | null>(null)
const shortShareUrl = ref<string | null>(null)
const isGeneratingLongUrl = ref(false)
const isCreatingShortUrl = ref(false)
const isGeneratingShare = ref(false)
const shareError = ref<string | null>(null)
const shortUrlError = ref<string | null>(null)
const longUrlError = ref<string | null>(null)
const shareImageUrl = ref<string | null>(null)
const shareImageFileName = ref('cat-share.jpg')
const extractedPayload = ref<CatSharePayload | null>(null)

function handlePortraitUpdate(items: FilePondLikeItem[]): void {
  const file = items[0]?.file ?? null
  store.setPortrait(file)
  portraitFiles.value = file ? [file] : []
  if (shortShareUrl.value) {
    void generateShareImage(shortShareUrl.value)
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

const defaultInfoRows = computed(() => {
  if (!selectedCat.value) return [] as Array<{ label: string, value: string }>

  const stats = selectedCat.value.stats
    ? `STR ${selectedCat.value.stats.str} DEX ${selectedCat.value.stats.dex} CON ${selectedCat.value.stats.con} INT ${selectedCat.value.stats.int} SPD ${selectedCat.value.stats.spd} CHA ${selectedCat.value.stats.cha} LCK ${selectedCat.value.stats.luck}`
    : '—'

  const statusList: string[] = []
  if (selectedCat.value.flags?.dead) statusList.push('Dead')
  if (selectedCat.value.flags?.retired) statusList.push('Retired')
  if (selectedCat.value.flags?.donated) statusList.push('Donated')

  return [
    { label: 'Name', value: selectedCat.value.name ?? '(unnamed)' },
    { label: 'DB Key', value: String(selectedCat.value.key) },
    { label: 'ID64', value: selectedCat.value.id64 ?? '—' },
    { label: 'Age', value: `${selectedCat.value.ageDays ?? '—'} days` },
    { label: 'Sex', value: selectedCat.value.sex },
    { label: 'Class', value: selectedCat.value.className ?? '—' },
    { label: 'Level', value: selectedCat.value.level != null ? String(selectedCat.value.level) : '—' },
    { label: 'Housed', value: selectedCat.value.house ? 'Yes' : 'No' },
    { label: 'Status', value: statusList.length > 0 ? statusList.join(', ') : 'Normal' },
    { label: 'Stats', value: stats }
  ]
})

function cleanupShareUrl(): void {
  if (!shareImageUrl.value) return
  URL.revokeObjectURL(shareImageUrl.value)
  shareImageUrl.value = null
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

  if (!shortApiBase.value.trim()) {
    shortUrlError.value = 'Please provide your short API base URL first.'
    return
  }

  if (!longShareUrl.value) {
    await generateLongUrl()
    if (!longShareUrl.value) return
  }

  isCreatingShortUrl.value = true

  try {
    shortShareUrl.value = await createShortShareUrl(shortApiBase.value.trim(), longShareUrl.value)
    await generateShareImage(shortShareUrl.value)
  } catch (error) {
    shortUrlError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCreatingShortUrl.value = false
  }
}

async function generateShareImage(watermarkText: string): Promise<void> {
  if (!selectedCat.value) return

  isGeneratingShare.value = true
  shareError.value = null

  try {
    const shareBlob = await writeShareImage({
      watermarkText,
      portraitFile: portraitFile.value,
      defaultInfoRows: defaultInfoRows.value,
      padding: 24,
      jpegQuality: 0.95
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
  await navigator.clipboard.writeText(value)
}

onMounted(() => {
  void generateLongUrl()
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

    <div class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="item in summaryPairs" :key="item.label" class="space-y-1">
          <div class="text-xs uppercase tracking-wide text-neutral-500">{{ item.label }}</div>
          <div class="text-sm text-neutral-100 break-all">{{ item.value }}</div>
        </div>
      </div>

      <button
        class="mt-3 w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors"
        @click="showCatInfo = !showCatInfo"
      >
        <span class="text-xs">More details</span>
        <span class="transition-transform duration-200" :class="showCatInfo ? 'rotate-180' : ''">⌄</span>
      </button>
    </div>

    <div v-if="showCatInfo" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

    <div v-if="showCatInfo" class="grid gap-3 lg:grid-cols-2">
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

    <div v-if="showCatInfo && selectedCat.issues.length > 0" class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3 space-y-2">
      <div class="text-xs uppercase tracking-wide text-neutral-500">Issue Details</div>
      <ul class="space-y-1 text-sm text-neutral-200">
        <li v-for="(issue, index) in selectedCat.issues" :key="`${issue.severity}-${index}`">
          <span class="uppercase text-xs text-neutral-500">{{ issue.severity }}</span>
          : {{ issue.message }}
        </li>
      </ul>
    </div>

    <div class="space-y-2">
      <h3 class="text-sm font-medium text-neutral-200">Portrait image</h3>
      <p class="text-sm text-neutral-400">Optional. If provided, this image is used as the watermark carrier.</p>
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
      <div class="space-y-1">
        <h3 class="text-sm font-medium text-neutral-200">Long URL (gzip payload)</h3>
        <p class="text-sm text-neutral-400">This URL carries the full cat payload inside <code class="text-neutral-300">payload=</code>.</p>
      </div>

      <label class="space-y-1 block">
        <span class="text-xs uppercase tracking-wide text-neutral-500">Import URL base</span>
        <input
          v-model="importUrlBase"
          type="url"
          placeholder="https://example.com/import"
          class="w-full rounded border border-neutral-600 bg-neutral-700 text-neutral-100 placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
        >
      </label>

      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
          :disabled="isGeneratingLongUrl"
          @click="generateLongUrl"
        >
          {{ isGeneratingLongUrl ? 'Generating...' : 'Generate Long URL' }}
        </button>
        <button
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
          :disabled="!longShareUrl"
          @click="copyText(longShareUrl)"
        >
          Copy
        </button>
      </div>

      <p v-if="longUrlError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
        {{ longUrlError }}
      </p>

      <p v-if="longShareUrl" class="text-xs text-neutral-300 break-all rounded border border-neutral-700 bg-neutral-900/50 px-3 py-2">
        {{ longShareUrl }}
      </p>
    </div>

    <div class="space-y-3 rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-4">
      <div class="space-y-1">
        <h3 class="text-sm font-medium text-neutral-200">Short URL</h3>
        <p class="text-sm text-neutral-400">Send long URL to your KV API and get a short URL.</p>
      </div>

      <label class="space-y-1 block">
        <span class="text-xs uppercase tracking-wide text-neutral-500">KV API base URL</span>
        <input
          v-model="shortApiBase"
          type="url"
          placeholder="https://kv.example.com"
          class="w-full rounded border border-neutral-600 bg-neutral-700 text-neutral-100 placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
        >
      </label>

      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
          :disabled="isCreatingShortUrl"
          @click="createShortUrl"
        >
          {{ isCreatingShortUrl ? 'Creating...' : 'Create Short URL' }}
        </button>
        <button
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
          :disabled="!shortShareUrl"
          @click="copyText(shortShareUrl)"
        >
          Copy
        </button>
      </div>

      <p v-if="shortUrlError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
        {{ shortUrlError }}
      </p>

      <p v-if="shortShareUrl" class="text-xs text-neutral-300 break-all rounded border border-neutral-700 bg-neutral-900/50 px-3 py-2">
        {{ shortShareUrl }}
      </p>
    </div>

    <div class="space-y-3 rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="text-sm font-medium text-neutral-200">Share image</h3>
          <p class="text-sm text-neutral-400">Watermark contains the short URL. Portrait is optional. If no portrait is given, an info card image is generated.</p>
        </div>
        <span class="text-xs text-neutral-500">Output format: JPEG + blind watermark</span>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-50"
          :disabled="!shortShareUrl || isGeneratingShare"
          @click="shortShareUrl ? generateShareImage(shortShareUrl) : undefined"
        >
          {{ isGeneratingShare ? 'Generating...' : 'Generate Share Image' }}
        </button>
        <span class="text-xs text-neutral-500">Requires short URL</span>
      </div>

      <p v-if="isGeneratingShare" class="text-sm text-neutral-400">Generating share image...</p>

      <p v-if="shareError" class="text-sm text-red-400 bg-red-950 border border-red-800 rounded p-2">
        {{ shareError }}
      </p>

      <div v-if="shareImageUrl" class="space-y-3">
        <img
          :src="shareImageUrl"
          alt="Cat share image with QR"
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
  </section>
</template>
