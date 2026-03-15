export interface CatSharePayload {
  v: 2
  type: 'mewgenics-cat'
  id64: string
  key: number
  name: string | null
  wrappedBlob: Uint8Array
}

export interface DecodedCatSharePayload {
  v: 2
  type: 'mewgenics-cat'
  id64: string
  key: number
  name: string | null
  wrappedBlob: Uint8Array
}

interface ShortKvCreateResponse {
  key: string
}

interface ShortKvGetResponse {
  key: string
  value_b64: string
}

export interface ShortShareUrlResult {
  key: string
  shortUrl: string
}

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

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new CompressionStream('gzip'))
  const arrayBuffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  const arrayBuffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

function normalizeApiBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '')
}

function normalizeImportUrl(raw: string): URL {
  return new URL(raw)
}

export function encodeTextToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

export function decodeTextFromBase64(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64))
}

export function buildShortLookupUrl(apiBaseUrl: string, key: string): string {
  const base = normalizeApiBaseUrl(apiBaseUrl)
  return `${base}/kv/${encodeURIComponent(key)}`
}

export async function buildLongShareUrl(payload: CatSharePayload, importUrl: string): Promise<string> {
  const compact = {
    v: payload.v,
    type: payload.type,
    id64: payload.id64,
    key: payload.key,
    name: payload.name,
    data: bytesToBase64(payload.wrappedBlob)
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(compact))
  const compressed = await gzip(jsonBytes)
  const encoded = toBase64Url(bytesToBase64(compressed))

  const url = normalizeImportUrl(importUrl)
  url.searchParams.set('payload', encoded)
  return url.toString()
}

export function extractPayloadTokenFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const token = url.searchParams.get('payload')
    return token && token.length > 0 ? token : null
  } catch {
    return null
  }
}

export async function parsePayloadToken(token: string): Promise<DecodedCatSharePayload | null> {
  try {
    const compressed = base64ToBytes(fromBase64Url(token))
    const jsonBytes = await gunzip(compressed)
    const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
      v: number
      type: string
      id64: string
      key: number
      name: string | null
      data: string
    }

    if (parsed.v !== 2 || parsed.type !== 'mewgenics-cat') return null

    return {
      v: 2,
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

export async function parseLongShareUrl(rawUrl: string): Promise<DecodedCatSharePayload | null> {
  const token = extractPayloadTokenFromUrl(rawUrl)
  if (!token) return null
  return parsePayloadToken(token)
}

export async function createShortShareUrl(apiBaseUrl: string, longUrl: string): Promise<ShortShareUrlResult> {
  const base = normalizeApiBaseUrl(apiBaseUrl)
  const response = await fetch(`${base}/kv`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      value_b64: encodeTextToBase64(longUrl)
    })
  })

  if (!response.ok) {
    throw new Error(`Short URL create failed (${response.status})`)
  }

  const payload = await response.json() as ShortKvCreateResponse
  if (!payload?.key) {
    throw new Error('Short URL create response is missing key')
  }

  return {
    key: payload.key,
    shortUrl: buildShortLookupUrl(base, payload.key),
  }
}

export async function resolveShortShareUrl(shortUrl: string): Promise<string> {
  const response = await fetch(shortUrl)
  if (!response.ok) {
    throw new Error(`Short URL lookup failed (${response.status})`)
  }

  const payload = await response.json() as ShortKvGetResponse
  if (!payload?.value_b64) {
    throw new Error('Short URL lookup response is missing value_b64')
  }

  return decodeTextFromBase64(payload.value_b64)
}

export async function resolveShortShareKey(apiBaseUrl: string, key: string): Promise<string> {
  const lookupUrl = buildShortLookupUrl(apiBaseUrl, key)
  return resolveShortShareUrl(lookupUrl)
}
