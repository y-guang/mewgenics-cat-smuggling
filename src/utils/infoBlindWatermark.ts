const BLOCK_SIZE = 4
const DEFAULT_MAX_CHARS = 12
const LENGTH_BITS = 8
const ASCII_BITS = 7
const PRINTABLE_ASCII_MIN = 32
const PRINTABLE_ASCII_MAX = 126
const DEFAULT_PRIMARY_STEP = 36
const DEFAULT_SECONDARY_STEP = 20
const EPSILON = 1e-8

export interface ImageDataLike {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

export interface BlindWatermarkOptions {
  password?: number
  maxChars?: number
  primaryStep?: number
  secondaryStep?: number
}

interface WaveletBands {
  ll: number[][]
  lh: number[][]
  hl: number[][]
  hh: number[][]
}

export function embedShortTextBlindWatermark(
  image: ImageDataLike,
  text: string,
  options: BlindWatermarkOptions = {},
): ImageDataLike {
  const config = resolveOptions(options)
  const bits = encodeTextBits(text, config.maxChars)
  const rgba = clonePixels(image.data)
  const alpha = extractAlpha(rgba)
  const yuv = rgbaToYuv(rgba, image.width, image.height)
  const padded = padMatrixEven(yuv.y, image.width, image.height)
  const bands = dwt2Haar(padded.matrix)
  const embeddedLl = embedBitsIntoLlBand(bands.ll, bits, config)
  const reconstructed = idwt2Haar({ ...bands, ll: embeddedLl })
  const croppedY = cropMatrix(reconstructed, image.height, image.width)
  const nextPixels = yuvToRgba(croppedY, yuv.u, yuv.v, alpha)

  return {
    width: image.width,
    height: image.height,
    data: nextPixels,
  }
}

export function extractShortTextBlindWatermark(
  image: ImageDataLike,
  options: BlindWatermarkOptions = {},
): string {
  const config = resolveOptions(options)
  const rgba = image.data
  const yuv = rgbaToYuv(rgba, image.width, image.height)
  const padded = padMatrixEven(yuv.y, image.width, image.height)
  const bands = dwt2Haar(padded.matrix)
  const bits = extractBitsFromLlBand(bands.ll, totalBitCount(config.maxChars), config)

  return decodeTextBits(bits, config.maxChars)
}

function resolveOptions(options: BlindWatermarkOptions) {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 255) {
    throw new Error('maxChars must be an integer between 1 and 255')
  }

  return {
    password: options.password ?? 1,
    maxChars,
    primaryStep: options.primaryStep ?? DEFAULT_PRIMARY_STEP,
    secondaryStep: options.secondaryStep ?? DEFAULT_SECONDARY_STEP,
  }
}

function totalBitCount(maxChars: number) {
  return LENGTH_BITS + maxChars * ASCII_BITS
}

function encodeTextBits(text: string, maxChars: number) {
  if (text.length > maxChars) {
    throw new Error(`text length must be at most ${maxChars} characters`)
  }

  const bits = new Array<number>(totalBitCount(maxChars)).fill(0)
  writeIntegerBits(bits, 0, LENGTH_BITS, text.length)

  for (let index = 0; index < maxChars; index += 1) {
    const code = index < text.length ? text.charCodeAt(index) : 0
    if (index < text.length && (code < PRINTABLE_ASCII_MIN || code > PRINTABLE_ASCII_MAX)) {
      throw new Error('text must use printable ASCII characters only')
    }
    writeIntegerBits(bits, LENGTH_BITS + index * ASCII_BITS, ASCII_BITS, code)
  }

  return bits
}

function decodeTextBits(bits: number[], maxChars: number) {
  const length = readIntegerBits(bits, 0, LENGTH_BITS)
  if (length < 0 || length > maxChars) {
    throw new Error('failed to decode watermark length')
  }

  let text = ''
  for (let index = 0; index < length; index += 1) {
    const code = readIntegerBits(bits, LENGTH_BITS + index * ASCII_BITS, ASCII_BITS)
    if (code < PRINTABLE_ASCII_MIN || code > PRINTABLE_ASCII_MAX) {
      throw new Error('failed to decode printable ASCII watermark text')
    }
    text += String.fromCharCode(code)
  }

  return text
}

