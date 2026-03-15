import {
  embedShortTextBlindWatermark,
  extractShortTextBlindWatermark,
  type ImageDataLike,
} from './infoBlindWatermark'

interface WriteShareImageOptions {
  watermarkText: string
  portraitFile?: File | null
  jpegQuality?: number
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

async function encodeCanvasAsJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Failed to encode composed share image'))
        return
      }
      resolve(result)
    }, 'image/jpeg', quality)
  })
}

function assertWatermarkLength(text: string, maxChars: number): void {
  if (text.length > maxChars) {
    throw new Error(`Watermark text must be at most ${maxChars} characters.`)
  }
}

export async function writeShareImage(options: WriteShareImageOptions): Promise<Blob> {
  const jpegQuality = options.jpegQuality ?? 0.95
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

  return await encodeCanvasAsJpeg(canvas, jpegQuality)
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
