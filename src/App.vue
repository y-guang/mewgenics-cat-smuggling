<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const showBack = computed(() => route.path !== '/')
</script>

<template>
  <div class="min-h-screen bg-neutral-900 text-neutral-100 p-6 md:p-10">
    <div class="max-w-4xl mx-auto space-y-8">
      <header class="flex items-baseline gap-4">
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">Mewgenics Cat Smuggler</h1>
        <RouterLink
          v-if="showBack"
          to="/"
          class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          ← back
        </RouterLink>
      </header>

      <RouterView />
    </div>
  </div>
</template>