function writeIntegerBits(bits: number[], offset: number, bitCount: number, value: number) {
  for (let bitIndex = 0; bitIndex < bitCount; bitIndex += 1) {
    const shift = bitCount - bitIndex - 1
    bits[offset + bitIndex] = (value >> shift) & 1
  }
}

function readIntegerBits(bits: number[], offset: number, bitCount: number) {
  let value = 0
  for (let bitIndex = 0; bitIndex < bitCount; bitIndex += 1) {
    value = (value << 1) | (bits[offset + bitIndex] ?? 0)
  }
  return value
}

function clonePixels(data: Uint8Array | Uint8ClampedArray) {
  return data instanceof Uint8ClampedArray ? new Uint8ClampedArray(data) : new Uint8ClampedArray(data)
}

function extractAlpha(rgba: Uint8Array | Uint8ClampedArray) {
  const alpha = new Uint8ClampedArray(rgba.length / 4)
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = rgba[index * 4 + 3] ?? 255
  }
  return alpha
}

function rgbaToYuv(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  const y = createMatrix(height, width)
  const u = createMatrix(height, width)
  const v = createMatrix(height, width)

  for (let row = 0; row < height; row += 1) {
    const yRow = y[row]!
    const uRow = u[row]!
    const vRow = v[row]!
    for (let column = 0; column < width; column += 1) {
      const offset = (row * width + column) * 4
      const red = rgba[offset] ?? 0
      const green = rgba[offset + 1] ?? 0
      const blue = rgba[offset + 2] ?? 0

      yRow[column] = 0.299 * red + 0.587 * green + 0.114 * blue
      uRow[column] = -0.14713 * red - 0.28886 * green + 0.436 * blue
      vRow[column] = 0.615 * red - 0.51499 * green - 0.10001 * blue
    }
  }

  return { y, u, v }
}

function yuvToRgba(y: number[][], u: number[][], v: number[][], alpha: Uint8ClampedArray) {
  const height = y.length
  const width = y[0]?.length ?? 0
  const rgba = new Uint8ClampedArray(width * height * 4)

  for (let row = 0; row < height; row += 1) {
    const yRow = y[row]!
    const uRow = u[row]!
    const vRow = v[row]!
    for (let column = 0; column < width; column += 1) {
      const offset = (row * width + column) * 4
      const luminance = yRow[column] ?? 0
      const chromaU = uRow[column] ?? 0
      const chromaV = vRow[column] ?? 0

      rgba[offset] = clampByte(luminance + 1.13983 * chromaV)
      rgba[offset + 1] = clampByte(luminance - 0.39465 * chromaU - 0.5806 * chromaV)
      rgba[offset + 2] = clampByte(luminance + 2.03211 * chromaU)
      rgba[offset + 3] = alpha[row * width + column] ?? 255
    }
  }

  return rgba
}

function clampByte(value: number) {
  if (value <= 0) return 0
  if (value >= 255) return 255
  return Math.round(value)
}

function padMatrixEven(matrix: number[][], width: number, height: number) {
  const paddedWidth = width + (width % 2)
  const paddedHeight = height + (height % 2)
  if (paddedWidth === width && paddedHeight === height) {
    return { matrix }
  }

  const padded = createMatrix(paddedHeight, paddedWidth)
  for (let row = 0; row < paddedHeight; row += 1) {
    const paddedRow = padded[row]!
    const sourceRow = row < height ? matrix[row]! : null
    for (let column = 0; column < paddedWidth; column += 1) {
      paddedRow[column] = sourceRow && column < width ? (sourceRow[column] ?? 0) : 0
    }
  }

  return { matrix: padded }
}

function cropMatrix(matrix: number[][], height: number, width: number) {
  const cropped = createMatrix(height, width)
  for (let row = 0; row < height; row += 1) {
    const croppedRow = cropped[row]!
    const sourceRow = matrix[row]!
    for (let column = 0; column < width; column += 1) {
      croppedRow[column] = sourceRow[column] ?? 0
    }
  }
  return cropped
}

function createMatrix(rows: number, columns: number, fill = 0) {
  return Array.from({ length: rows }, () => Array<number>(columns).fill(fill))
}

