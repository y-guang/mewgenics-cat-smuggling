const envShortApiBase = import.meta.env.VITE_SHORT_URL_API_BASE as string | undefined
const envShortApiBaseDev = import.meta.env.VITE_SHORT_URL_API_BASE_DEV as string | undefined
const envShortApiBaseProd = import.meta.env.VITE_SHORT_URL_API_BASE_PROD as string | undefined

const DEFAULT_DEV_SHORT_URL_API_BASE = 'http://127.0.0.1:8787'
const DEFAULT_PROD_SHORT_URL_API_BASE = 'https://example.com'

function normalize(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveShortUrlApiBase(): string {
  const direct = normalize(envShortApiBase)
  if (direct) return direct

  if (import.meta.env.DEV) {
    return normalize(envShortApiBaseDev) ?? DEFAULT_DEV_SHORT_URL_API_BASE
  }

  return normalize(envShortApiBaseProd) ?? DEFAULT_PROD_SHORT_URL_API_BASE
}

export const SHORT_URL_API_BASE = resolveShortUrlApiBase()
