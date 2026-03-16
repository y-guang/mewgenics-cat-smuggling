import { describe, expect, test } from 'vitest'

import { injectPngTextChunk, readShareImagePayloadToken } from '../src/utils/shareImage'
import {
  buildLongShareUrl,
  extractPayloadTokenFromUrl,
  parsePayloadToken,
  type CatSharePayload,
} from '../src/utils/shareTransfer'

// The keyword written into the PNG tEXt chunk — must match the constant in shareImage.ts.
const PNG_TEXT_KEYWORD = 'mewgenics-payload'

/**
 * Constructs the smallest structurally valid PNG recognised by readPngTextChunk:
 *   PNG signature (8) + IHDR chunk (25) + IEND chunk (12) = 45 bytes.
 *
 * CRCs are zeroed out — readPngTextChunk only uses chunk lengths and type bytes,
 * so it doesn't matter that the CRCs are wrong.
 */
function makeMinimalPng(): Uint8Array {
  return new Uint8Array([
    // PNG signature
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    // IHDR: length = 13
    0x00, 0x00, 0x00, 0x0D,
    // type 'IHDR'
    0x49, 0x48, 0x44, 0x52,
    // data: width=1, height=1, bit_depth=8, color_type=2, compression=0, filter=0, interlace=0
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
    // CRC (zeroed — not validated by our reader)
    0x00, 0x00, 0x00, 0x00,
    // IEND: length = 0
    0x00, 0x00, 0x00, 0x00,
    // type 'IEND'
    0x49, 0x45, 0x4E, 0x44,
    // canonical IEND CRC
    0xAE, 0x42, 0x60, 0x82,
  ])
}

describe('share image PNG payload round-trip', () => {
  test('injects and recovers an arbitrary token string via tEXt chunk', async () => {
    const token = 'TESTTOKEN-AbCdEf123'
    const patched = injectPngTextChunk(makeMinimalPng(), PNG_TEXT_KEYWORD, token)
    const blob = new Blob([patched], { type: 'image/png' })

    const recovered = await readShareImagePayloadToken(blob)

    expect(recovered).toBe(token)
  })

  test('recovers a real cat payload written into PNG tEXt chunk', async () => {
    const fakePayload: CatSharePayload = {
      v: 2,
      type: 'mewgenics-cat',
      id64: '76561198000000001',
      key: 7,
      name: 'Whiskers',
      wrappedBlob: new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]),
    }

    // Build the full payload token exactly as the export flow does.
    const longUrl = await buildLongShareUrl(fakePayload, 'http://localhost/#/import')
    const token = extractPayloadTokenFromUrl(longUrl)
    expect(token).toBeTruthy()

    // Simulate writing the PNG: inject the token into the image metadata.
    const patched = injectPngTextChunk(makeMinimalPng(), PNG_TEXT_KEYWORD, token!)
    const blob = new Blob([patched], { type: 'image/png' })

    // Simulate the import flow: read back from the PNG, decode to the full payload.
    const recoveredToken = await readShareImagePayloadToken(blob)
    expect(recoveredToken).toBe(token)

    const decoded = await parsePayloadToken(recoveredToken!)
    expect(decoded).not.toBeNull()
    expect(decoded!.id64).toBe(fakePayload.id64)
    expect(decoded!.key).toBe(fakePayload.key)
    expect(decoded!.name).toBe(fakePayload.name)
    expect(Array.from(decoded!.wrappedBlob)).toEqual(Array.from(fakePayload.wrappedBlob))
  })

  test('returns null for a JPEG file (type-based detection)', async () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])
    const blob = new Blob([jpegBytes], { type: 'image/jpeg' })

    expect(await readShareImagePayloadToken(blob)).toBeNull()
  })

  test('returns null for a PNG that has no tEXt payload chunk', async () => {
    const blob = new Blob([makeMinimalPng()], { type: 'image/png' })

    expect(await readShareImagePayloadToken(blob)).toBeNull()
  })

  test('detects PNG by .png filename when MIME type is absent', async () => {
    const token = 'filename-detection-test'
    const patched = injectPngTextChunk(makeMinimalPng(), PNG_TEXT_KEYWORD, token)
    // Blob type is empty; detection must rely on File.name extension.
    const file = new File([patched], 'share.png', { type: '' })

    const recovered = await readShareImagePayloadToken(file)

    expect(recovered).toBe(token)
  })
})
