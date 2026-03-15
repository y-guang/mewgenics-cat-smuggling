import jsQR from 'jsqr'
import * as QRCode from 'qrcode'

interface WriteShareImageOptions {
  qrText: string
  portraitFile?: File | null
  defaultInfoRows?: Array<{ label: string, value: string }>
  qrSize?: number
  padding?: number
  backgroundColor?: string
  jpegQuality?: number
}

interface InfoCardLayout {
  height: number
  rowHeight: number
}

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

function readDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load generated QR image'))
    img.src = dataUrl
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

  return { height: cardHeight, rowHeight }
}

export async function writeShareImage(options: WriteShareImageOptions): Promise<Blob> {
  const qrSize = options.qrSize ?? 420
  const padding = options.padding ?? 24
  const backgroundColor = options.backgroundColor ?? '#ffffff'
  const jpegQuality = options.jpegQuality ?? 0.95

  const portraitImage = options.portraitFile ? await readImage(options.portraitFile) : null

  // Content width rules:
  // 1) QR must be at least qrSize.
  // 2) If portrait is narrower than qrSize, upscale portrait to qrSize.
  // 3) If portrait is wider than QR target, upscale QR to portrait width.
  const targetContentWidth = portraitImage
    ? Math.max(qrSize, portraitImage.width)
    : qrSize

  const qrDataUrl = await QRCode.toDataURL(options.qrText, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: targetContentWidth
  })

  const qrImage = await readDataUrlImage(qrDataUrl)

  const portraitRatio = portraitImage ? targetContentWidth / portraitImage.width : 1
  const portraitDrawWidth = portraitImage ? targetContentWidth : 0
  const portraitDrawHeight = portraitImage ? Math.round(portraitImage.height * portraitRatio) : 0

  const infoRows = !portraitImage ? (options.defaultInfoRows ?? []) : []
  const infoCardHeight = infoRows.length > 0 ? measureInfoCardHeight(infoRows, 28) : 0
  const infoGap = infoRows.length > 0 ? 20 : 0

  const contentWidth = Math.max(qrImage.width, portraitDrawWidth, targetContentWidth)
  const canvasWidth = contentWidth + padding * 2
  const gap = portraitImage ? 20 : 0
  const canvasHeight = padding * 2 + portraitDrawHeight + gap + infoCardHeight + infoGap + qrImage.height

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

  const qrX = Math.floor((canvasWidth - qrImage.width) / 2)
  ctx.drawImage(qrImage, qrX, y, qrImage.width, qrImage.height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Failed to encode composed share image'))
        return
      }
      resolve(result)
    }, 'image/jpeg', jpegQuality)
  })

  return blob
}

export async function readShareImage(fileOrBlob: File | Blob): Promise<string | null> {
  const img = await readImage(fileOrBlob)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not initialize canvas context')

  ctx.drawImage(img, 0, 0)

  const full = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const decodedFull = jsQR(full.data, full.width, full.height)
  if (decodedFull?.data) return decodedFull.data

  const cropY = Math.floor(canvas.height * 0.5)
  const cropped = ctx.getImageData(0, cropY, canvas.width, canvas.height - cropY)
  const decodedBottom = jsQR(cropped.data, cropped.width, cropped.height)
  return decodedBottom?.data ?? null
}
