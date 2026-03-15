import * as jpeg from 'jpeg-js'
import { describe, expect, test } from 'vitest'

import {
  embedShortTextBlindWatermark,
  extractShortTextBlindWatermark,
  type ImageDataLike,
} from '../src/utils/infoBlindWatermark'

function createSyntheticImage(width: number, height: number, seed = 0): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const offset = (row * width + column) * 4
      data[offset] = (row * (5 + seed) + column * (3 + seed * 2)) % 256
      data[offset + 1] = (row * (7 + seed * 3) + column * (11 + seed)) % 256
      data[offset + 2] = (row * (13 + seed) + column * (17 + seed * 2)) % 256
      data[offset + 3] = 255
    }
  }

  return { width, height, data }
}

function roundTripJpeg(image: ImageDataLike, quality: number): ImageDataLike {
  const encoded = jpeg.encode(
    {
      data: image.data,
      width: image.width,
      height: image.height,
    },
    quality,
  )

  const decoded = jpeg.decode(encoded.data, { useTArray: true })

  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  }
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

  test('extracts after JPEG quality recompression', () => {
    const source = createSyntheticImage(512, 512)
    const embedded = embedShortTextBlindWatermark(source, 'AbC123xyZ_-!', { password: 20260316 })
    const jpegRoundTrip = roundTripJpeg(embedded, 90)
    const extracted = extractShortTextBlindWatermark(jpegRoundTrip, { password: 20260316 })

    expect(extracted).toBe('AbC123xyZ_-!')
  })

  test('extracts after 20 sequential JPEG quality 85 recompressions', () => {
    for (let iteration = 1; iteration <= 20; iteration += 1) {
      const source = createSyntheticImage(512, 512, iteration)
      const payload = `Q85ROBUST${iteration.toString().padStart(2, '0')}`
      const password = 20260316 + iteration
      const embedded = embedShortTextBlindWatermark(source, payload, { password })
      const jpegRoundTrip = roundTripJpeg(embedded, 85)
      const extracted = extractShortTextBlindWatermark(jpegRoundTrip, { password })

      expect(extracted, `iteration ${iteration}`).toBe(payload)
    }
  })
})