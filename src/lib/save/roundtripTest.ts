import type { Database } from 'sql.js'
import { readUtf16LE, u16LE, u32LE, u64LE, writeU32LE } from './binary'
import { buildHouseStateBlob, parseHouseState, type HouseCatEntry } from './houseState'
import { decompressCatBlob, recompressCatBlob } from './lz4'
import { exportDatabase, openDatabase, queryAllRows, queryBlob, sqlHexLiteral } from './sqlite'

export interface RoundtripTestResult {
  outputSaveBytes: Uint8Array
  extractedCatBlob: Uint8Array
  report: string
}

interface CatMatch {
  key: number
  wrapped: Uint8Array
  dec: Uint8Array
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length)
  out.set(bytes)
  return out
}

function toDatabaseBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

function isPlausibleCatName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  if (trimmed.length > 64) return false

  let weird = 0
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0)
    const isAsciiPrintable = code >= 32 && code <= 126
    const isLatin1Letter = code >= 0x00C0 && code <= 0x017F
    if (!isAsciiPrintable && !isLatin1Letter) weird++
  }

  return weird <= Math.max(1, Math.floor(trimmed.length / 4))
}

function readNameFromLength(dec: Uint8Array, nameLen: number): string | null {
  if (nameLen <= 0 || nameLen > 128) {
    return null
  }

  const nameDataOffset = 0x14
  const end = nameDataOffset + nameLen * 2
  if (end > dec.length) {
    return null
  }

  const name = readUtf16LE(dec, nameDataOffset, nameLen).replace(/\0+$/, '')
  return isPlausibleCatName(name) ? name : null
}

function readNullTerminatedName(dec: Uint8Array): string | null {
  const nameDataOffset = 0x14
  if (nameDataOffset + 2 > dec.length) {
    return null
  }

  const maxUnits = Math.min(64, Math.floor((dec.length - nameDataOffset) / 2))
  let units = 0
  for (; units < maxUnits; units++) {
    const codeUnit = u16LE(dec, nameDataOffset + units * 2)
    if (codeUnit === 0) break
  }

  if (units <= 0) {
    return null
  }

  const name = readUtf16LE(dec, nameDataOffset, units).replace(/\0+$/, '')
  return isPlausibleCatName(name) ? name : null
}

function readNameMeta(dec: Uint8Array): { name: string | null, nameLen: number | null, nameDataOffset: number | null } {
  for (const offLen of [0x0C, 0x10]) {
    if (offLen + 4 > dec.length) {
      continue
    }

    const nameLen = u32LE(dec, offLen)
    const name = readNameFromLength(dec, nameLen)
    if (!name) continue

    const nameDataOffset = 0x14
    const end = nameDataOffset + nameLen * 2

    const sexAOffset = end + 8
    const sexBOffset = end + 12
    if (sexBOffset + 2 <= dec.length) {
      const sexA = u16LE(dec, sexAOffset)
      const sexB = u16LE(dec, sexBOffset)
      if (sexA === sexB || sexA <= 2 || sexB <= 2) {
        return { name, nameLen, nameDataOffset }
      }
    }

    return { name, nameLen, nameDataOffset }
  }

  for (const offLen of [0x0C, 0x10]) {
    if (offLen + 2 > dec.length) continue
    const nameLen16 = u16LE(dec, offLen)
    const name = readNameFromLength(dec, nameLen16)
    if (name) {
      return { name, nameLen: nameLen16, nameDataOffset: 0x14 }
    }
  }

  const zeroTerminated = readNullTerminatedName(dec)
  if (zeroTerminated) {
    return { name: zeroTerminated, nameLen: zeroTerminated.length, nameDataOffset: 0x14 }
  }

  return { name: null, nameLen: null, nameDataOffset: null }
}

function encodeUtf16LE(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 2)
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    out[i * 2] = code & 0xFF
    out[i * 2 + 1] = (code >> 8) & 0xFF
  }
  return out
}

function mutateNameSameLength(name: string): string {
  if (name.length < 2) {
    return name
  }
  const last = name[name.length - 1]
  if (!last) {
    return name
  }
  const replacement = last.toLowerCase() === 's' ? 'z' : 'x'
  return `${name.slice(0, -1)}${replacement}`
}

