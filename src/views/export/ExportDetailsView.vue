<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import { extractCatByKey } from '../../lib/save'
import { useExportFlowStore } from '../../stores/exportFlow'
import { buildCatShareText } from '../../utils/qrPayload'
import { writeShareImage } from '../../utils/shareQrImage'

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
const isGeneratingShare = ref(false)
const shareError = ref<string | null>(null)
const shareImageUrl = ref<string | null>(null)
const shareImageFileName = ref('cat-share.jpg')

function chooseAnotherCat(): void {
  showCatInfo.value = false
  store.resetSelection()
  router.push('/export/select')
}

function changeSave(): void {
  showCatInfo.value = false
  store.resetAll()
  router.push('/export/upload')
}

function handlePortraitUpdate(items: FilePondLikeItem[]): void {
  const file = items[0]?.file ?? null
  store.setPortrait(file)
  portraitFiles.value = file ? [file] : []
  void generateShareImage()
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

async function generateShareImage(): Promise<void> {
  if (!sourceSaveFile.value || !selectedCat.value) return

  isGeneratingShare.value = true
  shareError.value = null

  try {
    const saveBytes = new Uint8Array(await sourceSaveFile.value.arrayBuffer())
    const extracted = await extractCatByKey(saveBytes, selectedCat.value.key)

    const qrText = buildCatShareText({
      v: 1,
      type: 'mewgenics-cat',
      id64: extracted.id64,
      key: extracted.sourceKey,
      name: extracted.name,
      wrappedBlob: extracted.wrappedBlob
    })

    const shareBlob = await writeShareImage({
      qrText,
      portraitFile: portraitFile.value,
      qrSize: 420,
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

onMounted(() => {
  void generateShareImage()
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
      <div class="flex items-center gap-3">
        <button
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors"
          @click="chooseAnotherCat"
        >
          Choose another cat
        </button>
        <button
          class="rounded border border-neutral-600 bg-neutral-700 text-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-600 transition-colors"
          @click="changeSave"
        >
          Change save
        </button>
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
      <p class="text-sm text-neutral-400">Optional. If provided, portrait is placed above the QR in one shareable image.</p>
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
          <p class="text-sm text-neutral-400">QR code is always included. Portrait is optional. The share image updates automatically when portrait changes.</p>
        </div>
        <span class="text-xs text-neutral-500">Output format: JPEG</span>
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
