const utf16Decoder = new TextDecoder('utf-16le')
const asciiDecoder = new TextDecoder('ascii')

export function u16LE(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8)
}

export function u32LE(buf: Uint8Array, off: number): number {
  return (
    buf[off]!
    | (buf[off + 1]! << 8)
    | (buf[off + 2]! << 16)
    | ((buf[off + 3]! << 24) >>> 0)
  ) >>> 0
}

export function u64LE(buf: Uint8Array, off: number): bigint {
  const lo = BigInt(u32LE(buf, off))
  const hi = BigInt(u32LE(buf, off + 4))
  return lo | (hi << 32n)
}

export function f64LE(buf: Uint8Array, off: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return view.getFloat64(off, true)
}

export function writeU32LE(buf: Uint8Array, off: number, value: number): void {
  buf[off] = value & 0xFF
  buf[off + 1] = (value >> 8) & 0xFF
  buf[off + 2] = (value >> 16) & 0xFF
  buf[off + 3] = (value >> 24) & 0xFF
}

export function readUtf16LE(buf: Uint8Array, off: number, codeUnits: number): string {
  const slice = buf.slice(off, off + codeUnits * 2)
  return utf16Decoder.decode(slice).replace(/\0+$/, '')
}

export function readAscii(buf: Uint8Array, off: number, len: number): string {
  return asciiDecoder.decode(buf.slice(off, off + len))
}