function dwt2Haar(matrix: number[][]): WaveletBands {
  const height = matrix.length
  const width = matrix[0]?.length ?? 0
  const halfHeight = height / 2
  const halfWidth = width / 2
  const ll = createMatrix(halfHeight, halfWidth)
  const lh = createMatrix(halfHeight, halfWidth)
  const hl = createMatrix(halfHeight, halfWidth)
  const hh = createMatrix(halfHeight, halfWidth)

  for (let row = 0; row < halfHeight; row += 1) {
    const llRow = ll[row]!
    const lhRow = lh[row]!
    const hlRow = hl[row]!
    const hhRow = hh[row]!
    for (let column = 0; column < halfWidth; column += 1) {
      const sourceRow = row * 2
      const sourceColumn = column * 2
      const row0 = matrix[sourceRow]!
      const row1 = matrix[sourceRow + 1]!
      const a = row0[sourceColumn] ?? 0
      const b = row0[sourceColumn + 1] ?? 0
      const c = row1[sourceColumn] ?? 0
      const d = row1[sourceColumn + 1] ?? 0
      const low0 = (a + b) / 2
      const high0 = (a - b) / 2
      const low1 = (c + d) / 2
      const high1 = (c - d) / 2

      llRow[column] = (low0 + low1) / 2
      hlRow[column] = (low0 - low1) / 2
      lhRow[column] = (high0 + high1) / 2
      hhRow[column] = (high0 - high1) / 2
    }
  }

  return { ll, lh, hl, hh }
}

function idwt2Haar(bands: WaveletBands) {
  const halfHeight = bands.ll.length
  const halfWidth = bands.ll[0]?.length ?? 0
  const matrix = createMatrix(halfHeight * 2, halfWidth * 2)

  for (let row = 0; row < halfHeight; row += 1) {
    const llRow = bands.ll[row]!
    const lhRow = bands.lh[row]!
    const hlRow = bands.hl[row]!
    const hhRow = bands.hh[row]!
    for (let column = 0; column < halfWidth; column += 1) {
      const ll = llRow[column] ?? 0
      const lh = lhRow[column] ?? 0
      const hl = hlRow[column] ?? 0
      const hh = hhRow[column] ?? 0
      const low0 = ll + hl
      const low1 = ll - hl
      const high0 = lh + hh
      const high1 = lh - hh

      matrix[row * 2]![column * 2] = low0 + high0
      matrix[row * 2]![column * 2 + 1] = low0 - high0
      matrix[row * 2 + 1]![column * 2] = low1 + high1
      matrix[row * 2 + 1]![column * 2 + 1] = low1 - high1
    }
  }

  return matrix
}

function embedBitsIntoLlBand(ll: number[][], bits: number[], config: ReturnType<typeof resolveOptions>) {
  const blockRows = Math.floor(ll.length / BLOCK_SIZE)
  const blockColumns = Math.floor((ll[0]?.length ?? 0) / BLOCK_SIZE)
  const blockCount = blockRows * blockColumns
  if (bits.length >= blockCount) {
    throw new Error(`image is too small to embed ${bits.length} bits`)
  }

  const nextLl = ll.map(row => row.slice())
  const shuffles = buildBlockShuffles(config.password, blockCount, BLOCK_SIZE * BLOCK_SIZE)

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const bit = bits[blockIndex % bits.length] ?? 0
    const shuffle = shuffles[blockIndex]!
    const row = Math.floor(blockIndex / blockColumns)
    const column = blockIndex % blockColumns
    const block = readBlock(nextLl, row, column)
    const transformed = dct2(block)
    const shuffled = reshapeFlat(applyOrder(flattenMatrix(transformed), shuffle), BLOCK_SIZE, BLOCK_SIZE)
    const { u, s, vT } = svd4x4(shuffled)
    const adjusted = s.slice()

    adjusted[0] = quantizeSingularValue(adjusted[0] ?? 0, config.primaryStep, bit)
    if (config.secondaryStep > 0 && adjusted.length > 1) {
      adjusted[1] = quantizeSingularValue(adjusted[1] ?? 0, config.secondaryStep, bit)
    }

    const rebuiltShuffled = multiplyMatrices(multiplyMatrices(u, diagonalMatrix(adjusted)), vT)
    const rebuiltUnshuffled = invertOrder(flattenMatrix(rebuiltShuffled), shuffle)
    const restored = idct2(reshapeFlat(rebuiltUnshuffled, BLOCK_SIZE, BLOCK_SIZE))
    writeBlock(nextLl, row, column, restored)
  }

  return nextLl
}

