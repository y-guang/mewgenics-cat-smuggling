import { readAscii, readUtf16LE, u16LE, u32LE, u64LE } from './binary'
import { decompressCatBlob, recompressCatBlob } from './lz4'
import { openDatabase, queryAllRows } from './sqlite'

export interface ImportCatBlobStats {
  str: number
  dex: number
  con: number
  int: number
  spd: number
  cha: number
  luck: number
}

export interface ImportCatBlobFlags {
  retired: boolean
  dead: boolean
  donated: boolean
}

export interface ImportCatBlobIssue {
  severity: 'warn' | 'error'
  message: string
}

export interface ImportCatBlobInfo {
  key: number
  id64: string | null
  name: string | null
  sex: 'Male' | 'Female' | 'Ditto' | 'Unknown'
  className: string | null
  level: number | null
  birthdayDay: number | null
  ageDays: number | null
  stats: ImportCatBlobStats | null
  levelBonuses: ImportCatBlobStats | null
  flags: ImportCatBlobFlags | null
  house: null
  issues: ImportCatBlobIssue[]
}

export interface ImportCatEditInfo {
  ageDays: number
  flags: ImportCatBlobFlags
}

interface NameMeta {
  name: string | null
  nameEndRaw: number | null
  sex: ImportCatBlobInfo['sex']
}

interface BirthdayLocation {
  className: string | null
  level: number | null
  birthdayDay: number | null
  birthdayOff: number | null
}

interface FlagLocation {
  raw: number
  offset: number
  retired: boolean
  dead: boolean
  donated: boolean
}

function i64LE(buf: Uint8Array, off: number): bigint {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return view.getBigInt64(off, true)
}

function writeI64LE(buf: Uint8Array, off: number, value: bigint): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  view.setBigInt64(off, value, true)
}

function writeU16LE(buf: Uint8Array, off: number, value: number): void {
  buf[off] = value & 0xFF
  buf[off + 1] = (value >> 8) & 0xFF
}

function isAsciiIdent(buf: Uint8Array, off: number, len: number): boolean {
  if (len <= 0) return false
  for (let i = 0; i < len; i++) {
    const c = buf[off + i]!
    if (c < 32 || c >= 127 || c === 0) return false
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(readAscii(buf, off, len))
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
      nameEndRaw: parsed.end,
      sex
    }
  }

  for (const offLen of [0x0C, 0x10]) {
    if (offLen + 2 > dec.length) continue
    const parsed = readNameFromLength(dec, u16LE(dec, offLen))
    if (!parsed.name) continue
    return { name: parsed.name, nameEndRaw: parsed.end, sex: 'Unknown' }
  }

  return { name: null, nameEndRaw: null, sex: 'Unknown' }
}

