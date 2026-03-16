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
                :class="locale === 'en' ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300 cursor-pointer'"
              class="px-2 py-1 transition-colors"
              @click="switchLang('en')"
            >
              {{ t('lang.en') }}
            </button>
            <span class="text-neutral-700">|</span>
            <button
              :class="locale === 'zh' ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'"
                class="px-2 py-1 transition-colors cursor-pointer"
              @click="switchLang('zh')"
            >
              {{ t('lang.zh') }}
            </button>
              <span class="text-neutral-700">|</span>
              <a
                href="https://github.com/y-guang/mewgenics-cat-smuggling"
                target="_blank"
                rel="noopener noreferrer"
                class="px-2 py-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                aria-label="GitHub repository"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
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
