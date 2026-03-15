import type { Database, SqlValue } from 'sql.js'
import { readAscii, readUtf16LE, u16LE, u32LE, u64LE } from './binary'
import type { HouseCatEntry } from './houseState'
import { parseHouseState } from './houseState'
import { decompressCatBlob } from './lz4'
import { openDatabase, queryAllRows, queryBlob } from './sqlite'

export interface CatInfoIssue {
  severity: 'warn' | 'error'
  message: string
}

export interface CatInfoStats {
  str: number
  dex: number
  con: number
  int: number
  spd: number
  cha: number
  luck: number
}

export interface CatInfoFlags {
  raw: number
  offset: number
  retired: boolean
  dead: boolean
  donated: boolean
}

export interface CatInfoRecord {
  key: number
  id64: string | null
  name: string | null
  nameMethod: string | null
  sex: 'Male' | 'Female' | 'Ditto' | 'Unknown'
  className: string | null
  level: number | null
  birthdayDay: number | null
  ageDays: number | null
  ageYears: number | null
  approxBirthYear: number | null
  stats: CatInfoStats | null
  levelBonuses: CatInfoStats | null
  flags: CatInfoFlags | null
  house: HouseCatEntry | null
  issues: CatInfoIssue[]
}

export interface CatInfoResult {
  currentDay: number | null
  cats: CatInfoRecord[]
}

interface NameMeta {
  name: string | null
  nameLen: number | null
  nameEndRaw: number | null
  method: string | null
  sex: 'Male' | 'Female' | 'Ditto' | 'Unknown'
}

interface BirthdayMeta {
  className: string | null
  level: number | null
  birthdayDay: number | null
}

function toDatabaseBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

function i64LE(buf: Uint8Array, off: number): bigint {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return view.getBigInt64(off, true)
}

