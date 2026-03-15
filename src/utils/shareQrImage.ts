import jsQR from 'jsqr'
import * as QRCode from 'qrcode'

interface WriteShareImageOptions {
  qrText: string
  portraitFile?: File | null
  qrSize?: number
  padding?: number
  backgroundColor?: string
  jpegQuality?: number
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

  const contentWidth = Math.max(qrImage.width, portraitDrawWidth, targetContentWidth)
  const canvasWidth = contentWidth + padding * 2
  const gap = portraitImage ? 20 : 0
  const canvasHeight = padding * 2 + portraitDrawHeight + gap + qrImage.height

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
