import { describe, expect, test } from 'vitest'

import {
  embedShortTextBlindWatermark,
  extractShortTextBlindWatermark,
  type ImageDataLike,
} from '../src/utils/infoBlindWatermark'

function createSyntheticImage(width: number, height: number): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const offset = (row * width + column) * 4
      data[offset] = (row * 5 + column * 3) % 256
      data[offset + 1] = (row * 7 + column * 11) % 256
      data[offset + 2] = (row * 13 + column * 17) % 256
      data[offset + 3] = 255
    }
  }

  return { width, height, data }
}

describe('info blind watermark', () => {
  test('round-trips a 12 character payload', () => {
    const source = createSyntheticImage(256, 256)
    const embedded = embedShortTextBlindWatermark(source, 'AbC123xyZ_-!', { password: 20260316 })
    const extracted = extractShortTextBlindWatermark(embedded, { password: 20260316 })

    expect(extracted).toBe('AbC123xyZ_-!')
  })

  test('rejects non-printable or oversized payloads', () => {
    const source = createSyntheticImage(256, 256)

    expect(() => embedShortTextBlindWatermark(source, '1234567890123')).toThrow(/at most 12/)
    expect(() => embedShortTextBlindWatermark(source, 'hello\nworld')).toThrow(/printable ASCII/)
  })
})