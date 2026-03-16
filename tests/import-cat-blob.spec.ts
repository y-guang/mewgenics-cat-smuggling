import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import initSqlJs from 'sql.js'

import { extractCatByKey, readCatsInfoFromDatabase } from '../src/lib/save'
import { buildEditedImportCatBlobForSave, parseImportCatBlobWithContext } from '../src/lib/save/importCatBlob'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'steamcampaign01.truth.sav')

const KEVILS = {
  key: 1657,
  ageDays: 5,
  stats: { str: 7, dex: 7, con: 7, int: 7, spd: 7, cha: 7, luck: 7 }
} as const

async function loadFixtureBytes(): Promise<Uint8Array> {
  const buf = await readFile(FIXTURE_PATH)
  return new Uint8Array(buf)
}

async function loadSQL() {
  const wasmPath = path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  return await initSqlJs({ locateFile: () => wasmPath })
}

describe('import cat blob editing', () => {
  test('applies ageDays and status edits using destination save current_day while preserving stats', async () => {
    const SQL = await loadSQL()
    const fixture = await loadFixtureBytes()
    const extracted = await extractCatByKey(fixture, KEVILS.key)
    const db = new SQL.Database(fixture)
    const { currentDay } = await readCatsInfoFromDatabase(db)
    db.close()

    const before = await parseImportCatBlobWithContext(extracted.wrappedBlob, {
      sourceKey: extracted.sourceKey,
      fallbackName: extracted.name,
      currentDay
    })

    expect(before.ageDays).toBe(KEVILS.ageDays)
    expect(before.stats).toEqual(KEVILS.stats)
    expect(before.flags?.retired).toBe(false)
    expect(before.flags?.donated).toBe(false)
    expect(before.flags?.dead).toBe(false)

    const editedBlob = await buildEditedImportCatBlobForSave(fixture, extracted.wrappedBlob, {
      ageDays: 730,
      flags: {
        retired: true,
        donated: true,
        dead: false
      }
    })

    const after = await parseImportCatBlobWithContext(editedBlob, {
      sourceKey: extracted.sourceKey,
      fallbackName: extracted.name,
      currentDay
    })

    expect(after.ageDays).toBe(730)
    expect(after.stats).toEqual(KEVILS.stats)
    expect(after.flags).toEqual({ retired: true, donated: true, dead: false })
  })
})