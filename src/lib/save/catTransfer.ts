import type { Database } from 'sql.js'
import { readUtf16LE, u16LE, u32LE, u64LE } from './binary'
import {
  buildHouseStateBlob,
  DEFAULT_SAFE_HOUSE_PLACEMENT,
  parseHouseState,
  type HouseCatEntry,
  type HousePlacement
} from './houseState'
import { decompressCatBlob } from './lz4'
import { exportDatabase, openDatabase, queryAllRows, queryBlob, sqlHexLiteral } from './sqlite'

export interface SaveCatSummary {
  key: number
  id64: string
  name: string | null
  isHoused: boolean
  houseEntry: HouseCatEntry | null
}

export interface ExtractedCatPayload {
  id64: string
  sourceKey: number
  name: string | null
  wrappedBlob: Uint8Array
  originalHouseEntry: HouseCatEntry | null
}

export interface ImportCatOptions {
  targetKey?: number
  allowDuplicateId64?: boolean
  housePlacement?: HousePlacement | 'preserve' | 'safe'
}

export interface ImportCatResult {
  saveBytes: Uint8Array
  importedKey: number
  importedId64: string
  houseEntry: HouseCatEntry
}

interface CatIdentity {
  id64: bigint
  name: string | null
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy
}

function toDatabaseBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

function normalizeCatId64(id64: bigint | string): bigint {
  return typeof id64 === 'bigint' ? id64 : BigInt(id64)
}

function detectName(dec: Uint8Array): string | null {
  for (const offset of [0x0C, 0x10]) {
    if (offset + 4 > dec.length) {
      continue
    }

    const nameLength = u32LE(dec, offset)
    if (nameLength === 0 || nameLength > 128) {
      continue
    }

    const nameOffset = 0x14
    const end = nameOffset + nameLength * 2
    if (end > dec.length) {
      continue
    }

    const name = readUtf16LE(dec, nameOffset, nameLength)
    if (!name) {
      continue
    }

    const sexAOffset = end + 8
    const sexBOffset = end + 12
    if (sexBOffset + 2 <= dec.length) {
      const sexA = u16LE(dec, sexAOffset)
      const sexB = u16LE(dec, sexBOffset)
      if (sexA === sexB || sexA <= 2 || sexB <= 2) {
        return name
      }
    }
  }

  return null
}

async function readCatIdentity(wrappedBlob: Uint8Array): Promise<CatIdentity> {
  const { data } = await decompressCatBlob(wrappedBlob)
  if (data.length < 12) {
    throw new Error(`Cat blob too small after decompress (${data.length} bytes)`)
  }

  return {
    id64: u64LE(data, 4),
    name: detectName(data)
  }
}

