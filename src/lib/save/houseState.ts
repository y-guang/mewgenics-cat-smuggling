import { f64LE, readAscii, u32LE, u64LE, writeU32LE } from './binary'

export interface HouseCatEntry {
  key: number
  room: string
  unkU32: number
  p0: number
  p1: number
  p2: number
}

export interface HousePlacement {
  room: string
  unkU32: number
  p0: number
  p1: number
  p2: number
}

export const DEFAULT_SAFE_HOUSE_PLACEMENT: HousePlacement = {
  room: 'Attic',
  unkU32: 0,
  p0: 0,
  p1: 0,
  p2: 0
}

export function parseHouseState(blob: Uint8Array): HouseCatEntry[] {
  if (blob.length < 8) {
    return []
  }

  const version = u32LE(blob, 0)
  const count = u32LE(blob, 4)
  if (version !== 0 || count > 512) {
    return []
  }

  let off = 8
  const entries: HouseCatEntry[] = []

  for (let index = 0; index < count; index++) {
    if (off + 16 > blob.length) {
      return []
    }

    const key = u32LE(blob, off)
    const unkU32 = u32LE(blob, off + 4)
    const roomLength = Number(u64LE(blob, off + 8))
    const roomOffset = off + 16
    if (roomOffset + roomLength > blob.length) {
      return []
    }

    const room = readAscii(blob, roomOffset, roomLength)
    const doublesOffset = roomOffset + roomLength
    if (doublesOffset + 24 > blob.length) {
      return []
    }

    entries.push({
      key,
      room,
      unkU32,
      p0: f64LE(blob, doublesOffset),
      p1: f64LE(blob, doublesOffset + 8),
      p2: f64LE(blob, doublesOffset + 16)
    })

    off = doublesOffset + 24
  }

  return off === blob.length ? entries : []
}

export function buildHouseStateBlob(entries: HouseCatEntry[]): Uint8Array {
  let size = 8
  for (const entry of entries) {
    size += 4 + 4 + 8 + entry.room.length + 24
  }

  const buf = new Uint8Array(size)
  const view = new DataView(buf.buffer)
  writeU32LE(buf, 0, 0)
  writeU32LE(buf, 4, entries.length)

  let off = 8
  for (const entry of entries) {
    writeU32LE(buf, off, entry.key)
    writeU32LE(buf, off + 4, entry.unkU32)
    view.setBigUint64(off + 8, BigInt(entry.room.length), true)
    off += 16

    for (let index = 0; index < entry.room.length; index++) {
      buf[off + index] = entry.room.charCodeAt(index)
    }
    off += entry.room.length

    view.setFloat64(off, entry.p0, true)
    view.setFloat64(off + 8, entry.p1, true)
    view.setFloat64(off + 16, entry.p2, true)
    off += 24
  }

  return buf
}