<script setup lang="ts">
import { computed, useSlots } from 'vue'

interface SummaryPair {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  summaryPairs: SummaryPair[]
  expanded?: boolean
  toggleLabel?: string
}>(), {
  expanded: false,
  toggleLabel: 'More details'
})

const emit = defineEmits<{
  'update:expanded': [value: boolean]
}>()

const slots = useSlots()
const hasDetails = computed(() => Boolean(slots.default))

function toggleExpanded(): void {
  emit('update:expanded', !props.expanded)
}
</script>

<template>
  <div class="rounded-lg border border-neutral-700 bg-neutral-700/20 px-4 py-3 space-y-3">
    <div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="item in summaryPairs" :key="item.label" class="space-y-1">
          <div class="text-xs uppercase tracking-wide text-neutral-500">{{ item.label }}</div>
          <div class="text-sm text-neutral-100 break-all">{{ item.value }}</div>
        </div>
      </div>

      <button
        v-if="hasDetails"
        class="mt-3 w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors"
        @click="toggleExpanded"
      >
        <span class="text-xs">{{ toggleLabel }}</span>
        <span class="transition-transform duration-200" :class="expanded ? 'rotate-180' : ''">⌄</span>
      </button>
    </div>

    <slot v-if="hasDetails && expanded" />
  </div>
</template>