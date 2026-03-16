<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Toaster } from 'vue-sonner'

const route = useRoute()

interface Crumb {
  label: string
  to?: string
}

const crumbs = computed<Crumb[]>(() => {
  if (route.path === '/') {
    return [{ label: 'Home' }]
  }

  if (route.path === '/import') {
    return [{ label: 'Home', to: '/' }, { label: 'Import' }]
  }

  if (route.path === '/import/apply') {
    return [
      { label: 'Home', to: '/' },
      { label: 'Import', to: '/import' },
      { label: 'Choose Target Save' }
    ]
  }

  if (route.path === '/import/edit') {
    return [
      { label: 'Home', to: '/' },
      { label: 'Import', to: '/import' },
      { label: 'Choose Target Save', to: '/import/apply' },
      { label: 'Edit & Export' }
    ]
  }

  if (route.path === '/export/upload') {
    return [{ label: 'Home', to: '/' }, { label: 'Export' }, { label: 'Upload Save' }]
  }

  if (route.path === '/export/select') {
    return [
      { label: 'Home', to: '/' },
      { label: 'Export', to: '/export/upload' },
      { label: 'Select Cat' }
    ]
  }

  if (route.path === '/export/details') {
    return [
      { label: 'Home', to: '/' },
      { label: 'Export', to: '/export/upload' },
      { label: 'Select Cat', to: '/export/select' },
      { label: 'Export Setup' }
    ]
  }

  return [{ label: 'Home', to: '/' }, { label: route.name ? String(route.name) : 'Page' }]
})
</script>

<template>
  <div class="min-h-screen bg-neutral-900 text-neutral-100 p-6 md:p-10">
    <div class="max-w-4xl mx-auto space-y-8">
      <header class="space-y-2">
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">Mewgenics Cat Smuggler</h1>
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