function renameInPlaceSameLength(dec: Uint8Array, newName: string): Uint8Array {
  const meta = readNameMeta(dec)
  if (!meta.name || meta.nameLen === null || meta.nameDataOffset === null) {
    throw new Error('Unable to locate cat name in decompressed blob')
  }
  if (newName.length !== meta.nameLen) {
    throw new Error(`Rename requires same length ${meta.nameLen}, got ${newName.length}`)
  }

  const out = cloneBytes(dec)
  out.set(encodeUtf16LE(newName), meta.nameDataOffset)
  return out
}

function parseAdventureStateKeys(blob: Uint8Array): { version: number, keys: number[] } {
  if (!blob || blob.length < 8) {
    return { version: 0, keys: [] }
  }

  const version = u32LE(blob, 0)
  const count = u32LE(blob, 4)
  if (count > 2048) {
    return { version, keys: [] }
  }

  const keys: number[] = []
  let off = 8
  for (let i = 0; i < count; i++) {
    if (off + 8 > blob.length) {
      return { version, keys: [] }
    }
    const packed = u64LE(blob, off)
    off += 8

    const hi = Number((packed >> 32n) & 0xFFFFFFFFn)
    const lo = Number(packed & 0xFFFFFFFFn)
    keys.push(hi !== 0 ? hi : lo)
  }

  return { version, keys }
}

function buildAdventureStateBlob(version: number, keys: number[]): Uint8Array {
  const out = new Uint8Array(8 + keys.length * 8)
  const view = new DataView(out.buffer)
  writeU32LE(out, 0, version)
  writeU32LE(out, 4, keys.length)

  let off = 8
  for (const key of keys) {
    view.setBigUint64(off, BigInt(key), true)
    off += 8
  }

  return out
}

function loadHouseEntries(db: Database): HouseCatEntry[] {
  const houseBlob = queryBlob(db, 'SELECT data FROM files WHERE key=?', ['house_state'])
  return houseBlob ? parseHouseState(houseBlob) : []
}

function nextCatKey(keys: number[]): number {
  let maxKey = 0
  for (const key of keys) {
    if (key > maxKey) {
      maxKey = key
    }
  }
  return maxKey + 1
}

async function findCatByName(db: Database, name: string): Promise<CatMatch | null> {
  const rows = queryAllRows(db, 'SELECT key, data FROM cats ORDER BY key')
  for (const [rawKey, rawData] of rows) {
    if (typeof rawKey !== 'number' || !(rawData instanceof Uint8Array)) {
      continue
    }

    const decResult = await decompressCatBlob(rawData)
    const meta = readNameMeta(decResult.data)
    if (meta.name === name) {
      return {
        key: rawKey,
        wrapped: cloneBytes(rawData),
        dec: decResult.data
      }
    }
  }
  return null
}

async function collectCatNameCandidates(db: Database, maxCount = 80): Promise<string[]> {
  const rows = queryAllRows(db, 'SELECT key, data FROM cats ORDER BY key')
  const names: string[] = []

  for (const [rawKey, rawData] of rows) {
    if (typeof rawKey !== 'number' || !(rawData instanceof Uint8Array)) {
      continue
    }

    try {
      const decResult = await decompressCatBlob(rawData)
      const meta = readNameMeta(decResult.data)
      if (meta.name) {
        names.push(meta.name)
      }
    } catch {
      // Ignore malformed rows and continue listing.
    }

    if (names.length >= maxCount) {
      break
    }
  }

  return names
}

