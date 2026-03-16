import {
  embedShortTextBlindWatermark,
  extractShortTextBlindWatermark,
  type ImageDataLike,
} from './infoBlindWatermark'

const PNG_TEXT_KEYWORD = 'mewgenics-payload'

interface WriteShareImageOptions {
  watermarkText: string
  longPayloadToken?: string
  portraitFile?: File | null
  watermarkPassword?: number
  watermarkMaxChars?: number
}

const DEFAULT_WATERMARK_PASSWORD = 20260316
const DEFAULT_WATERMARK_MAX_CHARS = 96

function readImage(fileOrBlob: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

async function encodeCanvasAsPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Failed to encode composed share image as PNG'))
        return
      }
      resolve(result)
    }, 'image/png')
  })
}

function assertWatermarkLength(text: string, maxChars: number): void {
  if (text.length > maxChars) {
    throw new Error(`Watermark text must be at most ${maxChars} characters.`)
  }
}

// --- PNG tEXt chunk helpers ---

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function buildPngTextChunk(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder()
  const keyBytes = enc.encode(keyword)
  const textBytes = enc.encode(text)
  // data = keyword + NUL + text
  const data = new Uint8Array(keyBytes.length + 1 + textBytes.length)
  data.set(keyBytes, 0)
  data[keyBytes.length] = 0
  data.set(textBytes, keyBytes.length + 1)

  const typeBytes = new Uint8Array([116, 69, 88, 116]) // 'tEXt'
  const crcInput = new Uint8Array(4 + data.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(data, 4)
  const checksum = crc32(crcInput)

  // chunk = 4 (length) + 4 (type) + data + 4 (crc)
  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length, false)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, checksum, false)
  return chunk
}

export function injectPngTextChunk(pngBytes: Uint8Array, keyword: string, text: string): Uint8Array {
  // PNG signature = 8 bytes; IHDR = 4+4+13+4 = 25 bytes → insert after offset 33
  const INSERT_OFFSET = 8 + 4 + 4 + 13 + 4 // 33
  const textChunk = buildPngTextChunk(keyword, text)
  const result = new Uint8Array(pngBytes.length + textChunk.length)
  result.set(pngBytes.subarray(0, INSERT_OFFSET), 0)
  result.set(textChunk, INSERT_OFFSET)
  result.set(pngBytes.subarray(INSERT_OFFSET), INSERT_OFFSET + textChunk.length)
  return result
}

function readPngTextChunk(pngBytes: Uint8Array, keyword: string): string | null {
  if (pngBytes.length < 8) return null
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength)
  const dec = new TextDecoder()
  let offset = 8 // skip PNG signature
  while (offset + 12 <= pngBytes.length) {
    const dataLength = view.getUint32(offset, false)
    const type = String.fromCharCode(
      pngBytes[offset + 4]!, pngBytes[offset + 5]!,
      pngBytes[offset + 6]!, pngBytes[offset + 7]!
    )
    if (type === 'tEXt' && offset + 8 + dataLength <= pngBytes.length) {
      const data = pngBytes.subarray(offset + 8, offset + 8 + dataLength)
      const nullIdx = data.indexOf(0)
      if (nullIdx !== -1) {
        const chunkKeyword = dec.decode(data.subarray(0, nullIdx))
        if (chunkKeyword === keyword) {
          return dec.decode(data.subarray(nullIdx + 1))
        }
      }
    }
    if (type === 'IEND') break
    offset += 4 + 4 + dataLength + 4
  }
  return null
}

// Reads the full payload token embedded in PNG metadata (no network needed).
export async function readShareImagePayloadToken(fileOrBlob: File | Blob): Promise<string | null> {
  const name = fileOrBlob instanceof File ? fileOrBlob.name.toLowerCase() : ''
  const isPng = fileOrBlob.type === 'image/png' || name.endsWith('.png')
  if (!isPng) return null
  const bytes = new Uint8Array(await fileOrBlob.arrayBuffer())
  return readPngTextChunk(bytes, PNG_TEXT_KEYWORD)
}

export async function writeShareImage(options: WriteShareImageOptions): Promise<Blob> {
  const watermarkPassword = options.watermarkPassword ?? DEFAULT_WATERMARK_PASSWORD
  const watermarkMaxChars = options.watermarkMaxChars ?? DEFAULT_WATERMARK_MAX_CHARS

  assertWatermarkLength(options.watermarkText, watermarkMaxChars)

  if (!options.portraitFile) {
    throw new Error('A cover image is required to generate the share image.')
  }

  const portraitImage = await readImage(options.portraitFile)

  const canvasWidth = portraitImage.width
  const canvasHeight = portraitImage.height

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not initialize canvas context')

  ctx.drawImage(portraitImage, 0, 0, canvasWidth, canvasHeight)

  const sourcePixels = ctx.getImageData(0, 0, canvasWidth, canvasHeight)
  const embedded = embedShortTextBlindWatermark(
    {
      width: canvasWidth,
      height: canvasHeight,
      data: sourcePixels.data,
    } as ImageDataLike,
    options.watermarkText,
    {
      password: watermarkPassword,
      maxChars: watermarkMaxChars,
    }
  )

  const embeddedPixels = new ImageData(new Uint8ClampedArray(embedded.data), canvasWidth, canvasHeight)
  ctx.putImageData(embeddedPixels, 0, 0)

  const pngBlob = await encodeCanvasAsPng(canvas)

  if (!options.longPayloadToken) return pngBlob

  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer())
  const patched = injectPngTextChunk(pngBytes, PNG_TEXT_KEYWORD, options.longPayloadToken)
  return new Blob([patched], { type: 'image/png' })
}

export async function readShareImageWatermark(
  fileOrBlob: File | Blob,
  options: { watermarkPassword?: number, watermarkMaxChars?: number } = {}
): Promise<string | null> {
  const watermarkPassword = options.watermarkPassword ?? DEFAULT_WATERMARK_PASSWORD
  const watermarkMaxChars = options.watermarkMaxChars ?? DEFAULT_WATERMARK_MAX_CHARS

  const img = await readImage(fileOrBlob)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not initialize canvas context')

  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  try {
    const extracted = extractShortTextBlindWatermark(
      {
        width: canvas.width,
        height: canvas.height,
        data: imageData.data,
      },
      {
        password: watermarkPassword,
        maxChars: watermarkMaxChars,
      }
    ).trim()

    return extracted.length > 0 ? extracted : null
  } catch {
    return null
  }
}
