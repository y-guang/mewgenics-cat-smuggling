import {
  compressBlock as lz4CompressBlock,
  compressBound as lz4CompressBound,
  decompressBlock as lz4DecompressBlock
} from 'lz4js'
import { u32LE, writeU32LE } from './binary'

export type LZ4Variant = 'A' | 'B'

export interface DecompressResult {
  data: Uint8Array
  variant: LZ4Variant
}

function decodeRawBlock(input: Uint8Array, uncompressedLength: number): Uint8Array {
  const out = new Uint8Array(uncompressedLength)
  const written = lz4DecompressBlock(input, out, 4, input.length - 4, 0)
  if (written !== uncompressedLength) {
    throw new Error(`LZ4 decompression failed: size mismatch (${written} != ${uncompressedLength})`)
  }
  return out
}

function encodeRawBlock(data: Uint8Array): Uint8Array {
  const dst = new Uint8Array(lz4CompressBound(data.length))
  const hashTable = new Uint32Array(1 << 16)
  const written = lz4CompressBlock(data, dst, 0, data.length, hashTable)
  if (written <= 0) {
    throw new Error('LZ4 compression failed')
  }

  const out = new Uint8Array(4 + written)
  writeU32LE(out, 0, data.length)
  out.set(dst.subarray(0, written), 4)
  return out
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
        return { data: decodeRawBlock(candidate, uncompressedLength), variant: 'B' }
      } catch {
        // Fall through to variant A.
      }
    }
  }

  return { data: decodeRawBlock(wrapped, uncompressedLength), variant: 'A' }
}

export async function recompressCatBlob(data: Uint8Array, variant: LZ4Variant): Promise<Uint8Array> {
  const compressed = encodeRawBlock(data)

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