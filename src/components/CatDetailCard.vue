<script setup lang="ts">
import { computed, ref } from 'vue'
import CatSummaryCard from './CatSummaryCard.vue'

interface CatStatsLike {
  str: number
  dex: number
  con: number
  int: number
  spd: number
  cha: number
  luck: number
}

interface CatFlagLike {
  retired: boolean
  dead: boolean
  donated: boolean
}

interface CatIssueLike {
  severity: string
  message: string
}

interface CatDetailInfo {
  key: number | null
  id64: string | null
  name: string | null
  ageDays: number | null
  sex: string | null
  className: string | null
  level: number | null
  house: unknown | null
  stats: CatStatsLike | null
  levelBonuses: CatStatsLike | null
  flags: CatFlagLike | null
  issues: CatIssueLike[]
}

const props = defineProps<{
  catInfo: CatDetailInfo
}>()

const expanded = ref(false)

const summaryPairs = computed(() => [
  { label: 'Name', value: props.catInfo.name ?? '(unnamed)' },
  { label: 'DB Key', value: props.catInfo.key != null ? String(props.catInfo.key) : '—' },
  { label: 'ID64', value: props.catInfo.id64 ?? '—' },
  { label: 'Age', value: props.catInfo.ageDays != null ? `${props.catInfo.ageDays} days` : '—' }
])

const statusBadges = computed(() => {
  if (!props.catInfo.flags) return [] as string[]

  const badges: string[] = []
  if (props.catInfo.flags.dead) badges.push('Dead')
  if (props.catInfo.flags.retired) badges.push('Retired')
  if (props.catInfo.flags.donated) badges.push('Donated')
  return badges
})

const baseStats = computed(() => {
  const stats = props.catInfo.stats
  if (!stats) return null

  return [
    { key: 'STR', value: stats.str },
    { key: 'DEX', value: stats.dex },
    { key: 'CON', value: stats.con },
    { key: 'INT', value: stats.int },
    { key: 'SPD', value: stats.spd },
    { key: 'CHA', value: stats.cha },
    { key: 'LCK', value: stats.luck }
  ]
})

const levelBonusStats = computed(() => {
  const stats = props.catInfo.levelBonuses
  if (!stats) return null

  return [
    { key: 'STR', value: stats.str },
    { key: 'DEX', value: stats.dex },
    { key: 'CON', value: stats.con },
    { key: 'INT', value: stats.int },
    { key: 'SPD', value: stats.spd },
    { key: 'CHA', value: stats.cha },
    { key: 'LCK', value: stats.luck }
  ]
})
</script>

<template>
  <CatSummaryCard
    :summary-pairs="summaryPairs"
    :expanded="expanded"
    toggle-label="More details"
    @update:expanded="expanded = $event"
  >
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Name</div>
        <div class="mt-1 text-sm text-neutral-100">{{ catInfo.name ?? '(unnamed)' }}</div>
      </div>
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">DB Key</div>
        <div class="mt-1 text-sm text-neutral-100">{{ catInfo.key ?? '—' }}</div>
      </div>
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">ID64</div>
        <div class="mt-1 text-sm text-neutral-100 break-all">{{ catInfo.id64 ?? '—' }}</div>
      </div>
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Age</div>
        <div class="mt-1 text-sm text-neutral-100">{{ catInfo.ageDays != null ? `${catInfo.ageDays} days` : '—' }}</div>
      </div>
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Sex</div>
        <div class="mt-1 text-sm text-neutral-100">{{ catInfo.sex ?? 'Unknown' }}</div>
      </div>
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Class</div>
        <div class="mt-1 text-sm text-neutral-100">{{ catInfo.className ?? '—' }}</div>
      </div>
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Level</div>
        <div class="mt-1 text-sm text-neutral-100">{{ catInfo.level ?? '—' }}</div>
      </div>
      <div class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-neutral-500">Housed</div>
        <div class="mt-1 text-sm text-neutral-100">{{ catInfo.house ? 'Yes' : 'No' }}</div>
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
          <span v-if="catInfo.issues.length === 0">None</span>
          <span v-else>{{ catInfo.issues.length }} issue(s)</span>
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

    <div v-if="catInfo.issues.length > 0" class="rounded-lg border border-neutral-700 bg-neutral-700/30 px-4 py-3 space-y-2">
      <div class="text-xs uppercase tracking-wide text-neutral-500">Issue Details</div>
      <ul class="space-y-1 text-sm text-neutral-200">
        <li v-for="(issue, index) in catInfo.issues" :key="`${issue.severity}-${index}`">
          <span class="uppercase text-xs text-neutral-500">{{ issue.severity }}</span>
          : {{ issue.message }}
        </li>
      </ul>
    </div>
  </CatSummaryCard>
</template>