function readFlags(dec: Uint8Array, nameEndRaw: number | null): FlagLocation | null {
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

function statsFromArray(arr: number[]): ImportCatBlobStats {
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

function findStats(dec: Uint8Array): { stats: ImportCatBlobStats | null, levelBonuses: ImportCatBlobStats | null } {
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
      const value = view.getInt32(off + i * 4, true)
      if (value < 1 || value > 10) {
        valid = false
        break
      }
      vals.push(value)
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
  let levelBonuses: ImportCatBlobStats | null = null
  if (bonusOff + 28 <= n) {
    const bonusVals: number[] = []
    let ok = true
    for (let i = 0; i < 7; i++) {
      const value = view.getInt32(bonusOff + i * 4, true)
      if (value < -10 || value > 50) {
        ok = false
        break
      }
      bonusVals.push(value)
    }
    if (ok) levelBonuses = statsFromArray(bonusVals)
  }

  return { stats: statsFromArray(best.vals), levelBonuses }
}

function findBirthdayLocation(dec: Uint8Array, currentDay: number | null): BirthdayLocation {
  const n = dec.length
  if (n < 64) return { className: null, level: null, birthdayDay: null, birthdayOff: null }

  const AGE_CAP = 500_000
  const acceptBirthday = (bday: number): boolean => {
    if (currentDay == null) return true
    const age = currentDay - bday
    return age >= 0 && age <= AGE_CAP
  }

  let best: { className: string, level: number | null, birthdayDay: number, birthdayOff: number } | null = null
  const start = Math.max(0, n - 2048)

  for (let off = start; off <= n - 8; off++) {
    const length = Number(u64LE(dec, off))
    if (length < 3 || length > 64) continue

    const strOff = off + 8
    const strEnd = strOff + length
    const bdayOff = strEnd + 12
    if (bdayOff + 16 > n) continue
    if (!isAsciiIdent(dec, strOff, length)) continue

    const bday = Number(i64LE(dec, bdayOff))
    const sentinel = i64LE(dec, bdayOff + 8)
    if (sentinel !== -1n) continue
    if (!acceptBirthday(bday)) continue

    const cls = readAscii(dec, strOff, length)
    const level = strEnd + 4 <= n ? u32LE(dec, strEnd) : null

    if (!best || bdayOff > best.birthdayOff) {
      best = { className: cls, level, birthdayDay: bday, birthdayOff: bdayOff }
    }
  }

  if (!best) {
    return { className: null, level: null, birthdayDay: null, birthdayOff: null }
  }

  return best
}

function toDatabaseBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

async function readCurrentDayFromSave(saveBytes: ArrayBuffer | Uint8Array): Promise<number | null> {
  const db = await openDatabase(toDatabaseBuffer(saveBytes))

  try {
    for (const col of ['data', 'value']) {
      try {
        const rows = queryAllRows(db, `SELECT ${col} FROM properties WHERE key=?`, ['current_day'])
        if (rows.length === 0) continue
        const value = rows[0]![0]

        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          return Math.floor(value)
        }

        if (typeof value === 'string') {
          const sanitized = value.replace(/\0/g, '').trim()
          if (/^-?\d+$/.test(sanitized)) {
            const parsed = Number.parseInt(sanitized, 10)
            return parsed >= 0 ? parsed : null
          }
        }

        if (value instanceof Uint8Array && value.length >= 4) {
          const parsed = u32LE(value, 0)
          if (parsed <= 10_000_000) return parsed
        }
      } catch {
        // Ignore column mismatch and continue.
      }
    }

    return null
  } finally {
    db.close()
  }
}

export async function parseImportCatBlob(wrappedBlob: Uint8Array, sourceKey: number, fallbackName: string | null): Promise<ImportCatBlobInfo> {
  return parseImportCatBlobWithContext(wrappedBlob, {
    sourceKey,
    fallbackName,
    currentDay: null
  })
}

export async function parseImportCatBlobWithContext(
  wrappedBlob: Uint8Array,
  context: {
    sourceKey: number
    fallbackName: string | null
    currentDay: number | null
  }
): Promise<ImportCatBlobInfo> {
  const issues: ImportCatBlobIssue[] = []
  const { data } = await decompressCatBlob(wrappedBlob)

  if (data.length < 12) {
    issues.push({ severity: 'error', message: `Decompressed cat blob is too small (${data.length} bytes)` })
  }

  const id64 = data.length >= 12 ? u64LE(data, 4).toString() : null
  const nameMeta = detectNameMeta(data)
  const flags = readFlags(data, nameMeta.nameEndRaw)
  if (!flags) {
    issues.push({ severity: 'warn', message: 'Could not resolve status flags offset from name metadata' })
  }

  const statMeta = findStats(data)
  if (!statMeta.stats) {
    issues.push({ severity: 'warn', message: 'Could not locate base stat block' })
  }

  const birthdayMeta = findBirthdayLocation(data, context.currentDay)
  if (birthdayMeta.birthdayOff === null) {
    issues.push({ severity: 'warn', message: 'Could not locate birthday metadata in the cat blob' })
  }

  let ageDays: number | null = null
  if (birthdayMeta.birthdayDay !== null && context.currentDay !== null) {
    const derivedAge = context.currentDay - birthdayMeta.birthdayDay
    ageDays = derivedAge >= 0 ? derivedAge : null
  }

  return {
    key: context.sourceKey,
    id64,
    name: nameMeta.name ?? context.fallbackName,
    sex: nameMeta.sex,
    className: birthdayMeta.className,
    level: birthdayMeta.level,
    birthdayDay: birthdayMeta.birthdayDay,
    ageDays,
    stats: statMeta.stats,
    levelBonuses: statMeta.levelBonuses,
    flags: flags ? {
      retired: flags.retired,
      dead: flags.dead,
      donated: flags.donated
    } : null,
    house: null,
    issues
  }
}

export async function buildEditedImportCatBlob(
  wrappedBlob: Uint8Array,
  info: ImportCatEditInfo,
  targetCurrentDay: number | null
): Promise<Uint8Array> {
  const { data, variant } = await decompressCatBlob(wrappedBlob)
  const editable = new Uint8Array(data.length)
  editable.set(data)

  const nameMeta = detectNameMeta(editable)
  const flags = readFlags(editable, nameMeta.nameEndRaw)
  if (flags) {
    let raw = flags.raw
    raw = info.flags.retired ? (raw | 0x0002) : (raw & ~0x0002)
    raw = info.flags.dead ? (raw | 0x0020) : (raw & ~0x0020)
    raw = info.flags.donated ? (raw | 0x4000) : (raw & ~0x4000)
    writeU16LE(editable, flags.offset, raw)
  }

  const birthdayMeta = findBirthdayLocation(editable, null)
  if (birthdayMeta.birthdayOff !== null) {
    const normalizedAgeDays = Math.max(0, Math.floor(info.ageDays))
    const referenceDay = targetCurrentDay ?? normalizedAgeDays
    const birthdayDay = referenceDay - normalizedAgeDays
    writeI64LE(editable, birthdayMeta.birthdayOff, BigInt(birthdayDay))
  }

  return recompressCatBlob(editable, variant)
}

export async function buildEditedImportCatBlobForSave(
  saveBytes: ArrayBuffer | Uint8Array,
  wrappedBlob: Uint8Array,
  info: ImportCatEditInfo
): Promise<Uint8Array> {
  const currentDay = await readCurrentDayFromSave(saveBytes)
  return buildEditedImportCatBlob(wrappedBlob, info, currentDay)
}