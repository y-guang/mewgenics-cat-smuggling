import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import initSqlJs from 'sql.js'

import {
  buildHouseStateBlob,
  exportDatabase,
  extractCatByKey,
  importCatIntoSave,
  parseHouseState,
  readCatsInfoFromDatabase,
  sqlHexLiteral
} from '../src/lib/save'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'steamcampaign01.truth.sav')

const KEVILS = {
  key: 1657,
  id64: '18206341908042398368',
  className: 'Necromancer',
  level: 0,
  ageDays: 5,
  room: 'Floor1_Large',
  stats: { str: 7, dex: 7, con: 7, int: 7, spd: 7, cha: 7, luck: 7 }
} as const

async function loadSQL() {
  const wasmPath = path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  return await initSqlJs({ locateFile: () => wasmPath })
}

async function loadFixtureBytes(): Promise<Uint8Array> {
  const buf = await readFile(FIXTURE_PATH)
  return new Uint8Array(buf)
}

describe('read cat info', () => {
  test('reads Kevils identity and core attributes from fixture', async () => {
    const SQL = await loadSQL()
    const fixture = await loadFixtureBytes()
    const db = new SQL.Database(fixture)

    try {
      const info = await readCatsInfoFromDatabase(db)
      const kevils = info.cats.find(cat => cat.key === KEVILS.key)

      expect(kevils).toBeTruthy()
      expect(kevils?.name).toBe('Kevils')
      expect(kevils?.key).toBe(KEVILS.key)
      expect(kevils?.id64).toBe(KEVILS.id64)
      expect(kevils?.className).toBe(KEVILS.className)
      expect(kevils?.level).toBe(KEVILS.level)
      expect(kevils?.ageDays).toBe(KEVILS.ageDays)
      expect(kevils?.house?.room).toBe(KEVILS.room)
      expect(kevils?.stats).toEqual(KEVILS.stats)
      expect(kevils?.flags?.dead).toBe(false)
      expect(kevils?.flags?.retired).toBe(false)
      expect(kevils?.flags?.donated).toBe(false)
    } finally {
      db.close()
    }
  })
})

describe('get and put cat', () => {
  test('extract by key, import into save, verify new cat by new key', async () => {
    const SQL = await loadSQL()
    const fixture = await loadFixtureBytes()

    // Extract by key (not id64 – key is the stable row identifier)
    const extracted = await extractCatByKey(fixture, KEVILS.key)
    expect(extracted.id64).toBe(KEVILS.id64)
    expect(extracted.name).toBe('Kevils')

    // Build a save with all copies of Kevils removed (fixture has a pre-existing duplicate artifact)
    const db = new SQL.Database(fixture)
    let removedSave: Uint8Array
    try {
      // Remove every row whose id64 matches Kevils so the import can proceed cleanly
      const allRows = db.exec('SELECT key FROM cats')
      const SQL2 = await loadSQL()
      const scanDb = new SQL2.Database(fixture)
      try {
        const keysToRemove: number[] = []
        for (const r of allRows[0]?.values ?? []) {
          const k = r[0] as number
          const row = scanDb.exec(`SELECT data FROM cats WHERE key=${k}`)
          const blob = row[0]?.values[0]?.[0]
          if (blob instanceof Uint8Array) {
            const { extractCatByKey: ecbk } = await import('../src/lib/save')
            const tmp = await ecbk(fixture, k)
            if (tmp.id64 === KEVILS.id64) keysToRemove.push(k)
          }
        }
        for (const k of keysToRemove) {
          db.run(`DELETE FROM cats WHERE key=${k}`)
        }
      } finally {
        scanDb.close()
      }

      const houseBlob = db.prepare("SELECT data FROM files WHERE key='house_state'").getAsObject([])
        .data as Uint8Array | undefined
      if (houseBlob) {
        const { parseHouseState: ph, buildHouseStateBlob: bhsb, sqlHexLiteral: shl } = await import('../src/lib/save')
        const nextHouse = ph(houseBlob).filter(e => e.key === KEVILS.key ? false : true)
        db.run(`UPDATE files SET data=${shl(bhsb(nextHouse))} WHERE key='house_state'`)
      }
      removedSave = exportDatabase(db)
    } finally {
      db.close()
    }

    // Import Kevils back – key should be max existing key + 1
    const imported = await importCatIntoSave(removedSave, extracted, { housePlacement: 'safe' })
    expect(imported.importedId64).toBe(KEVILS.id64)

    // Read the resulting save and verify the cat is there under its new key
    const verifyDb = new SQL.Database(imported.saveBytes)
    try {
      const info = await readCatsInfoFromDatabase(verifyDb)
      const restored = info.cats.find(cat => cat.key === imported.importedKey)

      expect(restored).toBeTruthy()
      expect(restored?.id64).toBe(KEVILS.id64)
      expect(restored?.name).toBe('Kevils')
      expect(restored?.house?.room).toBe('Attic')
    } finally {
      verifyDb.close()
    }
  })
})