function extractBitsFromLlBand(ll: number[][], bitCount: number, config: ReturnType<typeof resolveOptions>) {
  const blockRows = Math.floor(ll.length / BLOCK_SIZE)
  const blockColumns = Math.floor((ll[0]?.length ?? 0) / BLOCK_SIZE)
  const blockCount = blockRows * blockColumns
  if (bitCount >= blockCount) {
    throw new Error(`image is too small to extract ${bitCount} bits`)
  }

  const shuffles = buildBlockShuffles(config.password, blockCount, BLOCK_SIZE * BLOCK_SIZE)
  const rawBits = new Array<number>(blockCount).fill(0)

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const shuffle = shuffles[blockIndex]!
    const row = Math.floor(blockIndex / blockColumns)
    const column = blockIndex % blockColumns
    const block = readBlock(ll, row, column)
    const transformed = dct2(block)
    const shuffled = reshapeFlat(applyOrder(flattenMatrix(transformed), shuffle), BLOCK_SIZE, BLOCK_SIZE)
    const { s } = svd4x4(shuffled)
    let value = ((s[0] ?? 0) % config.primaryStep > config.primaryStep / 2) ? 1 : 0
    if (config.secondaryStep > 0 && s.length > 1) {
      const secondary = ((s[1] ?? 0) % config.secondaryStep > config.secondaryStep / 2) ? 1 : 0
      value = (value * 3 + secondary) / 4
    }
    rawBits[blockIndex] = value
  }

  const averagedBits = new Array<number>(bitCount).fill(0)
  for (let bitIndex = 0; bitIndex < bitCount; bitIndex += 1) {
    let sum = 0
    let count = 0
    for (let index = bitIndex; index < rawBits.length; index += bitCount) {
      sum += rawBits[index] ?? 0
      count += 1
    }
    averagedBits[bitIndex] = count === 0 ? 0 : sum / count
  }

  return oneDimKMeans(averagedBits)
}

function readBlock(matrix: number[][], blockRow: number, blockColumn: number) {
  const block = createMatrix(BLOCK_SIZE, BLOCK_SIZE)
  for (let row = 0; row < BLOCK_SIZE; row += 1) {
    const blockRowValues = block[row]!
    const matrixRow = matrix[blockRow * BLOCK_SIZE + row]!
    for (let column = 0; column < BLOCK_SIZE; column += 1) {
      blockRowValues[column] = matrixRow[blockColumn * BLOCK_SIZE + column] ?? 0
    }
  }
  return block
}

function writeBlock(matrix: number[][], blockRow: number, blockColumn: number, block: number[][]) {
  for (let row = 0; row < BLOCK_SIZE; row += 1) {
    const matrixRow = matrix[blockRow * BLOCK_SIZE + row]!
    const blockRowValues = block[row]!
    for (let column = 0; column < BLOCK_SIZE; column += 1) {
      matrixRow[blockColumn * BLOCK_SIZE + column] = blockRowValues[column] ?? 0
    }
  }
}

function dct2(block: number[][]) {
  const result = createMatrix(BLOCK_SIZE, BLOCK_SIZE)
  for (let u = 0; u < BLOCK_SIZE; u += 1) {
    const resultRow = result[u]!
    for (let v = 0; v < BLOCK_SIZE; v += 1) {
      let sum = 0
      for (let x = 0; x < BLOCK_SIZE; x += 1) {
        const blockRow = block[x]!
        for (let y = 0; y < BLOCK_SIZE; y += 1) {
          sum += (blockRow[y] ?? 0) * dctBasis(x, u) * dctBasis(y, v)
        }
      }
      resultRow[v] = alpha(u) * alpha(v) * sum
    }
  }
  return result
}

function idct2(block: number[][]) {
  const result = createMatrix(BLOCK_SIZE, BLOCK_SIZE)
  for (let x = 0; x < BLOCK_SIZE; x += 1) {
    const resultRow = result[x]!
    for (let y = 0; y < BLOCK_SIZE; y += 1) {
      let sum = 0
      for (let u = 0; u < BLOCK_SIZE; u += 1) {
        const blockRow = block[u]!
        for (let v = 0; v < BLOCK_SIZE; v += 1) {
          sum += alpha(u) * alpha(v) * (blockRow[v] ?? 0) * dctBasis(x, u) * dctBasis(y, v)
        }
      }
      resultRow[y] = sum
    }
  }
  return result
}

function alpha(index: number) {
  return index === 0 ? 1 / Math.sqrt(BLOCK_SIZE) : Math.sqrt(2 / BLOCK_SIZE)
}

