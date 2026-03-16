import { createI18n } from 'vue-i18n'
import en from './en'
import zh from './zh'

export type SupportedLocale = 'en' | 'zh'

const STORAGE_KEY = 'mewgenics-lang'

function detectLocale(): SupportedLocale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'zh') return stored
  const browser = navigator.language.toLowerCase()
  if (browser.startsWith('zh')) return 'zh'
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, zh },
})

document.documentElement.lang = i18n.global.locale.value

export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
}
