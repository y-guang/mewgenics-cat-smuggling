<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <RouterLink
      to="/export/upload"
      class="rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 transition-colors p-8 text-left space-y-2"
    >
      <div class="text-lg font-medium text-neutral-100">{{ t('home.exportTitle') }}</div>
      <div class="text-sm text-neutral-400">{{ t('home.exportDesc') }}</div>
    </RouterLink>

    <RouterLink
      to="/import"
      class="rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 transition-colors p-8 text-left space-y-2"
    >
      <div class="text-lg font-medium text-neutral-100">{{ t('home.importTitle') }}</div>
      <div class="text-sm text-neutral-400">{{ t('home.importDesc') }}</div>
    </RouterLink>
  </div>
</template>