function dctBasis(position: number, frequency: number) {
  return Math.cos((Math.PI * (2 * position + 1) * frequency) / (2 * BLOCK_SIZE))
}

function flattenMatrix(matrix: number[][]) {
  const flat: number[] = []
  for (const row of matrix) {
    for (const value of row) {
      flat.push(value)
    }
  }
  return flat
}

function reshapeFlat(values: number[], rows: number, columns: number) {
  const matrix = createMatrix(rows, columns)
  for (let index = 0; index < values.length; index += 1) {
    matrix[Math.floor(index / columns)]![index % columns] = values[index] ?? 0
  }
  return matrix
}

function applyOrder(values: number[], order: number[]) {
  return order.map(index => values[index] ?? 0)
}

function invertOrder(values: number[], order: number[]) {
  const restored = new Array<number>(values.length).fill(0)
  for (let index = 0; index < values.length; index += 1) {
    restored[order[index] ?? 0] = values[index] ?? 0
  }
  return restored
}

function buildBlockShuffles(seed: number, blockCount: number, elementCount: number) {
  const random = mulberry32(seed)
  return Array.from({ length: blockCount }, () => {
    const items = Array.from({ length: elementCount }, (_, index) => ({
      index,
      value: random(),
    }))
    items.sort((left, right) => left.value - right.value)
    return items.map(item => item.index)
  })
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let next = Math.imul(state ^ (state >>> 15), state | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function quantizeSingularValue(value: number, step: number, bit: number) {
  return (Math.floor(value / step) + 0.25 + 0.5 * bit) * step
}

function oneDimKMeans(values: number[]) {
  const first = values[0] ?? 0
  if (values.every(value => Math.abs(value - first) < EPSILON)) {
    return values.map(value => (value >= 0.5 ? 1 : 0))
  }

  let centerLow = Math.min(...values)
  let centerHigh = Math.max(...values)
  let threshold = (centerLow + centerHigh) / 2

  for (let iteration = 0; iteration < 300; iteration += 1) {
    const classHigh = values.filter(value => value > threshold)
    const classLow = values.filter(value => value <= threshold)
    if (classHigh.length === 0 || classLow.length === 0) {
      break
    }

    centerLow = average(classLow)
    centerHigh = average(classHigh)
    const nextThreshold = (centerLow + centerHigh) / 2
    if (Math.abs(nextThreshold - threshold) < 1e-6) {
      threshold = nextThreshold
      break
    }
    threshold = nextThreshold
  }

  return values.map(value => (value > threshold ? 1 : 0))
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function svd4x4(matrix: number[][]) {
  const transposed = transpose(matrix)
  const gram = multiplyMatrices(transposed, matrix)
  const { eigenvalues, eigenvectors } = jacobiEigenSymmetric(gram)
  const sorted = eigenvalues
    .map((value, index) => ({
      value: Math.max(0, value ?? 0),
      vector: eigenvectors.map(row => row[index]),
    }))
    .sort((left, right) => right.value - left.value)

  const singularValues = sorted.map(item => Math.sqrt(item.value))
  const v = createMatrix(BLOCK_SIZE, BLOCK_SIZE)
  for (let column = 0; column < BLOCK_SIZE; column += 1) {
    const sortedItem = sorted[column]!
    for (let row = 0; row < BLOCK_SIZE; row += 1) {
      v[row]![column] = sortedItem.vector[row] ?? 0
    }
  }

  const uColumns: number[][] = []
  for (let column = 0; column < BLOCK_SIZE; column += 1) {
    const sigma = singularValues[column] ?? 0
    if (sigma > EPSILON) {
      const vector = sorted[column]!.vector.map(value => value ?? 0)
      const av = multiplyMatrixVector(matrix, vector).map(value => value / sigma)
      uColumns.push(normalizeVector(av))
    }
  }

  const basis = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]
  for (const candidate of basis) {
    if (uColumns.length === BLOCK_SIZE) {
      break
    }
    const orthogonal = orthonormalize(candidate, uColumns)
    if (orthogonal) {
      uColumns.push(orthogonal)
    }
  }

  const u = createMatrix(BLOCK_SIZE, BLOCK_SIZE)
  for (let column = 0; column < BLOCK_SIZE; column += 1) {
    const uColumn = uColumns[column]!
    for (let row = 0; row < BLOCK_SIZE; row += 1) {
      u[row]![column] = uColumn[row] ?? 0
    }
  }

  return { u, s: singularValues, vT: transpose(v) }
}

function jacobiEigenSymmetric(matrix: number[][]) {
  const size = matrix.length
  const a = matrix.map(row => row.slice())
  const v = identityMatrix(size)

  for (let iteration = 0; iteration < 100; iteration += 1) {
    let p = 0
    let q = 1
    let maxValue = 0

    for (let row = 0; row < size; row += 1) {
      const aRow = a[row]!
      for (let column = row + 1; column < size; column += 1) {
        const candidate = Math.abs(aRow[column] ?? 0)
        if (candidate > maxValue) {
          maxValue = candidate
          p = row
          q = column
        }
      }
    }

    if (maxValue < EPSILON) {
      break
    }

    const diagonalGap = (a[q]![q] ?? 0) - (a[p]![p] ?? 0)
    const pivot = a[p]![q] ?? 0
    const tau = diagonalGap / (2 * pivot)
    const t = tau >= 0
      ? 1 / (tau + Math.sqrt(1 + tau * tau))
      : -1 / (-tau + Math.sqrt(1 + tau * tau))
    const cosine = 1 / Math.sqrt(1 + t * t)
    const sine = t * cosine

    for (let row = 0; row < size; row += 1) {
      if (row !== p && row !== q) {
        const aRow = a[row]!
        const ap = aRow[p] ?? 0
        const aq = aRow[q] ?? 0
        aRow[p] = cosine * ap - sine * aq
        a[p]![row] = aRow[p] ?? 0
        aRow[q] = cosine * aq + sine * ap
        a[q]![row] = aRow[q] ?? 0
      }
    }

    const app = a[p]![p] ?? 0
    const aqq = a[q]![q] ?? 0
    const apq = a[p]![q] ?? 0
    a[p]![p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq
    a[q]![q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq
    a[p]![q] = 0
    a[q]![p] = 0

    for (let row = 0; row < size; row += 1) {
      const vRow = v[row]!
      const vp = vRow[p] ?? 0
      const vq = vRow[q] ?? 0
      vRow[p] = cosine * vp - sine * vq
      vRow[q] = sine * vp + cosine * vq
    }
  }

  const eigenvalues = Array.from({ length: size }, (_, index) => a[index]![index] ?? 0)
  return { eigenvalues, eigenvectors: v }
}

function diagonalMatrix(values: number[]) {
  const matrix = createMatrix(values.length, values.length)
  for (let index = 0; index < values.length; index += 1) {
    matrix[index]![index] = values[index] ?? 0
  }
  return matrix
}

function identityMatrix(size: number) {
  const matrix = createMatrix(size, size)
  for (let index = 0; index < size; index += 1) {
    matrix[index]![index] = 1
  }
  return matrix
}

function multiplyMatrices(left: number[][], right: number[][]) {
  const rows = left.length
  const columns = right[0]?.length ?? 0
  const shared = right.length
  const result = createMatrix(rows, columns)

  for (let row = 0; row < rows; row += 1) {
    const leftRow = left[row]!
    const resultRow = result[row]!
    for (let column = 0; column < columns; column += 1) {
      let sum = 0
      for (let index = 0; index < shared; index += 1) {
        sum += (leftRow[index] ?? 0) * (right[index]![column] ?? 0)
      }
      resultRow[column] = sum
    }
  }

  return result
}

function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return matrix.map(row => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0))
}

function transpose(matrix: number[][]) {
  const rows = matrix.length
  const columns = matrix[0]?.length ?? 0
  const result = createMatrix(columns, rows)
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = matrix[row]!
    for (let column = 0; column < columns; column += 1) {
      result[column]![row] = sourceRow[column] ?? 0
    }
  }
  return result
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm <= EPSILON) {
    return vector.slice()
  }
  return vector.map(value => value / norm)
}

function dot(left: number[], right: number[]) {
  let sum = 0
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0)
  }
  return sum
}

function orthonormalize(candidate: number[], basis: number[][]) {
  const next = candidate.slice()
  for (const vector of basis) {
    const scale = dot(next, vector)
    for (let index = 0; index < next.length; index += 1) {
      next[index] = (next[index] ?? 0) - scale * (vector[index] ?? 0)
    }
  }

  const norm = Math.sqrt(dot(next, next))
  if (norm <= EPSILON) {
    return null
  }
  return next.map(value => value / norm)
}