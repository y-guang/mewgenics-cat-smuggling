export interface CatSharePayload {
  v: 1
  type: 'mewgenics-cat'
  id64: string
  key: number
  name: string | null
  wrappedBlob: Uint8Array
}

export interface DecodedCatSharePayload {
  v: 1
  type: 'mewgenics-cat'
  id64: string
  key: number
  name: string | null
  wrappedBlob: Uint8Array
}

const PREFIX = 'MCS1:'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad === 0) return base64
  return `${base64}${'='.repeat(4 - pad)}`
}

export function buildCatShareText(payload: CatSharePayload): string {
  const compact = {
    v: payload.v,
    type: payload.type,
    id64: payload.id64,
    key: payload.key,
    name: payload.name,
    data: bytesToBase64(payload.wrappedBlob)
  }

  const json = JSON.stringify(compact)
  const utf8 = new TextEncoder().encode(json)
  return `${PREFIX}${toBase64Url(bytesToBase64(utf8))}`
}

export function parseCatShareText(text: string): DecodedCatSharePayload | null {
  if (!text.startsWith(PREFIX)) return null

  try {
    const encoded = text.slice(PREFIX.length)
    const jsonBytes = base64ToBytes(fromBase64Url(encoded))
    const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
      v: number
      type: string
      id64: string
      key: number
      name: string | null
      data: string
    }

    if (parsed.v !== 1 || parsed.type !== 'mewgenics-cat') return null

    return {
      v: 1,
      type: 'mewgenics-cat',
      id64: parsed.id64,
      key: parsed.key,
      name: parsed.name,
      wrappedBlob: base64ToBytes(parsed.data)
    }
  } catch {
    return null
  }
}