export async function runCatRoundtripTest(
  saveBytes: ArrayBuffer | Uint8Array,
  catName = 'Kevils'
): Promise<RoundtripTestResult> {
  const db = await openDatabase(toDatabaseBuffer(saveBytes))

  try {
    const match = await findCatByName(db, catName)
    if (!match) {
      const candidates = await collectCatNameCandidates(db)
      const listing = candidates.length > 0
        ? ` Available names: ${candidates.join(', ')}`
        : ' No readable cat names found in this save.'
      throw new Error(`Could not find cat named \"${catName}\".${listing}`)
    }

    const sourceKey = match.key
    const sourceId64 = u64LE(match.dec, 4).toString()
    const extractedBlob = cloneBytes(match.wrapped)

    const originalNameMeta = readNameMeta(match.dec)
    if (!originalNameMeta.name) {
      throw new Error('Matched cat has no detectable name')
    }
    const newName = mutateNameSameLength(originalNameMeta.name)

    const houseEntries = loadHouseEntries(db)
    const oldHouseEntry = houseEntries.find((entry) => entry.key === sourceKey) ?? null

    const adventureBlobBefore = queryBlob(db, 'SELECT data FROM files WHERE key=?', ['adventure_state'])
    const adventureBefore = adventureBlobBefore ? parseAdventureStateKeys(adventureBlobBefore) : null

    db.run(`DELETE FROM cats WHERE key=${sourceKey}`)

    const houseAfterRemoval = houseEntries.filter((entry) => entry.key !== sourceKey)
    const houseOutAfterRemoval = buildHouseStateBlob(houseAfterRemoval)
    const hadHouseState = queryBlob(db, 'SELECT data FROM files WHERE key=?', ['house_state']) !== null
    if (hadHouseState) {
      db.run(`UPDATE files SET data=${sqlHexLiteral(houseOutAfterRemoval)} WHERE key='house_state'`)
    }

    if (adventureBefore) {
      const prunedAdventure = adventureBefore.keys.filter((key) => key !== sourceKey)
      const advBlob = buildAdventureStateBlob(adventureBefore.version, prunedAdventure)
      db.run(`UPDATE files SET data=${sqlHexLiteral(advBlob)} WHERE key='adventure_state'`)
    }

    const existingKeys = queryAllRows(db, 'SELECT key FROM cats ORDER BY key')
      .map((row) => row[0])
      .filter((value): value is number => typeof value === 'number')
    const insertedKey = nextCatKey(existingKeys)

    const decompressedRemoved = await decompressCatBlob(extractedBlob)
    const renamedDec = renameInPlaceSameLength(decompressedRemoved.data, newName)
    const renamedWrapped = await recompressCatBlob(renamedDec, decompressedRemoved.variant)

    db.run(`INSERT INTO cats (key, data) VALUES (${insertedKey}, ${sqlHexLiteral(renamedWrapped)})`)

    const houseBeforeInsert = loadHouseEntries(db)
    const insertedHouseEntry = oldHouseEntry
      ? { ...oldHouseEntry, key: insertedKey }
      : { key: insertedKey, room: 'Attic', unkU32: 0, p0: 0, p1: 0, p2: 0 }
    houseBeforeInsert.push(insertedHouseEntry)
    const houseOutAfterInsert = buildHouseStateBlob(houseBeforeInsert)

    if (hadHouseState) {
      db.run(`UPDATE files SET data=${sqlHexLiteral(houseOutAfterInsert)} WHERE key='house_state'`)
    } else {
      db.run(`INSERT INTO files (key, data) VALUES ('house_state', ${sqlHexLiteral(houseOutAfterInsert)})`)
    }

    const advBlobAfter = queryBlob(db, 'SELECT data FROM files WHERE key=?', ['adventure_state'])
    if (advBlobAfter) {
      const advAfter = parseAdventureStateKeys(advBlobAfter)
      const cleaned = advAfter.keys.filter((key) => key !== insertedKey)
      const advOut = buildAdventureStateBlob(advAfter.version, cleaned)
      db.run(`UPDATE files SET data=${sqlHexLiteral(advOut)} WHERE key='adventure_state'`)
    }

    const outputSaveBytes = exportDatabase(db)

    const reportLines = [
      'Roundtrip Test Complete',
      `target cat name: ${catName}`,
      `source key removed: ${sourceKey}`,
      `inserted key: ${insertedKey}`,
      `id64: ${sourceId64}`,
      `renamed: ${originalNameMeta.name} -> ${newName}`,
      `house placement: ${insertedHouseEntry.room}`,
      `extracted blob bytes: ${extractedBlob.length}`,
      `output save bytes: ${outputSaveBytes.length}`
    ]

    return {
      outputSaveBytes,
      extractedCatBlob: extractedBlob,
      report: reportLines.join('\n')
    }
  } finally {
    db.close()
  }
}