function isAsciiIdent(buf: Uint8Array, off: number, len: number): boolean {
  if (len <= 0) return false
  for (let i = 0; i < len; i++) {
    const c = buf[off + i]!
    if (c < 32 || c >= 127) return false
    if (c === 0) return false
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(readAscii(buf, off, len))
}

function statsFromArray(arr: number[]): CatInfoStats {
  return {
    str: arr[0]!,
    dex: arr[1]!,
    con: arr[2]!,
    int: arr[3]!,
    spd: arr[4]!,
    cha: arr[5]!,
    luck: arr[6]!
  }
}

function readCurrentDay(db: Database): number | null {
  for (const col of ['data', 'value']) {
    try {
      const rows = queryAllRows(db, `SELECT ${col} FROM properties WHERE key=?`, ['current_day'])
      if (rows.length === 0) continue
      const v = rows[0]![0]

      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        return Math.floor(v)
      }
      if (typeof v === 'string') {
        const s = v.replace(/\0/g, '').trim()
        if (/^-?\d+$/.test(s)) {
          const n = Number.parseInt(s, 10)
          return n >= 0 ? n : null
        }
      }
      if (v instanceof Uint8Array) {
        if (v.length >= 4) {
          const n = u32LE(v, 0)
          if (n <= 10_000_000) return n
        }
      }
    } catch {
      // Ignore column mismatch and continue.
    }
  }
  return null
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

function readNameFromLength(dec: Uint8Array, nameLen: number): { name: string | null, end: number } {
  if (nameLen <= 0 || nameLen > 128) return { name: null, end: 0x14 }
  const start = 0x14
  const end = start + nameLen * 2
  if (end > dec.length) return { name: null, end }
  const name = readUtf16LE(dec, start, nameLen).replace(/\0+$/, '')
  return { name: isPlausibleCatName(name) ? name : null, end }
}

function detectNameMeta(dec: Uint8Array): NameMeta {
  const sexMap: Record<number, NameMeta['sex']> = { 0: 'Male', 1: 'Female', 2: 'Ditto' }

  for (const offLen of [0x0C, 0x10]) {
    if (offLen + 4 > dec.length) continue
    const nameLen = u32LE(dec, offLen)
    const parsed = readNameFromLength(dec, nameLen)
    if (!parsed.name) continue

    let sex: NameMeta['sex'] = 'Unknown'
    const offA = parsed.end + 8
    const offB = parsed.end + 12
    if (offB + 2 <= dec.length) {
      const a = u16LE(dec, offA)
      const b = u16LE(dec, offB)
      if (a === b && a in sexMap) sex = sexMap[a]!
      else if (a in sexMap) sex = sexMap[a]!
      else if (b in sexMap) sex = sexMap[b]!
    }

    return {
      name: parsed.name,
      nameLen,
      nameEndRaw: parsed.end,
      method: `u32@0x${offLen.toString(16).toUpperCase()}`,
      sex
    }
  }

  for (const offLen of [0x0C, 0x10]) {
    if (offLen + 2 > dec.length) continue
    const nameLen16 = u16LE(dec, offLen)
    const parsed = readNameFromLength(dec, nameLen16)
    if (!parsed.name) continue
    return {
      name: parsed.name,
      nameLen: nameLen16,
      nameEndRaw: parsed.end,
      method: `u16@0x${offLen.toString(16).toUpperCase()}`,
      sex: 'Unknown'
    }
  }

  const start = 0x14
  if (start + 2 <= dec.length) {
    const maxUnits = Math.min(64, Math.floor((dec.length - start) / 2))
    let units = 0
    for (; units < maxUnits; units++) {
      if (u16LE(dec, start + units * 2) === 0) break
    }
    if (units > 0) {
      const name = readUtf16LE(dec, start, units).replace(/\0+$/, '')
      if (isPlausibleCatName(name)) {
        return {
          name,
          nameLen: units,
          nameEndRaw: start + units * 2,
          method: 'nullterm@0x14',
          sex: 'Unknown'
        }
      }
    }
  }

  return {
    name: null,
    nameLen: null,
    nameEndRaw: null,
    method: null,
    sex: 'Unknown'
  }
}

function readFlags(dec: Uint8Array, nameEndRaw: number | null): CatInfoFlags | null {
  if (nameEndRaw === null) return null
  const flagsOff = nameEndRaw + 0x10
  if (flagsOff + 2 > dec.length) return null

  const raw = u16LE(dec, flagsOff)
  return {
    raw,
    offset: flagsOff,
    retired: !!(raw & 0x0002),
    dead: !!(raw & 0x0020),
    donated: !!(raw & 0x4000)
  }
}

function findStats(dec: Uint8Array): { stats: CatInfoStats | null, levelBonuses: CatInfoStats | null } {
  const expectedOff = 0x1CC
  const window = 0x140
  const n = dec.length
  if (n < 28) return { stats: null, levelBonuses: null }

  const view = new DataView(dec.buffer, dec.byteOffset, dec.byteLength)
  const candidates: { off: number, vals: number[], score: number }[] = []

  const lo = Math.max(0, expectedOff - window)
  const hi = Math.min(n - 28, expectedOff + window)
  for (let off = lo; off <= hi; off++) {
    const vals: number[] = []
    let valid = true
    for (let i = 0; i < 7; i++) {
      const v = view.getInt32(off + i * 4, true)
      if (v < 1 || v > 10) {
        valid = false
        break
      }
      vals.push(v)
    }
    if (!valid) continue

    const dist = Math.abs(off - expectedOff)
    const score = (1000 - dist) + (vals.reduce((a, b) => a + b, 0) * 0.1)
    candidates.push({ off, vals, score })
  }

  if (candidates.length === 0) return { stats: null, levelBonuses: null }
  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]!

  const bonusOff = best.off + 28
  let levelBonuses: CatInfoStats | null = null
  if (bonusOff + 28 <= n) {
    const bonusVals: number[] = []
    let ok = true
    for (let i = 0; i < 7; i++) {
      const v = view.getInt32(bonusOff + i * 4, true)
      if (v < -10 || v > 50) {
        ok = false
        break
      }
      bonusVals.push(v)
    }
    if (ok) levelBonuses = statsFromArray(bonusVals)
  }

  return { stats: statsFromArray(best.vals), levelBonuses }
}

function findBirthdayInfo(dec: Uint8Array, currentDay: number | null): BirthdayMeta {
  const n = dec.length
  if (n < 64) return { className: null, level: null, birthdayDay: null }

  const AGE_CAP = 500_000
  const acceptBirthday = (bday: number): boolean => {
    if (currentDay == null) return true
    const age = currentDay - bday
    return age >= 0 && age <= AGE_CAP
  }

  let best: { className: string, level: number | null, birthdayDay: number, birthdayOff: number } | null = null
  const start = Math.max(0, n - 2048)

  for (let off = start; off <= n - 8; off++) {
    const ln = Number(u64LE(dec, off))
    if (ln < 3 || ln > 64) continue

    const strOff = off + 8
    const strEnd = strOff + ln
    const bdayOff = strEnd + 12
    if (bdayOff + 16 > n) continue
    if (!isAsciiIdent(dec, strOff, ln)) continue

    const bday = Number(i64LE(dec, bdayOff))
    const sentinel = i64LE(dec, bdayOff + 8)
    if (sentinel !== -1n) continue
    if (!acceptBirthday(bday)) continue

    const cls = readAscii(dec, strOff, ln)
    const level = strEnd + 4 <= n ? u32LE(dec, strEnd) : null

    if (!best || bdayOff > best.birthdayOff) {
      best = { className: cls, level, birthdayDay: bday, birthdayOff: bdayOff }
    }
  }

  if (!best) return { className: null, level: null, birthdayDay: null }
  return { className: best.className, level: best.level, birthdayDay: best.birthdayDay }
}

