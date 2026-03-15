import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { LocationQuery } from 'vue-router'
import { SHORT_URL_API_BASE } from '../config/share'
import { readShareImageWatermark } from '../utils/shareImage'
import {
  extractPayloadTokenFromUrl,
  parseLongShareUrl,
  parsePayloadToken,
  resolveShortShareKey,
  resolveShortShareUrl,
  type DecodedCatSharePayload,
} from '../utils/shareTransfer'

export interface DecodedImportCat {
  id64: string
  sourceKey: number
  name: string | null
  wrappedBlob: Uint8Array
}

function normalizePayload(payload: DecodedCatSharePayload): DecodedImportCat {
  return {
    id64: payload.id64,
    sourceKey: payload.key,
    name: payload.name,
    wrappedBlob: payload.wrappedBlob
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const lower = file.name.toLowerCase()
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')
}

export const useImportFlowStore = defineStore('importFlow', () => {
  const decodedCat = ref<DecodedImportCat | null>(null)
  const carrierImageFile = ref<File | null>(null)
  const targetSaveFile = ref<File | null>(null)
  const isDecoding = ref(false)
  const decodeError = ref<string | null>(null)
  const resolvedLongUrl = ref<string | null>(null)

  function clearDecodeState(): void {
    decodedCat.value = null
    decodeError.value = null
    resolvedLongUrl.value = null
  }

  function clearTargetSave(): void {
    targetSaveFile.value = null
  }

  function resetAll(): void {
    carrierImageFile.value = null
    targetSaveFile.value = null
    isDecoding.value = false
    clearDecodeState()
  }

  function setTargetSaveFile(file: File | null): void {
    targetSaveFile.value = file
  }

  async function decodeFromUrl(rawUrl: string): Promise<DecodedImportCat> {
    const trimmed = rawUrl.trim()
    if (!trimmed) {
      throw new Error('Share URL is empty.')
    }

    let longUrl = trimmed
    let parsed = await parseLongShareUrl(longUrl)

    if (!parsed) {
      longUrl = await resolveShortShareUrl(trimmed)
      parsed = await parseLongShareUrl(longUrl)
      if (!parsed) {
        throw new Error('Short URL resolved, but no valid payload was found in the long URL.')
      }
    }

    resolvedLongUrl.value = longUrl
    return normalizePayload(parsed)
  }

  async function decodeFromKey(key: string): Promise<DecodedImportCat> {
    const trimmed = key.trim()
    if (!trimmed) {
      throw new Error('Short key is empty.')
    }

    const longUrl = await resolveShortShareKey(SHORT_URL_API_BASE, trimmed)
    const parsed = await parseLongShareUrl(longUrl)
    if (!parsed) {
      throw new Error('Short key resolved, but no valid payload was found in the long URL.')
    }

    resolvedLongUrl.value = longUrl
    return normalizePayload(parsed)
  }

  async function decodeAndSet(rawUrl: string): Promise<boolean> {
    isDecoding.value = true
    decodeError.value = null
    decodedCat.value = null
    resolvedLongUrl.value = null
    clearTargetSave()

    try {
      decodedCat.value = await decodeFromUrl(rawUrl)
      return true
    } catch (error) {
      decodeError.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isDecoding.value = false
    }
  }

  async function decodeAndSetFromKey(shortKey: string): Promise<boolean> {
    isDecoding.value = true
    decodeError.value = null
    decodedCat.value = null
    resolvedLongUrl.value = null
    clearTargetSave()

    try {
      decodedCat.value = await decodeFromKey(shortKey)
      return true
    } catch (error) {
      decodeError.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isDecoding.value = false
    }
  }

  async function loadFromCarrierImage(file: File | null): Promise<boolean> {
    carrierImageFile.value = file
    clearDecodeState()
    clearTargetSave()

    if (!file) return false

    if (!isImageFile(file)) {
      decodeError.value = 'Please select a JPG/PNG/WebP image.'
      return false
    }

    try {
      const watermark = await readShareImageWatermark(file)
      if (!watermark) {
        throw new Error('No short key watermark found in this image.')
      }
      return await decodeAndSetFromKey(watermark)
    } catch (error) {
      decodeError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  async function loadFromRouteQuery(query: LocationQuery, currentUrl: string): Promise<boolean> {
    const payloadQuery = query.payload
    if (typeof payloadQuery === 'string' && payloadQuery.length > 0) {
      isDecoding.value = true
      decodeError.value = null
      decodedCat.value = null
      resolvedLongUrl.value = null
      clearTargetSave()

      try {
        const parsed = await parsePayloadToken(payloadQuery)
        if (!parsed) {
          decodeError.value = 'No valid payload was found in the URL.'
          return false
        }

        decodedCat.value = normalizePayload(parsed)
        resolvedLongUrl.value = currentUrl
        return true
      } catch (error) {
        decodeError.value = error instanceof Error ? error.message : String(error)
        return false
      } finally {
        isDecoding.value = false
      }
    }

    const shareQuery = query.share
    if (typeof shareQuery === 'string' && shareQuery.length > 0) {
      let normalized = shareQuery
      if (extractPayloadTokenFromUrl(shareQuery) === null) {
        try {
          normalized = decodeURIComponent(shareQuery)
        } catch {
          normalized = shareQuery
        }
      }
      return await decodeAndSet(normalized)
    }

    return false
  }

  return {
    decodedCat,
    carrierImageFile,
    targetSaveFile,
    isDecoding,
    decodeError,
    resolvedLongUrl,
    clearDecodeState,
    clearTargetSave,
    resetAll,
    setTargetSaveFile,
    decodeAndSet,
    decodeAndSetFromKey,
    loadFromCarrierImage,
    loadFromRouteQuery,
  }
})