function loadHouseEntries(db: Database): HouseCatEntry[] {
  const blob = queryBlob(db, 'SELECT data FROM files WHERE key=?', ['house_state'])
  return blob ? parseHouseState(blob) : []
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

function resolvePlacement(
  key: number,
  extracted: ExtractedCatPayload,
  housePlacement: ImportCatOptions['housePlacement']
): HouseCatEntry {
  const chosen = housePlacement === 'preserve'
    ? extracted.originalHouseEntry ?? DEFAULT_SAFE_HOUSE_PLACEMENT
    : housePlacement === undefined || housePlacement === 'safe'
      ? DEFAULT_SAFE_HOUSE_PLACEMENT
      : housePlacement

  return {
    key,
    room: chosen.room,
    unkU32: chosen.unkU32,
    p0: chosen.p0,
    p1: chosen.p1,
    p2: chosen.p2
  }
}

async function collectCatSummaries(db: Database): Promise<SaveCatSummary[]> {
  const houseEntries = loadHouseEntries(db)
  const houseByKey = new Map(houseEntries.map((entry) => [entry.key, entry]))
  const rows = queryAllRows(db, 'SELECT key, data FROM cats ORDER BY key')
  const summaries: SaveCatSummary[] = []

  for (const row of rows) {
    const key = row[0]
    const data = row[1]
    if (typeof key !== 'number' || !(data instanceof Uint8Array)) {
      continue
    }

    const identity = await readCatIdentity(data)
    const houseEntry = houseByKey.get(key) ?? null
    summaries.push({
      key,
      id64: identity.id64.toString(),
      name: identity.name,
      isHoused: houseEntry !== null,
      houseEntry
    })
  }

  return summaries
}

export async function listCatsInSave(saveBytes: ArrayBuffer | Uint8Array): Promise<SaveCatSummary[]> {
  const db = await openDatabase(toDatabaseBuffer(saveBytes))
  try {
    return await collectCatSummaries(db)
  } finally {
    db.close()
  }
}

export async function extractCatById64(
  saveBytes: ArrayBuffer | Uint8Array,
  id64: bigint | string
): Promise<ExtractedCatPayload> {
  const targetId = normalizeCatId64(id64)
  const db = await openDatabase(toDatabaseBuffer(saveBytes))

  try {
    const houseEntries = loadHouseEntries(db)
    const houseByKey = new Map(houseEntries.map((entry) => [entry.key, entry]))
    const rows = queryAllRows(db, 'SELECT key, data FROM cats ORDER BY key')

    for (const row of rows) {
      const key = row[0]
      const data = row[1]
      if (typeof key !== 'number' || !(data instanceof Uint8Array)) {
        continue
      }

      const identity = await readCatIdentity(data)
      if (identity.id64 !== targetId) {
        continue
      }

      return {
        id64: identity.id64.toString(),
        sourceKey: key,
        name: identity.name,
        wrappedBlob: cloneBytes(data),
        originalHouseEntry: houseByKey.get(key) ?? null
      }
    }
  } finally {
    db.close()
  }

  throw new Error(`Cat id64 ${targetId.toString()} was not found in the save`)
}

export async function importCatIntoSave(
  saveBytes: ArrayBuffer | Uint8Array,
  extracted: ExtractedCatPayload,
  options: ImportCatOptions = {}
): Promise<ImportCatResult> {
  const db = await openDatabase(toDatabaseBuffer(saveBytes))

  try {
    const rows = queryAllRows(db, 'SELECT key, data FROM cats ORDER BY key')
    const existingKeys: number[] = []

    for (const row of rows) {
      const key = row[0]
      const data = row[1]
      if (typeof key !== 'number') {
        continue
      }

      existingKeys.push(key)

      if (!options.allowDuplicateId64 && data instanceof Uint8Array) {
        const identity = await readCatIdentity(data)
        if (identity.id64.toString() === extracted.id64) {
          throw new Error(`Target save already contains cat id64 ${extracted.id64} at key ${key}`)
        }
      }
    }

    const importedKey = options.targetKey ?? nextCatKey(existingKeys)
    if (existingKeys.includes(importedKey)) {
      throw new Error(`Target cat key ${importedKey} already exists in the save`)
    }

    const houseEntries = loadHouseEntries(db)
    const houseEntry = resolvePlacement(importedKey, extracted, options.housePlacement)
    const nextHouseEntries = houseEntries.filter((entry) => entry.key !== importedKey)
    nextHouseEntries.push(houseEntry)

    db.run(`INSERT INTO cats (key, data) VALUES (${importedKey}, ${sqlHexLiteral(extracted.wrappedBlob)})`)

    const houseBlob = buildHouseStateBlob(nextHouseEntries)
    const hasHouseState = queryBlob(db, 'SELECT data FROM files WHERE key=?', ['house_state']) !== null
    if (hasHouseState) {
      db.run(`UPDATE files SET data=${sqlHexLiteral(houseBlob)} WHERE key='house_state'`)
    } else {
      db.run(`INSERT INTO files (key, data) VALUES ('house_state', ${sqlHexLiteral(houseBlob)})`)
    }

    return {
      saveBytes: exportDatabase(db),
      importedKey,
      importedId64: extracted.id64,
      houseEntry
    }
  } finally {
    db.close()
  }
}