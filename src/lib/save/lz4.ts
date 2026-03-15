import { compress as lz4Compress, decompress as lz4Decompress } from 'lz4-wasm'
import { u32LE, writeU32LE } from './binary'

export type LZ4Variant = 'A' | 'B'

export interface DecompressResult {
  data: Uint8Array
  variant: LZ4Variant
}

export async function decompressCatBlob(wrapped: Uint8Array): Promise<DecompressResult> {
  if (wrapped.length < 4) {
    throw new Error('Wrapped blob too small')
  }

  const uncompressedLength = u32LE(wrapped, 0)

  if (wrapped.length >= 8) {
    const compressedLength = u32LE(wrapped, 4)
    if (compressedLength > 0 && compressedLength <= wrapped.length - 8) {
      try {
        const candidate = new Uint8Array(4 + compressedLength)
        writeU32LE(candidate, 0, uncompressedLength)
        candidate.set(wrapped.subarray(8, 8 + compressedLength), 4)
        const data = lz4Decompress(candidate)
        if (data.length === uncompressedLength) {
          return { data, variant: 'B' }
        }
      } catch {
        // Fall through to variant A.
      }
    }
  }

  const data = lz4Decompress(wrapped)
  if (data.length !== uncompressedLength) {
    throw new Error('LZ4 decompression failed: size mismatch')
  }

  return { data, variant: 'A' }
}

export async function recompressCatBlob(data: Uint8Array, variant: LZ4Variant): Promise<Uint8Array> {
  const compressed = lz4Compress(data)

  if (variant === 'A') {
    return compressed
  }

  const rawStream = compressed.subarray(4)
  const result = new Uint8Array(8 + rawStream.length)
  writeU32LE(result, 0, data.length)
  writeU32LE(result, 4, rawStream.length)
  result.set(rawStream, 8)
  return result
}