import {
  embedShortTextBlindWatermark,
  extractShortTextBlindWatermark,
  type ImageDataLike,
} from './infoBlindWatermark'

interface WriteShareImageOptions {
  watermarkText: string
  portraitFile?: File | null
  defaultInfoRows?: Array<{ label: string, value: string }>
  padding?: number
  backgroundColor?: string
  jpegQuality?: number
  watermarkPassword?: number
  watermarkMaxChars?: number
}

interface InfoCardLayout {
  height: number
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

function measureInfoCardHeight(rows: Array<{ label: string, value: string }>, rowHeight: number): number {
  const titleHeight = 40
  const verticalPadding = 18
  const bodyHeight = rows.length * rowHeight
  return titleHeight + bodyHeight + verticalPadding
}

function drawInfoCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  rows: Array<{ label: string, value: string }>
): InfoCardLayout {
  const rowHeight = 28
  const cardHeight = measureInfoCardHeight(rows, rowHeight)

  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(x, y, width, cardHeight)

  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, cardHeight - 1)

  ctx.fillStyle = '#111827'
  ctx.font = '600 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.fillText('Cat Info', x + 18, y + 28)

  const labelX = x + 18
  const valueX = x + Math.floor(width * 0.38)
  const maxValueWidth = width - (valueX - x) - 18
  const startY = y + 56

  ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.fillStyle = '#4b5563'
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const lineY = startY + i * rowHeight
    ctx.fillText(row.label, labelX, lineY)

    ctx.fillStyle = '#111827'
    ctx.font = '400 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText(row.value, valueX, lineY, maxValueWidth)

    ctx.fillStyle = '#4b5563'
    ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  }

  return { height: cardHeight }
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
  const padding = options.padding ?? 24
  const backgroundColor = options.backgroundColor ?? '#ffffff'
  const jpegQuality = options.jpegQuality ?? 0.95
  const watermarkPassword = options.watermarkPassword ?? DEFAULT_WATERMARK_PASSWORD
  const watermarkMaxChars = options.watermarkMaxChars ?? DEFAULT_WATERMARK_MAX_CHARS

  assertWatermarkLength(options.watermarkText, watermarkMaxChars)

  const portraitImage = options.portraitFile ? await readImage(options.portraitFile) : null
  const infoRows = !portraitImage ? (options.defaultInfoRows ?? []) : []

  const contentWidth = portraitImage ? portraitImage.width : 960
  const portraitDrawWidth = portraitImage ? portraitImage.width : 0
  const portraitDrawHeight = portraitImage ? portraitImage.height : 0
  const infoCardHeight = infoRows.length > 0 ? measureInfoCardHeight(infoRows, 28) : 0
  const infoGap = infoRows.length > 0 ? 20 : 0
  const canvasWidth = contentWidth + padding * 2
  const gap = portraitImage ? 20 : 0
  const footerHeight = 60
  const canvasHeight = padding * 2 + portraitDrawHeight + gap + infoCardHeight + infoGap + footerHeight

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not initialize canvas context')

  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  let y = padding

  if (portraitImage) {
    const x = Math.floor((canvasWidth - portraitDrawWidth) / 2)
    ctx.drawImage(portraitImage, x, y, portraitDrawWidth, portraitDrawHeight)
    y += portraitDrawHeight + gap
  }

  if (infoRows.length > 0) {
    const infoX = Math.floor((canvasWidth - contentWidth) / 2)
    const layout = drawInfoCard(ctx, infoX, y, contentWidth, infoRows)
    y += layout.height + infoGap
  }

  ctx.fillStyle = '#111827'
  ctx.font = '600 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.fillText('Cat Share Image', padding, y + 28)
  ctx.fillStyle = '#6b7280'
  ctx.font = '400 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  ctx.fillText('Contains blind watermark with short URL for import.', padding, y + 50)

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