function getHouseMap(db: Database): Map<number, HouseCatEntry> {
  const map = new Map<number, HouseCatEntry>()
  const houseBlob = queryBlob(db, 'SELECT data FROM files WHERE key=?', ['house_state'])
  if (!houseBlob) return map
  const entries = parseHouseState(houseBlob)
  for (const entry of entries) {
    map.set(entry.key, entry)
  }
  return map
}

async function parseCatRecordAsync(
  keyValue: SqlValue,
  dataValue: SqlValue,
  currentDay: number | null,
  houseMap: Map<number, HouseCatEntry>
): Promise<CatInfoRecord | null> {
  if (typeof keyValue !== 'number') return null

  const key = keyValue
  const issues: CatInfoIssue[] = []
  const house = houseMap.get(key) ?? null

  if (!(dataValue instanceof Uint8Array)) {
    return {
      key,
      id64: null,
      name: null,
      nameMethod: null,
      sex: 'Unknown',
      className: null,
      level: null,
      birthdayDay: null,
      ageDays: null,
      ageYears: null,
      approxBirthYear: null,
      stats: null,
      levelBonuses: null,
      flags: null,
      house,
      issues: [{ severity: 'error', message: 'Cat data is not a blob' }]
    }
  }

  let dec: Uint8Array
  try {
    const decRes = await decompressCatBlob(dataValue)
    dec = decRes.data
  } catch (error) {
    return {
      key,
      id64: null,
      name: null,
      nameMethod: null,
      sex: 'Unknown',
      className: null,
      level: null,
      birthdayDay: null,
      ageDays: null,
      ageYears: null,
      approxBirthYear: null,
      stats: null,
      levelBonuses: null,
      flags: null,
      house,
      issues: [{ severity: 'error', message: `Failed to decompress cat blob: ${error instanceof Error ? error.message : String(error)}` }]
    }
  }

  if (dec.length < 12) {
    issues.push({ severity: 'error', message: `Decompressed cat blob is too small (${dec.length} bytes)` })
  }

  const id64 = dec.length >= 12 ? u64LE(dec, 4).toString() : null
  const nameMeta = detectNameMeta(dec)
  if (!nameMeta.name) {
    issues.push({ severity: 'warn', message: 'Could not determine cat name from known layouts' })
  }

  const flags = readFlags(dec, nameMeta.nameEndRaw)
  if (!flags) {
    issues.push({ severity: 'warn', message: 'Could not resolve status flags offset from name metadata' })
  }

  const statMeta = findStats(dec)
  if (!statMeta.stats) {
    issues.push({ severity: 'warn', message: 'Could not locate base stat block' })
  }

  const birthdayMeta = findBirthdayInfo(dec, currentDay)
  const birthdayDay = birthdayMeta.birthdayDay
  let ageDays: number | null = null
  let ageYears: number | null = null
  let approxBirthYear: number | null = null

  if (birthdayDay !== null && currentDay !== null) {
    const ageValue = currentDay - birthdayDay
    if (ageValue < 0) {
      issues.push({ severity: 'warn', message: 'Birthday appears to be in the future relative to current_day' })
      ageDays = null
      ageYears = null
    } else {
      // Upstream editor treats age as day-based: age = current_day - birthday_day.
      // Keep days as canonical and provide a derived year estimate for convenience only.
      ageDays = ageValue
      ageYears = Number((ageValue / 365).toFixed(2))
      approxBirthYear = Math.floor(birthdayDay / 365)
    }
  }

  return {
    key,
    id64,
    name: nameMeta.name,
    nameMethod: nameMeta.method,
    sex: nameMeta.sex,
    className: birthdayMeta.className,
    level: birthdayMeta.level,
    birthdayDay,
    ageDays,
    ageYears,
    approxBirthYear,
    stats: statMeta.stats,
    levelBonuses: statMeta.levelBonuses,
    flags,
    house,
    issues
  }
}

export async function readCatsInfo(saveBytes: ArrayBuffer | Uint8Array): Promise<CatInfoResult> {
  const db = await openDatabase(toDatabaseBuffer(saveBytes))

  try {
    return await readCatsInfoFromDatabase(db)
  } finally {
    db.close()
  }
}

export async function readCatsInfoFromDatabase(db: Database): Promise<CatInfoResult> {
  const currentDay = readCurrentDay(db)
  const houseMap = getHouseMap(db)
  const rows = queryAllRows(db, 'SELECT key, data FROM cats ORDER BY key')

  const cats: CatInfoRecord[] = []
  for (const row of rows) {
    if (row.length < 2) continue
    const keyValue = row[0]
    const dataValue = row[1]
    if (keyValue === undefined || dataValue === undefined) continue

    const record = await parseCatRecordAsync(keyValue, dataValue, currentDay, houseMap)
    if (record) cats.push(record)
  }

  return { currentDay, cats }
}
