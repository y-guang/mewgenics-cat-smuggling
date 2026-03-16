<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Toaster } from 'vue-sonner'
import { setLocale, type SupportedLocale } from './i18n'

const route = useRoute()
const { t, locale } = useI18n()

interface Crumb {
  label: string
  to?: string
}

const crumbs = computed<Crumb[]>(() => {
  if (route.path === '/') {
    return [{ label: t('nav.home') }]
  }

  if (route.path === '/import') {
    return [{ label: t('nav.home'), to: '/' }, { label: t('nav.import') }]
  }

  if (route.path === '/import/apply') {
    return [
      { label: t('nav.home'), to: '/' },
      { label: t('nav.import'), to: '/import' },
      { label: t('nav.chooseTargetSave') }
    ]
  }

  if (route.path === '/import/edit') {
    return [
      { label: t('nav.home'), to: '/' },
      { label: t('nav.import'), to: '/import' },
      { label: t('nav.chooseTargetSave'), to: '/import/apply' },
      { label: t('nav.editExport') }
    ]
  }

  if (route.path === '/export/upload') {
    return [{ label: t('nav.home'), to: '/' }, { label: t('nav.export') }, { label: t('nav.uploadSave') }]
  }

  if (route.path === '/export/select') {
    return [
      { label: t('nav.home'), to: '/' },
      { label: t('nav.export'), to: '/export/upload' },
      { label: t('nav.selectCat') }
    ]
  }

  if (route.path === '/export/details') {
    return [
      { label: t('nav.home'), to: '/' },
      { label: t('nav.export'), to: '/export/upload' },
      { label: t('nav.selectCat'), to: '/export/select' },
      { label: t('nav.exportSetup') }
    ]
  }

  return [{ label: t('nav.home'), to: '/' }, { label: route.name ? String(route.name) : 'Page' }]
})

function switchLang(lang: SupportedLocale): void {
  setLocale(lang)
}
</script>

<template>
  <div class="min-h-screen bg-neutral-900 text-neutral-100 p-6 md:p-10">
    <div class="max-w-4xl mx-auto space-y-8">
      <header class="space-y-2">
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">{{ t('app.title') }}</h1>
          <div class="flex items-center gap-1 text-xs">
            <button
              :class="locale === 'en' ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'"
              class="px-2 py-1 transition-colors"
              @click="switchLang('en')"
            >
              {{ t('lang.en') }}
            </button>
            <span class="text-neutral-700">|</span>
            <button
              :class="locale === 'zh' ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'"
              class="px-2 py-1 transition-colors"
              @click="switchLang('zh')"
            >
              {{ t('lang.zh') }}
            </button>
          </div>
        </div>
        <nav class="text-xs text-neutral-500">
          <ol class="flex items-center gap-2 flex-wrap">
            <li v-for="(crumb, index) in crumbs" :key="`${crumb.label}-${index}`" class="flex items-center gap-2">
              <RouterLink
                v-if="crumb.to"
                :to="crumb.to"
                class="hover:text-neutral-300 transition-colors"
              >
                {{ crumb.label }}
              </RouterLink>
              <span v-else class="text-neutral-300">{{ crumb.label }}</span>
              <span v-if="index < crumbs.length - 1" aria-hidden="true">/</span>
            </li>
          </ol>
        </nav>
      </header>

      <RouterView />
    </div>

    <Toaster position="top-right" rich-colors />
  </div>
</template>
